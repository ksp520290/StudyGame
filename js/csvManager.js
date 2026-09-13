/**
 * csvManager.js
 * -----------------------------------------
 * Phase(未着手分の補完)：問題データのCSVインポート・エクスポート（仕様65章）。
 *
 * CSV構造（仕様65章＋追加要望対応）：
 *   id,genre,question_set,stage,question,answer,antonym,synonyms,unrelated,generate_question,note
 *
 * 【追加要望対応】question_set（道の名前）・stage（ステージ名）・note（補足情報）の列を追加した。
 *   - question_set：この行の問題をどの道（旧称：問題セット）へ取り込むかを行ごとに指定できる。
 *   - stage：この行の問題をどのステージへ取り込むかを行ごとに指定できる。
 *     question_set/stageとも、未指定の行は設定画面のインポートフォームに入力した
 *     フォールバック値が使われる。1つのファイル内で複数の道・ステージに振り分けられる。
 *   - note：問題ごとの補足情報。出題後の「正答一覧」画面で、行をクリックすると
 *     問題文・自分の回答と正答（誤答時）と合わせて表示される。
 *
 * synonyms / unrelated は questionSystem.js 側で配列として扱われるため、
 * CSVセル内ではカンマと衝突しないよう「;」区切りの複数値として保存する。
 * generate_question は仕様上フィールド名のみ定義されており用途の明記が無いため、
 * 「並び替え問題(Lv3)の出題文を、通常のprompt(question)とは別に上書きしたい場合の
 * 任意フィールド」として扱う（未指定なら通常通りquestionを使う）。判断根拠：
 * 仕様12章のLv3は「文字・単語・文章を並び替えて正答を作る」とあり、並び替え対象の
 * 文章がquestionと異なるケース（例：長文中の一文だけ並び替えさせたい）を想定した
 * 拡張フィールドと解釈した。GameState/questionSystem.js の必須項目には含めない。
 */

const CsvManager = (() => {
  // 【追加要望対応】データ管理（設定画面）のタブ化にともない、行ごとに取り込み先の
  // ステージ（道の中のステージ）まで指定できるよう "stage" 列を追加した。
  const HEADER = ["id", "genre", "question_set", "stage", "question", "answer", "antonym", "synonyms", "unrelated", "generate_question", "note"];
  const REQUIRED = ["id", "question", "answer"];
  const MULTI_FIELDS = ["synonyms", "unrelated"];

  /* ============================================================
     CSV文字列 ⇔ 行オブジェクト配列
     ============================================================ */

  // 簡易CSVパーサ（ダブルクォート囲み・エスケープ("")・改行混入セルに対応）
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    // 先頭のBOMを除去
    const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (inQuotes) {
        if (c === '"') {
          if (src[i + 1] === '"') { field += '"'; i++; }
          else { inQuotes = false; }
        } else {
          field += c;
        }
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else if (c === "\r") { /* 無視（\r\nの\r） */ }
        else field += c;
      }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
  }

  function escapeCell(value) {
    const s = value == null ? "" : String(value);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCSV(questions, genreId) {
    const lines = [HEADER.join(",")];
    questions.forEach((q) => {
      lines.push([
        q.id,
        genreId || q.genre || "",
        q.questionSetName || "",
        q.stageName || "",
        q.question,
        q.answer,
        q.antonym || "",
        (q.synonyms || []).join(";"),
        (q.unrelated || []).join(";"),
        q.generateQuestion || "",
        q.note || "",
      ].map(escapeCell).join(","));
    });
    return lines.join("\r\n");
  }

  /** 【追加要望対応】問題データのJSON出力形式。CSVと同じ列をそのままオブジェクトの形で持たせる。 */
  function toJSON(questions, meta = {}) {
    const payload = {
      exportedAt: new Date().toISOString(),
      ...meta,
      questions: questions.map((q) => ({
        id: q.id,
        genre: q.genre || "",
        questionSetName: q.questionSetName || "",
        stageName: q.stageName || "",
        question: q.question,
        answer: q.answer,
        antonym: q.antonym || "",
        synonyms: q.synonyms || [],
        unrelated: q.unrelated || [],
        generateQuestion: q.generateQuestion || "",
        note: q.note || "",
      })),
    };
    return JSON.stringify(payload, null, 2);
  }

  /* ============================================================
     インポート：バリデーション込みでCSV→questions配列に変換
     ============================================================ */

  /**
   * 【追加要望対応】idが既存データと重複した行を、エラーとして弾くのではなく
   * 「conflicts」として別集計し、呼び出し側（router.js）でユーザーに新旧どちらを
   * 残すか選ばせられるようにする。
   */
  function cleanQuestionFields(q) {
    const clean = { id: q.id, question: q.question, answer: q.answer };
    if (q.antonym) clean.antonym = q.antonym;
    if (q.synonyms && q.synonyms.length) clean.synonyms = q.synonyms;
    if (q.unrelated && q.unrelated.length) clean.unrelated = q.unrelated;
    if (q.generateQuestion) clean.generateQuestion = q.generateQuestion;
    if (q.note) clean.note = q.note;
    return clean;
  }

  /**
   * @param {string} text CSVファイルの中身
   * @param {Set<string>} existingIds 既存の問題ID（重複チェック用。ジャンル横断で渡すこと）
   * @returns {{ questions: Array, conflicts: Array, errors: Array<string>, warnings: Array<string> }}
   */
  function parseQuestionsCSV(text, existingIds = new Set()) {
    const errors = [];
    const warnings = [];
    const questions = [];
    const conflicts = [];

    let rows;
    try {
      rows = parseCSV(text);
    } catch (err) {
      return { questions: [], conflicts: [], errors: ["CSVの解析に失敗しました: " + err.message], warnings: [] };
    }

    if (rows.length === 0) {
      return { questions: [], conflicts: [], errors: ["CSVにデータ行がありません"], warnings: [] };
    }

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const missingCols = REQUIRED.filter((r) => !header.includes(r));
    if (missingCols.length > 0) {
      errors.push(`必須列が不足しています: ${missingCols.join(", ")}（ヘッダーは ${HEADER.join(",")} を推奨）`);
      return { questions: [], conflicts: [], errors, warnings };
    }

    const colIndex = {};
    header.forEach((h, i) => { colIndex[h] = i; });

    const seenInFile = new Set();

    for (let r = 1; r < rows.length; r++) {
      const raw = rows[r];
      if (raw.length === 1 && raw[0].trim() === "") continue; // 空行スキップ
      const lineNo = r + 1;
      const get = (key) => {
        const idx = colIndex[key];
        return idx == null ? "" : (raw[idx] || "").trim();
      };

      const id = get("id");
      const question = get("question");
      const answer = get("answer");

      if (!id) { errors.push(`${lineNo}行目: idが空です`); continue; }
      if (!question) { errors.push(`${lineNo}行目（id:${id}）: questionが空です`); continue; }
      if (!answer) { errors.push(`${lineNo}行目（id:${id}）: answerが空です`); continue; }

      if (seenInFile.has(id)) {
        errors.push(`${lineNo}行目: id「${id}」がファイル内で重複しています`);
        continue;
      }
      seenInFile.add(id);

      const synonyms = get("synonyms") ? get("synonyms").split(";").map((s) => s.trim()).filter(Boolean) : [];
      const unrelated = get("unrelated") ? get("unrelated").split(";").map((s) => s.trim()).filter(Boolean) : [];
      const antonym = get("antonym") || "";
      const generateQuestion = get("generate_question") || "";
      const questionSetName = get("question_set") || "";
      const stageName = get("stage") || "";
      const genre = get("genre") || "";
      const note = get("note") || "";

      if (unrelated.length === 0) {
        warnings.push(`${lineNo}行目（id:${id}）: unrelated（無関係語）が未指定です。Lv2の選択肢が少なくなる場合があります`);
      }

      const q = { id, question, answer };
      if (antonym) q.antonym = antonym;
      if (synonyms.length) q.synonyms = synonyms;
      if (unrelated.length) q.unrelated = unrelated;
      if (generateQuestion) q.generateQuestion = generateQuestion;
      if (questionSetName) q.questionSetName = questionSetName;
      if (stageName) q.stageName = stageName;
      if (genre) q.genre = genre;
      if (note) q.note = note;

      // 【追加要望対応】既存データとID重複 → エラーで弾かず「conflicts」として集計し、
      // 呼び出し側で新旧どちらを残すか選ばせる。
      if (existingIds.has(id)) {
        conflicts.push({ lineNo, id, incoming: q });
      } else {
        questions.push(q);
      }
    }

    return { questions, conflicts, errors, warnings };
  }

  /**
   * 【追加要望対応】JSON形式（toJSONの出力、または単純な配列）からのインポート。
   * parseQuestionsCSVと同じ検証・戻り値の形にそろえてある。
   * @param {string} text JSONファイルの中身
   * @param {Set<string>} existingIds 既存の問題ID（重複チェック用）
   */
  function parseQuestionsJSON(text, existingIds = new Set()) {
    const errors = [];
    const warnings = [];
    const questions = [];
    const conflicts = [];

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return { questions: [], conflicts: [], errors: ["JSONの形式が正しくありません: " + err.message], warnings: [] };
    }

    const rawList = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.questions) ? parsed.questions : null);
    if (!rawList) {
      return { questions: [], conflicts: [], errors: ["JSONの構造が不正です（questions配列、または問題の配列を指定してください）"], warnings: [] };
    }
    if (rawList.length === 0) {
      return { questions: [], conflicts: [], errors: ["JSONにデータがありません"], warnings: [] };
    }

    const seenInFile = new Set();

    rawList.forEach((raw, idx) => {
      const lineNo = idx + 1;
      const id = String(raw.id || "").trim();
      const question = String(raw.question || "").trim();
      const answer = String(raw.answer || "").trim();

      if (!id) { errors.push(`${lineNo}件目: idが空です`); return; }
      if (!question) { errors.push(`${lineNo}件目（id:${id}）: questionが空です`); return; }
      if (!answer) { errors.push(`${lineNo}件目（id:${id}）: answerが空です`); return; }

      if (seenInFile.has(id)) {
        errors.push(`${lineNo}件目: id「${id}」がファイル内で重複しています`);
        return;
      }
      seenInFile.add(id);

      const toArray = (v) => {
        if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
        if (typeof v === "string" && v) return v.split(";").map((s) => s.trim()).filter(Boolean);
        return [];
      };
      const synonyms = toArray(raw.synonyms);
      const unrelated = toArray(raw.unrelated);
      const antonym = raw.antonym ? String(raw.antonym).trim() : "";
      const generateQuestion = raw.generateQuestion ? String(raw.generateQuestion).trim() : "";
      const questionSetName = (raw.questionSetName || raw.question_set) ? String(raw.questionSetName || raw.question_set).trim() : "";
      const stageName = (raw.stageName || raw.stage) ? String(raw.stageName || raw.stage).trim() : "";
      const genre = raw.genre ? String(raw.genre).trim() : "";
      const note = raw.note ? String(raw.note).trim() : "";

      if (unrelated.length === 0) {
        warnings.push(`${lineNo}件目（id:${id}）: unrelated（無関係語）が未指定です。Lv2の選択肢が少なくなる場合があります`);
      }

      const q = { id, question, answer };
      if (antonym) q.antonym = antonym;
      if (synonyms.length) q.synonyms = synonyms;
      if (unrelated.length) q.unrelated = unrelated;
      if (generateQuestion) q.generateQuestion = generateQuestion;
      if (questionSetName) q.questionSetName = questionSetName;
      if (stageName) q.stageName = stageName;
      if (genre) q.genre = genre;
      if (note) q.note = note;

      if (existingIds.has(id)) {
        conflicts.push({ lineNo, id, incoming: q });
      } else {
        questions.push(q);
      }
    });

    return { questions, conflicts, errors, warnings };
  }

  /* ============================================================
     GameStateとの橋渡し
     ============================================================ */

  function collectAllQuestionIds(state) {
    const ids = new Set();
    (state.genres || []).forEach((g) => {
      (g.questionSets || []).forEach((qs) => {
        (qs.quests || []).forEach((quest) => {
          (quest.questions || []).forEach((q) => ids.add(q.id));
        });
      });
    });
    return ids;
  }

  function exportGenreToCSV(genre) {
    const questions = [];
    (genre.questionSets || []).forEach((qs) => {
      (qs.quests || []).forEach((quest) => {
        (quest.questions || []).forEach((q) => questions.push({ ...q, questionSetName: qs.name, stageName: quest.name }));
      });
    });
    return toCSV(questions, genre.id);
  }

  /**
   * 【追加要望対応】データ管理画面（設定→データ管理）の「全問題／エリア別／道別／ステージ別」
   * タブ共通で使う、範囲指定つきの問題データ抽出。
   * filter に指定した範囲（genreId → questionSetId → stageId の順に絞り込み）の問題を、
   * genre（ジャンルID）・questionSetName（道名）・stageName（ステージ名）を各行に
   * 付与したフラットな配列として返す（CSV/JSON双方の出力にそのまま使える形）。
   * @param {object} state GameStateの状態
   * @param {{genreId?: string, questionSetId?: string, stageId?: string}} filter
   */
  function collectQuestions(state, filter = {}) {
    const result = [];
    (state.genres || []).forEach((genre) => {
      if (filter.genreId && genre.id !== filter.genreId) return;
      (genre.questionSets || []).forEach((qs) => {
        if (filter.questionSetId && qs.id !== filter.questionSetId) return;
        (qs.quests || []).forEach((quest) => {
          if (filter.stageId && quest.id !== filter.stageId) return;
          (quest.questions || []).forEach((q) => {
            result.push({ ...q, genre: genre.id, questionSetName: qs.name, stageName: quest.name });
          });
        });
      });
    });
    return result;
  }

  /**
   * 【追加要望対応】parseQuestionsCSV/parseQuestionsJSONで得たquestions配列を、
   * 実際のGameState（の可変ステートオブジェクト。GameState.update()のコールバック内で渡すこと）
   * へ配置する。scopeに応じて、足りないジャンル／道／ステージは自動的に新規作成する。
   *
   * @param {object} mutableState GameState.update((s) => ...) のsを渡す
   * @param {Array} questions parseQuestionsCSV/JSONのquestions
   * @param {{
   *   scope: "all"|"genre"|"questionset"|"stage",
   *   genreId?: string, questionSetId?: string, stageId?: string,
   *   fallbackQuestionSetName?: string, fallbackStageName?: string,
   * }} opts
   * @returns {{ imported: number, skipped: Array<string>, createdGenres: number, createdQuestionSets: number, createdStages: number }}
   */
  function applyImportedQuestions(mutableState, questions, opts) {
    const skipped = [];
    let imported = 0, createdGenres = 0, createdQuestionSets = 0, createdStages = 0;

    questions.forEach((q) => {
      // --- ジャンルの解決 ---
      let genre = null;
      if (opts.scope === "all") {
        const key = (q.genre || "").trim();
        if (!key) { skipped.push(`id:${q.id} … genre列（ジャンル）が未指定です`); return; }
        genre = mutableState.genres.find((g) => g.id === key || g.name === key || g.title === key);
        if (!genre) {
          genre = { id: Utils.generateId("genre"), name: key, title: key, backgroundImage: "", questionSets: [] };
          mutableState.genres.push(genre);
          createdGenres++;
        }
      } else {
        genre = mutableState.genres.find((g) => g.id === opts.genreId);
        if (!genre) { skipped.push(`id:${q.id} … 対象ジャンルが見つかりません`); return; }
      }

      // --- 道（問題セット）の解決 ---
      let qs = null;
      if (opts.scope === "questionset" || opts.scope === "stage") {
        qs = genre.questionSets.find((x) => x.id === opts.questionSetId);
        if (!qs) { skipped.push(`id:${q.id} … 対象の道が見つかりません`); return; }
      } else {
        const qsName = (q.questionSetName || "").trim() || (opts.fallbackQuestionSetName || "").trim();
        if (!qsName) { skipped.push(`id:${q.id} … 道の名前が未指定です`); return; }
        qs = genre.questionSets.find((x) => x.name === qsName);
        if (!qs) {
          qs = { id: Utils.generateId("qs"), name: qsName, backgroundImage: "", quests: [] };
          genre.questionSets.push(qs);
          createdQuestionSets++;
        }
      }

      // --- ステージの解決 ---
      let stage = null;
      if (opts.scope === "stage") {
        stage = qs.quests.find((x) => x.id === opts.stageId);
        if (!stage) { skipped.push(`id:${q.id} … 対象のステージが見つかりません`); return; }
      } else {
        const stageName = (q.stageName || "").trim() || (opts.fallbackStageName || "").trim();
        if (!stageName) { skipped.push(`id:${q.id} … ステージ名が未指定です`); return; }
        stage = qs.quests.find((x) => x.name === stageName);
        if (!stage) {
          stage = { id: Utils.generateId("quest"), name: stageName, questions: [] };
          qs.quests.push(stage);
          createdStages++;
        }
      }

      stage.questions.push(cleanQuestionFields(q));
      imported++;
    });

    return { imported, skipped, createdGenres, createdQuestionSets, createdStages };
  }

  /**
   * 【追加要望対応】ID重複（conflicts）の解決結果を実際のGameStateへ反映する。
   * 重複は「既存データを、取り込み側のファイル内で見つかった同一IDの問題データで
   * 上書きするかどうか」という単純な二択として扱う（配置先の道・ステージは移動しない。
   * あくまで内容＝question/answer等のフィールドのみを差し替える）。
   *
   * @param {object} mutableState GameState.update((s)=>...) のs
   * @param {Array<{id: string, keep: "new"|"old", incoming: object}>} resolutions
   * @returns {{ updated: number, keptOld: number }}
   */
  function applyConflictResolutions(mutableState, resolutions) {
    let updated = 0, keptOld = 0;
    resolutions.forEach((r) => {
      if (r.keep !== "new") { keptOld++; return; }
      const existing = GameState.findQuestionById(r.id);
      if (!existing) return;
      // idはキーなので変えない。それ以外のフィールドを新データで丸ごと差し替える。
      Object.keys(existing).forEach((k) => { if (k !== "id") delete existing[k]; });
      Object.assign(existing, cleanQuestionFields(r.incoming));
      updated++;
    });
    return { updated, keptOld };
  }

  return {
    HEADER,
    parseCSV,
    toCSV,
    toJSON,
    parseQuestionsCSV,
    parseQuestionsJSON,
    collectAllQuestionIds,
    exportGenreToCSV,
    collectQuestions,
    applyImportedQuestions,
    applyConflictResolutions,
    cleanQuestionFields,
  };
})();
