/**
 * gameState.js
 * -----------------------------------------
 * アプリ全体の「今の状態」を保持する唯一の場所（Single Source of Truth）。
 *
 * Phase5メモ：state.map は Phase1から「構造だけ確保」されていた領域。
 * Phase5では mapSystem.js が state.map[key] = { virtualSize, stagePositions } の形で
 * 遅延生成・永続化する（createDefaultState/migrateIfNeededの変更は不要。既存の `map: {}` を
 * そのまま利用できる設計にしてある）。keyは当初ジャンルIDだったが、ステージ地図を
 * 「問題セット単位」の画面に分割した際に問題セットIDへ変更された（mapSystem.js参照）。
 */

const GameState = (() => {
  const STORAGE_KEY = "state_v1";
  const STATE_VERSION = 1;

  let state = null;
  let saveTimer = null;
  const SAVE_DEBOUNCE_MS = 400;

  const EMBEDDED_FALLBACK_GENRES = [
    {
      id: "genre_english",
      name: "英語",
      title: "英語のはじめの一歩",
      questionSets: [
        {
          id: "qs_english_word",
          name: "単語",
          quests: [
            {
              id: "quest_word_unit1",
              name: "Unit1",
              questions: [
                { id: "q_001", question: "「apple」の意味は？", answer: "りんご", antonym: "", synonyms: ["林檎"], unrelated: ["机", "空", "走る"] },
                { id: "q_002", question: "「happy」の意味は？", answer: "幸せな", antonym: "悲しい", synonyms: ["嬉しい"], unrelated: ["石", "遅い", "青い"] },
                { id: "q_003", question: "「difficult」の意味は？", answer: "難しい", antonym: "簡単な", synonyms: ["困難な"], unrelated: ["甘い", "速い", "軽い"] },
                { id: "q_004", question: "「begin」の意味は？", answer: "始める", antonym: "終える", synonyms: ["開始する"], unrelated: ["食べる", "眠る", "笑う"] },
                { id: "q_005", question: "「quiet」の意味は？", answer: "静かな", antonym: "うるさい", synonyms: ["穏やかな"], unrelated: ["熱い", "重い", "新しい"] }
              ]
            }
          ]
        }
      ]
    }
  ];

  function createDefaultState(genres) {
    return {
      meta: {
        version: STATE_VERSION,
        createdAt: Utils.todayStr(),
        lastSavedAt: null,
      },
      user: {
        loginDates: [],
        currentStreak: 0,
        longestStreak: 0,
        compass: 0,
        settings: {
          homeDisplayMode: "text",
          // 【追加要望対応】GitHub連携設定（画像自動保存先。assetManager.js参照）。
          // tokenはブラウザ内のIndexedDB/LocalStorageにのみ保存され、api.github.com以外には送信しない。
          github: { owner: "", repo: "", branch: "main", token: "" },
        },
      },
      genres: genres,

      stageProgress: {},

      reviewSchedules: [],
      reviewHistory: [],

      missStreakByGenre: {},
      blueprints: {},
      lifetimeRetryCount: 0,
      gacha: { monthKey: null, loginCountThisMonth: 0, lastLoginDate: null, wasReturningLogin: false },
      // 【追加要望対応】「今日の目標」（コミットメント・デバイス）。日付が変わると自動的に未設定に戻る。
      dailyGoal: { date: null, target: 0, completed: 0 },

      // --- Phase5：地図 ---
      // mapSystem.jsが `map[genreId] = { virtualSize, stagePositions:{} }` を遅延生成する。
      map: {},

      // --- Phase6：建築 ---
      // buildingSystem.jsが管理。各要素の形は buildingSystem.js の placeBuilding() 参照：
      // { id, genreId, hostStageId, slotIndex, level(1-5), name, assignedCharacterIds, completedAt }
      buildings: [],
      // 建築拡張権限の所持数（仕様25章）。Phase7のガチャ報酬で増える想定。
      buildingExpansionTickets: 0,

      // --- Phase7：ガチャ・キャラクター ---
      // characterDefs：キャラクターの「定義」（デフォルト＋仲間の誘致で追加されたもの）。
      //   { id, name, nickname, genreId, image, dialogues:{}, source:"default"|"custom" }
      // characters：ユーザーが実際に欠片を集めている／完成させた「所持キャラクター」。
      //   characterSystem.js の addFragment() 参照：
      //   { id, defId, genreId, name, nickname, image, fragmentCount(0-10), recoveryRate,
      //     obtainedDate, assignedBuildingId, contributionCount, dialogues }
      characterDefs: [],
      characters: [],

      // --- 【追加要望対応】建築物の「定義」 ---
      // buildingSystem.js の recruitBuildingType() が管理。仲間の誘致と同じ形の二層構造
      // （定義buildingDefs＋実体buildings）を建築物にも導入したもの。
      //   { id, name, genreId, image, source:"custom" }
      buildingDefs: [],

      // --- Phase8：日記・読書記録 ---
      // diarySystem.js が管理。1件 = { id, targetDate("前日"の日付), changeRecord, dayFlow,
      // feelings, recordedAt }。targetDateにつき1件（upsert）。仕様60〜61章。
      diary: [],
      // readingSystem.js が管理。1件 = 1冊の読書記録（仕様62章）。
      books: [],
      // 【追加要望対応】dictationSystem.js が管理。外国語音読用ディクテーション教材。
      // 1件 = { id, title, sentences:[{id,text,audio:{fileId,start,end}|null}],
      //   audioFiles:[{id,name,dataUrl}], createdAt, updatedAt }
      dictationSets: [],
      // 【追加要望対応】音読ディクテーション／読書記録の「フォルダ」（見た目上のグループ分け）。
      // folderList.js が管理。1件 = { id, name, open }。各教材・各本は folderId（null=フォルダ外）を持つ。
      dictationFolders: [],
      bookFolders: [],
      // 【追加要望対応】音読ディクテーションのコンパス報酬の受取記録（1日1回制限用）。
      //   { [setId]: { listen:{date,amount}, dictation:{date,amount} } }
      dictationRewards: {},
      // 【追加要望対応】読書記録1冊分を書き上げると獲得できる「過去日記チケット」の所持枚数。
      diaryTickets: 0,

      // --- Phase9：称号 ---
      // 獲得済み称号。1件 = { id, defId, label, genreId(null可), source:"builtin"|"custom", earnedAt }
      titles: [],
      // ユーザーが設定画面から追加した「独自称号」の条件定義（仕様64章：称号追加・称号条件設定）。
      // titleSystem.js の CUSTOM_CONDITION_TYPES を参照。
      titleDefs: [],

      // --- 【追加要望対応】☆フォルダ（3回以上間違えた問題の翌日再出題） ---
      // questionMistakes：問題IDごとの累計誤答回数（quizSystem.js / reviewSystem.jsの
      //   タイピング復習で誤答するたびに+1する。星問題として出題され正答すると0にリセット）。
      questionMistakes: {},
      // starQuestions：☆フォルダの1件 = { id, questionId, genreId, stageId, format,
      //   scheduledDate, status:"pending"|"done" }
      //   format："lv1"|"lv2"|"lv3"（新規学習中の誤答時） または "typing"（復習の
      //   タイピング復習中の誤答時）。翌日、同じformatで単問再出題するために使う。
      starQuestions: [],
    };
  }

  async function loadInitialGenres() {
    try {
      const res = await fetch("data/initialData.json");
      if (!res.ok) throw new Error("initialData.jsonの取得に失敗: " + res.status);
      const json = await res.json();
      if (Array.isArray(json.genres) && json.genres.length > 0) {
        return json.genres;
      }
      throw new Error("initialData.jsonにgenresが含まれていません");
    } catch (err) {
      console.warn("[gameState] 初期データのfetchに失敗したため埋め込みデータを使用します", err);
      return Utils.deepClone(EMBEDDED_FALLBACK_GENRES);
    }
  }

  async function init() {
    await StorageEngine.init();
    const saved = await StorageEngine.get(STORAGE_KEY);

    if (saved && typeof saved === "object" && saved.meta) {
      state = saved;
      migrateIfNeeded();
    } else {
      const genres = await loadInitialGenres();
      state = createDefaultState(genres);
      await persist();
    }

    recordLoginForToday();
    return state;
  }

  /**
   * 【追加要望対応】1日1回ログインすれば、日付が変わるまで再ログイン不要にするための
   * 事前チェック。init()を呼ばず（＝state本体を書き換えず）ストレージだけを覗いて、
   * 保存済みデータの最終ログイン日に「今日」が含まれているかどうかを返す。
   * 保存データが無い/壊れている場合はfalse（＝通常のログイン画面へ）を返す。
   */
  async function hasLoggedInToday() {
    try {
      const saved = await StorageEngine.get(STORAGE_KEY);
      if (saved && saved.user && Array.isArray(saved.user.loginDates)) {
        return saved.user.loginDates.includes(Utils.todayStr());
      }
    } catch (err) {
      console.error("[gameState] 本日のログイン状態確認に失敗しました", err);
    }
    return false;
  }

  function migrateIfNeeded() {
    if (!state.meta.version || state.meta.version < STATE_VERSION) {
      state.meta.version = STATE_VERSION;
    }
    const defaults = {
      stageProgress: {},
      reviewSchedules: [],
      reviewHistory: [],
      missStreakByGenre: {},
      blueprints: {},
      lifetimeRetryCount: 0,
      gacha: { monthKey: null, loginCountThisMonth: 0, lastLoginDate: null, wasReturningLogin: false },
      map: {},
      buildings: [], buildingExpansionTickets: 0,
      characterDefs: [], characters: [],
      buildingDefs: [],
      diary: [], books: [],
      dictationSets: [],
      dictationFolders: [], bookFolders: [], dictationRewards: {}, diaryTickets: 0,
      titles: [], titleDefs: [],
      questionMistakes: {}, starQuestions: [],
      // 【追加要望対応】「今日の目標」。旧セーブデータには無いため補完する。
      dailyGoal: { date: null, target: 0, completed: 0 },
    };
    for (const [key, value] of Object.entries(defaults)) {
      if (!(key in state)) state[key] = value;
    }
    // 【追加要望対応】旧セーブデータにはuser.settings.githubが無いため補完する。
    if (!state.user.settings) state.user.settings = { homeDisplayMode: "text" };
    if (!state.user.settings.github) {
      state.user.settings.github = { owner: "", repo: "", branch: "main", token: "" };
    }
  }

  function getState() {
    return state;
  }

  function update(mutator) {
    mutator(state);
    scheduleSave();
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { persist(); }, SAVE_DEBOUNCE_MS);
  }

  async function persist() {
    state.meta.lastSavedAt = new Date().toISOString();
    const ok = await StorageEngine.set(STORAGE_KEY, state);
    if (!ok) {
      Utils.showToast("自動保存に失敗しました。設定画面からバックアップを取ることをおすすめします。", "error");
    }
    return ok;
  }

  function recordLoginForToday() {
    const today = Utils.todayStr();
    if (state.user.loginDates.includes(today)) return;

    const dates = state.user.loginDates;
    const yesterday = Utils.addDays(today, -1);
    const wasConsecutive = dates.length > 0 && dates[dates.length - 1] === yesterday;

    dates.push(today);
    state.user.currentStreak = wasConsecutive ? state.user.currentStreak + 1 : 1;
    state.user.longestStreak = Math.max(state.user.longestStreak, state.user.currentStreak);

    // 【Phase7】ガチャ確率優先順位①（仕様40章）：1週間以上ログインしていない
    // 復帰日かどうかを、上書きされる前のlastLoginDateを使って判定し保存しておく。
    // gachaSystem.jsはこのフラグを最優先の条件として参照する。
    const previousLastLogin = state.gacha.lastLoginDate;
    state.gacha.wasReturningLogin = !!previousLastLogin && Utils.diffDays(today, previousLastLogin) >= 7;

    const monthKey = today.slice(0, 7);
    if (state.gacha.monthKey !== monthKey) {
      state.gacha.monthKey = monthKey;
      state.gacha.loginCountThisMonth = 1;
    } else {
      state.gacha.loginCountThisMonth += 1;
    }
    state.gacha.lastLoginDate = today;

    scheduleSave();
  }

  function findStageContext(stageId) {
    for (const genre of state.genres) {
      for (const qs of genre.questionSets || []) {
        for (const quest of qs.quests || []) {
          if (quest.id === stageId) {
            return { genre, questionSet: qs, stage: quest };
          }
        }
      }
    }
    return null;
  }

  /**
   * 【追加要望対応】問題データ詳細ポップアップの「補足追加」機能用。
   * 問題IDから、問題データ本体（GameStateの実体。ミュータブルな参照）を探して返す。
   * 呼び出し側は GameState.update(s => ...) の中で使うこと。
   */
  function findQuestionById(questionId) {
    for (const genre of state.genres) {
      for (const qs of genre.questionSets || []) {
        for (const quest of qs.quests || []) {
          for (const q of quest.questions || []) {
            if (q.id === questionId) return q;
          }
        }
      }
    }
    return null;
  }

  /**
   * 【追加要望対応】☆フォルダ機能：問題ID単位の誤答回数を+1する。
   * 累計3回に達した瞬間（3回目のみ）、翌日出題の☆フォルダへ登録する。
   * 既にその問題が☆フォルダに pending で入っている場合は重複登録しない。
   * @param {string} questionId
   * @param {string} genreId
   * @param {string} stageId
   * @param {"lv1"|"lv2"|"lv3"|"typing"} format 誤答時に出題されていた形式（翌日、同じ形式で再出題するため）
   * @returns {boolean} 今回の誤答で新たに☆フォルダへ入ったかどうか
   */
  function recordQuestionMistake(questionId, genreId, stageId, format) {
    let addedToStar = false;
    update((s) => {
      if (!s.questionMistakes) s.questionMistakes = {};
      const count = (s.questionMistakes[questionId] || 0) + 1;
      s.questionMistakes[questionId] = count;

      if (!s.starQuestions) s.starQuestions = [];
      const alreadyPending = s.starQuestions.some((e) => e.questionId === questionId && e.status === "pending");

      if (count >= 3 && !alreadyPending) {
        s.starQuestions.push({
          id: Utils.generateId("star"),
          questionId, genreId, stageId, format,
          scheduledDate: Utils.addDays(Utils.todayStr(), 1),
          status: "pending",
        });
        addedToStar = true;
      }
    });
    return addedToStar;
  }

  /**
   * 【追加要望対応】整理（クリーンアップ）機能。
   * 「ステージ数が1つ以下になった問題セット（道）」を削除し、その結果「問題セットが
   * 0個になったジャンル」も削除する。削除された道・ステージを参照している進行データ
   * （stageProgress／reviewSchedules／reviewHistory／starQuestions／questionMistakes／
   * state.map）も矛盾が残らないようあわせて削除する。
   * ただし、既に獲得済みの建築物・キャラクター・称号・コンパスなどは、対応するジャンルが
   * 削除された後も失われない（仕様67章「損失回避：休んでも失わない」の対象と同様の考え方）
   * ため、削除しない（genreIdが実在しない状態で残るだけで、動作・表示には影響しない）。
   * @returns {{ removedQuestionSets: number, removedGenres: number, removedStageCount: number }}
   */
  function cleanupEmptyContent() {
    let removedQuestionSets = 0;
    let removedGenres = 0;
    let removedStageCount = 0;

    update((s) => {
      const removedStageIds = new Set();
      const removedQuestionSetIds = new Set();
      const removedQuestionIds = new Set();

      s.genres.forEach((genre) => {
        const keptSets = [];
        (genre.questionSets || []).forEach((qs) => {
          const stageCount = (qs.quests || []).length;
          if (stageCount <= 1) {
            removedQuestionSetIds.add(qs.id);
            (qs.quests || []).forEach((quest) => {
              removedStageIds.add(quest.id);
              (quest.questions || []).forEach((q) => removedQuestionIds.add(q.id));
            });
            removedQuestionSets += 1;
            removedStageCount += stageCount;
          } else {
            keptSets.push(qs);
          }
        });
        genre.questionSets = keptSets;
      });

      const beforeGenreCount = s.genres.length;
      s.genres = s.genres.filter((g) => (g.questionSets || []).length > 0);
      removedGenres = beforeGenreCount - s.genres.length;

      if (removedStageIds.size > 0) {
        removedStageIds.forEach((stageId) => { delete s.stageProgress[stageId]; });
        s.reviewSchedules = (s.reviewSchedules || []).filter((r) => !removedStageIds.has(r.stageId));
        s.reviewHistory = (s.reviewHistory || []).filter((h) => !removedStageIds.has(h.stageId));
        s.starQuestions = (s.starQuestions || []).filter((e) => !removedStageIds.has(e.stageId));
      }
      if (removedQuestionSetIds.size > 0 && s.map) {
        removedQuestionSetIds.forEach((qsId) => { delete s.map[qsId]; });
      }
      if (removedQuestionIds.size > 0 && s.questionMistakes) {
        removedQuestionIds.forEach((qid) => { delete s.questionMistakes[qid]; });
      }
    });

    return { removedQuestionSets, removedGenres, removedStageCount };
  }

  /**
   * 【追加要望対応】設定→データ管理→整理タブの「指定して削除」用。
   * 指定の組み合わせは次の3通りのみ有効（上位を指定せずに下位だけ指定するのは不可）：
   *   genreIdのみ                      → そのエリア（ジャンル）をすべて削除
   *   genreId + questionSetId          → その道（問題セット）だけを削除
   *   genreId + questionSetId + stageId → そのステージだけを削除
   * 削除対象を参照する進行データ（stageProgress／reviewSchedules／reviewHistory／
   * starQuestions／questionMistakes／state.map）も一緒に整理する。建築物・キャラクター・
   * 称号・コンパスは削除しない（cleanupEmptyContentと同じ、損失回避の方針）。
   * @returns {{ ok:boolean, reason?:string, scope?:string, removedQuestionSets:number, removedStages:number, removedQuestions:number }}
   */
  function deleteContent({ genreId, questionSetId, stageId } = {}) {
    const fail = (reason) => ({ ok: false, reason, removedQuestionSets: 0, removedStages: 0, removedQuestions: 0 });
    if (!genreId) return fail("エリアが指定されていません");
    if (stageId && !questionSetId) return fail("ステージを削除するには道の指定も必要です");
    const genre = state.genres.find((g) => g.id === genreId);
    if (!genre) return fail("指定のエリアが見つかりません");
    let qsTarget = null;
    let stageTarget = null;
    if (questionSetId) {
      qsTarget = (genre.questionSets || []).find((q) => q.id === questionSetId);
      if (!qsTarget) return fail("指定の道が見つかりません");
    }
    if (stageId) {
      stageTarget = (qsTarget.quests || []).find((q) => q.id === stageId);
      if (!stageTarget) return fail("指定のステージが見つかりません");
    }

    const stageIds = new Set();
    const qsIds = new Set();
    const questionIds = new Set();
    const collectStage = (quest) => {
      stageIds.add(quest.id);
      (quest.questions || []).forEach((q) => questionIds.add(q.id));
    };
    const collectQuestionSet = (qs) => {
      qsIds.add(qs.id);
      (qs.quests || []).forEach(collectStage);
    };

    let scope;
    if (stageTarget) {
      scope = "stage";
      collectStage(stageTarget);
    } else if (qsTarget) {
      scope = "questionSet";
      collectQuestionSet(qsTarget);
    } else {
      scope = "genre";
      (genre.questionSets || []).forEach(collectQuestionSet);
    }

    update((s) => {
      if (scope === "genre") {
        s.genres = s.genres.filter((g) => g.id !== genreId);
      } else {
        const g = s.genres.find((x) => x.id === genreId);
        if (!g) return;
        if (scope === "questionSet") {
          g.questionSets = (g.questionSets || []).filter((q) => q.id !== questionSetId);
        } else {
          const qs = (g.questionSets || []).find((q) => q.id === questionSetId);
          if (qs) qs.quests = (qs.quests || []).filter((q) => q.id !== stageId);
        }
      }
      stageIds.forEach((id) => { delete s.stageProgress[id]; });
      s.reviewSchedules = (s.reviewSchedules || []).filter((r) => !stageIds.has(r.stageId));
      s.reviewHistory = (s.reviewHistory || []).filter((h) => !stageIds.has(h.stageId));
      s.starQuestions = (s.starQuestions || []).filter((e) => !stageIds.has(e.stageId));
      if (s.map) {
        qsIds.forEach((id) => { delete s.map[id]; });
        // ステージ単体の削除では、道の地図データ内の当該ステージ位置だけ取り除く
        if (scope === "stage" && s.map[questionSetId] && s.map[questionSetId].stagePositions) {
          delete s.map[questionSetId].stagePositions[stageId];
        }
      }
      if (s.questionMistakes) questionIds.forEach((id) => { delete s.questionMistakes[id]; });
    });

    return {
      ok: true, scope,
      removedQuestionSets: scope === "genre" ? qsIds.size : (scope === "questionSet" ? 1 : 0),
      removedStages: stageIds.size,
      removedQuestions: questionIds.size,
    };
  }

  function getLevel() {
    return state.user.loginDates.length;
  }

  /**
   * 【追加要望対応】行動経済学の「コミットメント・デバイス」機能：「今日の目標」。
   * ユーザーが今日挑戦するクエスト数（1/3/5問など）を自分で決めて宣言し、
   * 新規学習・復習のクエストを1つ完了するたびにカウントが進む。日付が変わると自動的に
   * 未設定（null相当）に戻り、また新しく決め直す。
   */
  function setDailyGoal(target) {
    update((s) => {
      s.dailyGoal = { date: Utils.todayStr(), target, completed: 0 };
    });
  }

  function getDailyGoal() {
    const today = Utils.todayStr();
    if (!state.dailyGoal || state.dailyGoal.date !== today) return null;
    return state.dailyGoal;
  }

  /** クエスト（新規学習・復習とも）を1つ完了するたびに呼ぶ。今日の目標が未設定の日は何もしない。 */
  function recordQuestCompletionForDailyGoal() {
    update((s) => {
      if (!s.dailyGoal) s.dailyGoal = { date: null, target: 0, completed: 0 };
      if (s.dailyGoal.date !== Utils.todayStr()) return;
      s.dailyGoal.completed += 1;
    });
  }

  return {
    init,
    hasLoggedInToday,
    getState,
    update,
    persist,
    getLevel,
    findStageContext,
    findQuestionById,
    recordQuestionMistake,
    cleanupEmptyContent,
    deleteContent,
    setDailyGoal,
    getDailyGoal,
    recordQuestCompletionForDailyGoal,
  };
})();
