/**
 * dictationSystem.js
 * -----------------------------------------
 * 【追加要望対応】外国語の音読用ディクテーション機能。
 * 「霧晴れの開拓日誌」から「読書記録」と並べて入れる、学習ゲームの主目的からは
 * 独立した任意機能（readingSystem.jsと同じ位置づけ。ガチャ解放条件等には関与しない）。
 *
 * 1セット = 1つの音読教材：
 *   { id, title,
 *     sentences: [{ id, text, audio: { fileId, start, end } | null }],
 *     audioFiles: [{ id, name, dataUrl }],   // フォルダ単位でまとめてアップロードした音源
 *     createdAt, updatedAt }
 *
 * 【追加要望対応（HANDOFF.md 19章）】
 *   ・画面：dictationList（一覧＋フォルダ＋ZIPバックアップ）／dictationDetail（編集）／
 *     dictationListen（▶ 練習する：分割文の一覧と音声）／dictationPractice（ディクテーション）
 *   ・コンパス報酬：練習する（分割前の音声を最後まで再生）5個、ディクテーション（最後まで解答）5個、
 *     全問正解20個。いずれも「編集画面に戻る」を押したときに付与（同じ教材・同じ種類は1日1回まで）。
 *
 * 【仕様に明記が無く判断した点（要レビュー。HANDOFF.md参照）】
 *   - 「自動でテキストを参照して音声を分割」は、音声認識・音素解析を伴う本格的な
 *     自動分割はブラウザ内の範囲を超えるため、「1つの音源ファイルの総再生時間を、
 *     各文の文字数の比率で按分する」という簡易的な仮分割（ヒューリスティック）とした。
 *     結果はあくまで「たたき台」であり、その後の「手動での音声カットと対応」で
 *     利用者が実際の音声を聞きながら開始・終了位置を修正する運用を想定している。
 *   - 音源はdataURL（Base64）としてIndexedDBに保存する（assetManager.jsの画像保存と
 *     同じ方式）。音声ファイルは画像より容量が大きくなりやすいため、大量・長時間の
 *     音源を扱う場合はバックアップJSONの肥大化に注意（HANDOFF.mdに記載）。
 */

const DictationSystem = (() => {

  // 【追加要望対応】コンパス報酬（仕様に金額の指定があるもの）。
  const REWARD_LISTEN = 5;             // 「練習する」で分割前の音声を最後まで再生
  const REWARD_DICTATION = 5;          // 「ディクテーション」を最後の問題まで解いた
  const REWARD_DICTATION_PERFECT = 20; // 上記のうち全問正解
  // 仕様に明記が無く判断した点：コンパスの無限取得（同じ教材の周回）を防ぐため、
  // 「同じ教材・同じ種類の報酬は1日に1回まで」とした。falseにすると毎回受け取れる。
  const REWARD_ONCE_PER_DAY = true;

  function getAll() {
    return GameState.getState().dictationSets || [];
  }

  /**
   * 報酬を受け取る。kind: "listen" | "dictation"。
   * 同じ日に同じ種類を受け取り済みの場合は、差額だけ付与（例：5個受取済み→全問正解で+15個）。
   * @returns {number} 実際に付与したコンパス数（0なら受取済み）
   */
  function claimReward(setId, kind, amount) {
    const today = Utils.todayStr();
    let granted = amount;
    GameState.update((state) => {
      if (!state.dictationRewards) state.dictationRewards = {};
      if (!state.dictationRewards[setId]) state.dictationRewards[setId] = {};
      const rec = state.dictationRewards[setId][kind];
      if (REWARD_ONCE_PER_DAY && rec && rec.date === today) granted = Math.max(0, amount - rec.amount);
      if (granted > 0) {
        const prev = (rec && rec.date === today) ? rec.amount : 0;
        state.dictationRewards[setId][kind] = { date: today, amount: prev + granted };
      }
    });
    if (granted > 0) RewardSystem.grantCompass(granted);
    return granted;
  }

  /** 教材内の音源のうち、分割前の「元の音声」とみなすもの（文に最も多く割り当てられている音源、無ければ先頭） */
  function getOriginalAudioFile(set) {
    if (!set || !set.audioFiles || set.audioFiles.length === 0) return null;
    const counts = new Map();
    (set.sentences || []).forEach((sent) => {
      if (sent.audio) counts.set(sent.audio.fileId, (counts.get(sent.audio.fileId) || 0) + 1);
    });
    let bestId = null;
    let best = 0;
    counts.forEach((n, id) => { if (n > best) { best = n; bestId = id; } });
    return set.audioFiles.find((f) => f.id === bestId) || set.audioFiles[0];
  }

  /** ディクテーション用の音源が再生されたらstage.m4aを止める（探索画面に戻るまで） */
  function watchAudio(audioEl) {
    audioEl.addEventListener("play", () => {
      if (typeof BgmSystem !== "undefined") BgmSystem.suspendStageUntilExplore();
    });
    return audioEl;
  }

  /**
   * 1つの<audio>で「音源全体」や「文ごとの範囲」を再生するプレーヤー。
   * 終了位置の監視は約40msごとに行い、範囲を大きくはみ出さないようにする。
   */
  function createPlayer(audioEl) {
    let timer = null;
    let seq = 0;

    function clearTimer() { if (timer) { clearInterval(timer); timer = null; } }

    function ensureFile(file) {
      if (audioEl.dataset.fileId === file.id && audioEl.readyState >= 1) return Promise.resolve();
      return new Promise((resolve, reject) => {
        audioEl.dataset.fileId = file.id;
        const done = () => { audioEl.removeEventListener("loadedmetadata", onOk); audioEl.removeEventListener("error", onErr); };
        const onOk = () => { done(); resolve(); };
        const onErr = () => { done(); reject(new Error("音声を読み込めませんでした")); };
        audioEl.addEventListener("loadedmetadata", onOk);
        audioEl.addEventListener("error", onErr);
        audioEl.src = file.dataUrl;
      });
    }

    /** end が null なら最後まで再生する */
    async function playRange(file, start, end, onEnd) {
      const mySeq = ++seq;
      clearTimer();
      audioEl.pause();
      try {
        await ensureFile(file);
        if (mySeq !== seq) return;
        audioEl.currentTime = start || 0;
        await audioEl.play();
      } catch (err) {
        console.error("[dictationSystem] 音声の再生に失敗しました", err);
        Utils.showToast("音声を再生できませんでした", "error");
        return;
      }
      if (mySeq !== seq || end == null) return;
      timer = setInterval(() => {
        if (audioEl.currentTime >= end || audioEl.ended) {
          clearTimer();
          audioEl.pause();
          if (onEnd) onEnd();
        }
      }, 40);
    }

    function stop() { seq += 1; clearTimer(); audioEl.pause(); }

    return { playRange, stop };
  }

  function getById(id) {
    return getAll().find((s) => s.id === id) || null;
  }

  function createSet(title) {
    const id = Utils.generateId("dictset");
    GameState.update((state) => {
      if (!state.dictationSets) state.dictationSets = [];
      state.dictationSets.push({
        id,
        title: (title || "").trim().slice(0, 100) || "無題の教材",
        sentences: [],
        audioFiles: [],
        folderId: null,
        createdAt: Utils.todayStr(),
        updatedAt: Utils.todayStr(),
      });
    });
    return id;
  }

  function updateSet(id, patch) {
    GameState.update((state) => {
      const s = state.dictationSets.find((x) => x.id === id);
      if (!s) return;
      Object.assign(s, patch);
      s.updatedAt = Utils.todayStr();
    });
  }

  function deleteSet(id) {
    GameState.update((state) => {
      state.dictationSets = state.dictationSets.filter((s) => s.id !== id);
    });
  }

  /**
   * テキストを文単位に分割する（。！？.!? および改行を区切りとする簡易分割）。
   * 既存のsentencesがある場合は呼び出し側で確認（上書き注意）を行うこと。
   */
  function splitTextToSentences(text) {
    const normalized = text.replace(/\r\n/g, "\n").trim();
    if (!normalized) return [];
    const rough = normalized.split(/\n+/).flatMap((line) =>
      line.split(/(?<=[。！？.!?])/).map((s) => s.trim()).filter(Boolean)
    );
    return rough.filter(Boolean);
  }

  function setSentencesFromText(setId, text) {
    const sentences = splitTextToSentences(text).map((t) => ({
      id: Utils.generateId("sent"), text: t, audio: null,
    }));
    updateSet(setId, { sentences });
    return sentences.length;
  }

  function addAudioFiles(setId, files) {
    return Promise.all(files.map((file) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ id: Utils.generateId("audio"), name: file.name, dataUrl: reader.result });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    }))).then((results) => {
      const valid = results.filter(Boolean);
      GameState.update((state) => {
        const s = state.dictationSets.find((x) => x.id === setId);
        if (!s) return;
        s.audioFiles.push(...valid);
        s.updatedAt = Utils.todayStr();
      });
      return valid.length;
    });
  }

  /**
   * 【追加要望対応】自動での仮分割（ヒューリスティック）。
   * 指定した音源ファイル1つの総再生時間を、各文の文字数の比率で按分して
   * sentence.audio = { fileId, start, end } を仮に割り当てる。
   * @param {string} setId
   * @param {string} audioFileId 分割の元にする音源ファイルID
   * @param {number} durationSec 音源の総再生時間（秒）
   */
  function autoSplitByCharCount(setId, audioFileId, durationSec) {
    const set = getById(setId);
    if (!set || set.sentences.length === 0 || !durationSec) return 0;
    const totalChars = set.sentences.reduce((sum, s) => sum + Math.max(1, s.text.length), 0);
    let cursor = 0;
    const updated = set.sentences.map((s) => {
      const share = Math.max(1, s.text.length) / totalChars;
      const dur = durationSec * share;
      const start = cursor;
      const end = Math.min(durationSec, cursor + dur);
      cursor = end;
      return { ...s, audio: { fileId: audioFileId, start: round2(start), end: round2(end) } };
    });
    updateSet(setId, { sentences: updated });
    return updated.length;
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  function setSentenceAudio(setId, sentenceId, fileId, start, end) {
    GameState.update((state) => {
      const s = state.dictationSets.find((x) => x.id === setId);
      const sent = s?.sentences.find((x) => x.id === sentenceId);
      if (sent) sent.audio = { fileId, start: round2(start), end: round2(end) };
      if (s) s.updatedAt = Utils.todayStr();
    });
  }

  /* ============================================================
     ZIPバックアップ（音源・分割情報・フォルダをまとめて保存／復元）
     ============================================================ */

  const BACKUP_FORMAT = "gakushu-dictation-backup";

  function mimeOfDataUrl(dataUrl) {
    const m = /^data:([^;,]+)/.exec(dataUrl || "");
    return m ? m[1] : "application/octet-stream";
  }

  function extOfName(name, mime) {
    const m = /\.([A-Za-z0-9]{1,5})$/.exec(name || "");
    if (m) return "." + m[1].toLowerCase();
    if (mime === "audio/mpeg") return ".mp3";
    if (mime === "audio/mp4" || mime === "audio/x-m4a") return ".m4a";
    return ".bin";
  }

  async function dataUrlToBytes(dataUrl) {
    try {
      const res = await fetch(dataUrl);
      return new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      // fetchでdata URLを扱えない環境向けのフォールバック
      const base64 = (dataUrl || "").split(",")[1] || "";
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }
  }

  function bytesToDataUrl(bytes, mime) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("音源の変換に失敗しました"));
      reader.readAsDataURL(new Blob([bytes], { type: mime || "application/octet-stream" }));
    });
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** すべての教材（音源・文の分割位置・フォルダ）をZIPで書き出す */
  async function exportBackupZip() {
    const sets = getAll();
    if (sets.length === 0) { Utils.showToast("書き出す教材がありません", "error"); return; }
    try {
      const entries = [];
      const manifestSets = [];
      for (const set of sets) {
        const audioMeta = [];
        for (const f of set.audioFiles || []) {
          const bytes = await dataUrlToBytes(f.dataUrl);
          const mime = mimeOfDataUrl(f.dataUrl);
          const path = `audio/${set.id}/${f.id}${extOfName(f.name, mime)}`;
          entries.push({ name: path, data: bytes });
          audioMeta.push({ id: f.id, name: f.name, mime, path });
        }
        manifestSets.push({
          id: set.id, title: set.title, folderId: set.folderId || null,
          sentences: set.sentences || [], audioFiles: audioMeta,
          createdAt: set.createdAt, updatedAt: set.updatedAt,
        });
      }
      const manifest = {
        format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(),
        folders: GameState.getState().dictationFolders || [],
        sets: manifestSets,
      };
      entries.unshift({ name: "manifest.json", data: JSON.stringify(manifest, null, 2) });
      downloadBlob(`dictation_backup_${Utils.todayStr()}.zip`, ZipUtil.create(entries));
      Utils.showToast(`${sets.length}件の教材をZIPで書き出しました`, "success");
    } catch (err) {
      console.error("[dictationSystem] ZIPの書き出しに失敗しました", err);
      Utils.showToast("ZIPの書き出しに失敗しました: " + err.message, "error");
    }
  }

  /**
   * ZIPバックアップを読み込む。同じIDの教材は上書き、無いIDの教材は追加（他の教材は消えない）。
   * @returns {Promise<boolean>} 読み込みを実行したか（キャンセル・失敗はfalse）
   */
  async function importBackupZip(file) {
    try {
      const files = await ZipUtil.read(await file.arrayBuffer());
      const manifestBytes = files.get("manifest.json");
      if (!manifestBytes) throw new Error("manifest.json が見つかりません（このアプリで書き出したZIPではありません）");
      let manifest;
      try { manifest = JSON.parse(ZipUtil.textOf(manifestBytes)); }
      catch (e) { throw new Error("manifest.json の形式が正しくありません"); }
      if (manifest.format !== BACKUP_FORMAT || !Array.isArray(manifest.sets)) {
        throw new Error("音読ディクテーションのバックアップではありません");
      }

      const existingIds = new Set(getAll().map((x) => x.id));
      const overwriteCount = manifest.sets.filter((x) => existingIds.has(x.id)).length;
      if (overwriteCount > 0 && !confirm(`同じ教材が${overwriteCount}件あります。ZIPの内容で上書きします。よろしいですか？`)) return false;

      const rebuilt = [];
      let missingAudio = 0;
      for (const m of manifest.sets) {
        if (!m || typeof m.id !== "string" || !Array.isArray(m.sentences)) throw new Error("教材データの形式が正しくありません");
        const audioFiles = [];
        for (const a of m.audioFiles || []) {
          const bytes = files.get(a.path);
          if (!bytes) { missingAudio += 1; continue; }
          audioFiles.push({ id: a.id, name: a.name, dataUrl: await bytesToDataUrl(bytes, a.mime) });
        }
        rebuilt.push({
          id: m.id, title: String(m.title || "無題の教材"), folderId: m.folderId || null,
          sentences: m.sentences, audioFiles,
          createdAt: m.createdAt || Utils.todayStr(), updatedAt: Utils.todayStr(),
        });
      }

      GameState.update((state) => {
        if (!state.dictationSets) state.dictationSets = [];
        if (!state.dictationFolders) state.dictationFolders = [];
        (Array.isArray(manifest.folders) ? manifest.folders : []).forEach((f) => {
          if (f && f.id && !state.dictationFolders.some((x) => x.id === f.id)) {
            state.dictationFolders.push({ id: f.id, name: String(f.name || "フォルダ"), open: f.open !== false });
          }
        });
        rebuilt.forEach((set) => {
          if (set.folderId && !state.dictationFolders.some((f) => f.id === set.folderId)) set.folderId = null;
          const idx = state.dictationSets.findIndex((x) => x.id === set.id);
          if (idx >= 0) state.dictationSets[idx] = set; else state.dictationSets.push(set);
        });
      });
      await GameState.persist();
      Utils.showToast(`${rebuilt.length}件の教材を読み込みました` + (missingAudio ? `（音源${missingAudio}件はZIP内に見つかりませんでした）` : ""), missingAudio ? "info" : "success");
      return true;
    } catch (err) {
      console.error("[dictationSystem] ZIPの読み込みに失敗しました", err);
      Utils.showToast("ZIPの読み込みに失敗しました: " + err.message, "error");
      return false;
    }
  }

  /* ============================================================
     画面："dictationList"
     ============================================================ */

  function renderListScreen(root) {
    const wrap = Utils.el("div", { class: "screen-inner" });
    wrap.appendChild(Utils.el("h2", {}, "音読ディクテーション"));
    wrap.appendChild(Utils.el("p", { class: "explore-desc" }, "外国語の音読用テキストと音源を登録し、一文ずつのディクテーション練習ができます（任意機能）。"));

    const listBox = Utils.el("div", { class: "folder-list-box" });
    const refresh = () => {
      FolderList.render(listBox, {
        foldersKey: "dictationFolders",
        itemsKey: "dictationSets",
        items: getAll(),
        emptyMessage: "まだ教材がありません。",
        onChange: refresh,
        renderItem: (s) => Utils.el("button", { class: "panel book-list-row", onclick: () => Router.navigate("dictationDetail", { setId: s.id }) }, [
          Utils.el("h3", {}, s.title),
          Utils.el("p", {}, `文の数: ${s.sentences.length} ／ 音源ファイル数: ${s.audioFiles.length}`),
        ]),
      });
    };

    wrap.appendChild(FolderList.createAddFolderButton("dictationFolders", refresh));
    wrap.appendChild(Utils.el("button", {
      class: "btn btn-primary btn-block folder-add-item-btn",
      onclick: () => {
        const id = createSet("無題の教材");
        Router.navigate("dictationDetail", { setId: id });
      },
    }, "＋ 新しい教材を追加"));
    wrap.appendChild(listBox);
    refresh();

    // --- ZIPバックアップ ---
    const zipPanel = Utils.el("div", { class: "panel", style: "margin-top:20px;" }, [
      Utils.el("h3", {}, "ZIPバックアップ（音声つき）"),
      Utils.el("p", { class: "explore-desc" }, "教材・音源ファイル・分割した音声の位置・フォルダをまとめて保存／復元できます。読み込むと、同じ教材は上書き、新しい教材は追加されます。"),
    ]);
    zipPanel.appendChild(Utils.el("button", { class: "btn btn-secondary btn-block", onclick: () => exportBackupZip() }, "ZIPで出力する"));
    const zipInput = Utils.el("input", { type: "file", accept: ".zip,application/zip", style: "margin-top:10px; width:100%;" });
    zipInput.addEventListener("change", async () => {
      const f = zipInput.files[0];
      if (!f) return;
      const done = await importBackupZip(f);
      zipInput.value = "";
      if (done) Router.navigate("dictationList");
    });
    zipPanel.appendChild(Utils.el("label", { class: "diary-field-label", style: "margin-top:10px;" }, "ZIPを読み込む"));
    zipPanel.appendChild(zipInput);
    wrap.appendChild(zipPanel);

    root.appendChild(wrap);
  }

  /* ============================================================
     画面："dictationDetail"（編集）
     ============================================================ */

  function renderDetailScreen(root, params = {}) {
    const set = getById(params.setId);
    if (!set) { root.appendChild(Utils.el("p", { class: "empty-state" }, "教材が見つかりません")); return; }

    const wrap = Utils.el("div", { class: "screen-inner" });
    wrap.appendChild(Utils.el("h2", {}, "教材の編集"));

    const titleInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "教材名" });
    titleInput.value = set.title;
    titleInput.addEventListener("change", () => updateSet(set.id, { title: titleInput.value }));
    wrap.appendChild(titleInput);

    // 【追加要望対応】「▶ 練習する」（分割文の一覧＋音声）を追加し、従来の「練習する」は「ディクテーション」へ改名
    wrap.appendChild(Utils.el("button", {
      class: "btn btn-moss btn-block", style: "margin:8px 0;",
      onclick: () => Router.navigate("dictationListen", { setId: set.id }),
    }, "▶ 練習する"));
    wrap.appendChild(Utils.el("button", {
      class: "btn btn-moss btn-block", style: "margin:8px 0;",
      onclick: () => Router.navigate("dictationPractice", { setId: set.id }),
    }, "ディクテーション"));

    // --- テキスト読み込み・分割 ---
    const textPanel = Utils.el("div", { class: "panel" }, [Utils.el("h3", {}, "音読用テキスト")]);
    const textarea = Utils.el("textarea", { class: "review-textarea", rows: "6", placeholder: "音読するテキストを貼り付け（またはファイルを読み込み）" });
    const textFileInput = Utils.el("input", { type: "file", accept: ".txt,text/plain" });
    textFileInput.addEventListener("change", () => {
      const file = textFileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { textarea.value = reader.result; };
      reader.readAsText(file, "utf-8");
    });
    textPanel.appendChild(textFileInput);
    textPanel.appendChild(textarea);
    textPanel.appendChild(Utils.el("button", {
      class: "btn btn-secondary btn-block",
      onclick: () => {
        if (set.sentences.length > 0 && !confirm("既存の一文分割・音声対応データを上書きします。よろしいですか？")) return;
        const count = setSentencesFromText(set.id, textarea.value);
        Utils.showToast(`${count}文に分割しました`, "success");
        Router.navigate("dictationDetail", { setId: set.id });
      },
    }, "この文章を一文ごとに分割する"));
    wrap.appendChild(textPanel);

    // --- 音源フォルダのアップロード ---
    const audioPanel = Utils.el("div", { class: "panel" }, [
      Utils.el("h3", {}, "音源のアップロード"),
      Utils.el("p", { class: "explore-desc" }, "フォルダごと、または複数ファイルをまとめて選択できます。"),
    ]);
    const audioInput = Utils.el("input", { type: "file", accept: "audio/*", multiple: "true", webkitdirectory: "true" });
    const audioInputSingle = Utils.el("input", { type: "file", accept: "audio/*", multiple: "true" });
    audioInput.addEventListener("change", () => handleAudioUpload(audioInput.files));
    audioInputSingle.addEventListener("change", () => handleAudioUpload(audioInputSingle.files));
    function handleAudioUpload(fileList) {
      const files = Array.from(fileList || []);
      if (files.length === 0) return;
      addAudioFiles(set.id, files).then((count) => {
        Utils.showToast(`${count}件の音源を追加しました`, "success");
        Router.navigate("dictationDetail", { setId: set.id });
      });
    }
    audioPanel.appendChild(Utils.el("label", { class: "diary-field-label" }, "フォルダを選択"));
    audioPanel.appendChild(audioInput);
    audioPanel.appendChild(Utils.el("label", { class: "diary-field-label" }, "または複数ファイルを選択"));
    audioPanel.appendChild(audioInputSingle);

    const fileListBox = Utils.el("div", {});
    set.audioFiles.forEach((f) => fileListBox.appendChild(Utils.el("div", { class: "settings-row" }, [
      Utils.el("span", {}, f.name),
    ])));
    audioPanel.appendChild(fileListBox);
    wrap.appendChild(audioPanel);

    // --- 自動仮分割 ---
    if (set.audioFiles.length > 0 && set.sentences.length > 0) {
      const autoPanel = Utils.el("div", { class: "panel" }, [
        Utils.el("h3", {}, "自動で仮分割する（目安）"),
        Utils.el("p", { class: "explore-desc" }, "選んだ音源1つの長さを、各文の文字数の比率で仮に割り振ります。その後「手動での音声カットと対応」で調整してください。"),
      ]);
      const fileSelect = Utils.el("select", { class: "review-typing-input" },
        set.audioFiles.map((f) => Utils.el("option", { value: f.id }, f.name)));
      const previewAudio = watchAudio(Utils.el("audio", { controls: "true", style: "width:100%; margin-top:6px;" }));
      previewAudio.src = set.audioFiles[0].dataUrl;
      fileSelect.addEventListener("change", () => {
        const f = set.audioFiles.find((x) => x.id === fileSelect.value);
        if (f) previewAudio.src = f.dataUrl;
      });
      autoPanel.appendChild(fileSelect);
      autoPanel.appendChild(previewAudio);
      autoPanel.appendChild(Utils.el("button", {
        class: "btn btn-secondary btn-block",
        onclick: () => {
          const duration = previewAudio.duration;
          if (!duration || !isFinite(duration)) {
            Utils.showToast("音源の長さを取得できませんでした。一度再生してから試してください", "error");
            return;
          }
          autoSplitByCharCount(set.id, fileSelect.value, duration);
          Utils.showToast("仮分割しました。下の一覧で確認・調整してください", "success");
          Router.navigate("dictationDetail", { setId: set.id });
        },
      }, "この音源の長さで仮分割する"));
      wrap.appendChild(autoPanel);
    }

    // --- 手動での音声カットと対応 ---
    const sentPanel = Utils.el("div", { class: "panel" }, [
      Utils.el("h3", {}, "手動での音声カットと対応"),
      Utils.el("p", { class: "explore-desc" }, "文ごとに、対応する音源ファイルと開始・終了（秒）を指定します。再生してから「今の位置を開始/終了にする」で微調整できます。"),
    ]);
    set.sentences.forEach((sent, idx) => {
      sentPanel.appendChild(renderSentenceRow(set, sent, idx));
    });
    if (set.sentences.length === 0) {
      sentPanel.appendChild(Utils.el("p", { class: "empty-state" }, "まだ一文分割されていません。上の「音読用テキスト」で分割してください。"));
    }
    wrap.appendChild(sentPanel);

    wrap.appendChild(Utils.el("button", {
      class: "btn btn-secondary btn-block",
      onclick: () => {
        if (confirm(`「${set.title}」を削除しますか？`)) {
          deleteSet(set.id);
          Router.navigate("dictationList");
        }
      },
    }, "この教材を削除する"));
    // 【追加要望対応】「この教材を削除する」と「一覧に戻る」の間に余白
    wrap.appendChild(Utils.el("button", { class: "btn btn-moss btn-block dict-btn-gap", onclick: () => Router.navigate("dictationList") }, "一覧に戻る"));

    root.appendChild(wrap);
  }

  function renderSentenceRow(set, sent, idx) {
    const row = Utils.el("div", { class: "chapter-row" });
    row.appendChild(Utils.el("div", { class: "diary-field-label" }, `${idx + 1}. ${sent.text}`));

    if (set.audioFiles.length === 0) {
      row.appendChild(Utils.el("p", { class: "explore-desc" }, "先に音源をアップロードしてください"));
      return row;
    }

    const fileSelect = Utils.el("select", { class: "review-typing-input" },
      set.audioFiles.map((f) => Utils.el("option", { value: f.id }, f.name)));
    if (sent.audio) fileSelect.value = sent.audio.fileId;

    const audioEl = watchAudio(Utils.el("audio", { controls: "true", style: "width:100%;" }));
    const currentFile = set.audioFiles.find((f) => f.id === fileSelect.value) || set.audioFiles[0];
    audioEl.src = currentFile.dataUrl;
    fileSelect.addEventListener("change", () => {
      const f = set.audioFiles.find((x) => x.id === fileSelect.value);
      if (f) audioEl.src = f.dataUrl;
    });

    const startInput = Utils.el("input", { type: "number", step: "0.1", min: "0", class: "review-typing-input", placeholder: "開始（秒）" });
    const endInput = Utils.el("input", { type: "number", step: "0.1", min: "0", class: "review-typing-input", placeholder: "終了（秒）" });
    if (sent.audio) { startInput.value = sent.audio.start; endInput.value = sent.audio.end; }

    const markStartBtn = Utils.el("button", { class: "btn btn-secondary", onclick: () => { startInput.value = round2(audioEl.currentTime); } }, "今の位置を開始にする");
    const markEndBtn = Utils.el("button", { class: "btn btn-secondary", onclick: () => { endInput.value = round2(audioEl.currentTime); } }, "今の位置を終了にする");
    const previewBtn = Utils.el("button", {
      class: "btn btn-secondary",
      onclick: () => {
        const s = parseFloat(startInput.value) || 0;
        const e = parseFloat(endInput.value) || (s + 3);
        audioEl.currentTime = s;
        audioEl.play();
        const onTime = () => {
          if (audioEl.currentTime >= e) { audioEl.pause(); audioEl.removeEventListener("timeupdate", onTime); }
        };
        audioEl.addEventListener("timeupdate", onTime);
      },
    }, "この範囲を試し再生");
    const saveBtn = Utils.el("button", {
      class: "btn btn-primary",
      onclick: () => {
        const s = parseFloat(startInput.value) || 0;
        const e = parseFloat(endInput.value) || 0;
        if (e <= s) { Utils.showToast("終了は開始より後にしてください", "error"); return; }
        setSentenceAudio(set.id, sent.id, fileSelect.value, s, e);
        Utils.showToast("この文の音声位置を保存しました", "success");
      },
    }, "保存");

    row.appendChild(fileSelect);
    row.appendChild(audioEl);
    row.appendChild(Utils.el("div", { class: "quiz-choice-row" }, [startInput, endInput]));
    row.appendChild(Utils.el("div", { class: "quiz-choice-row" }, [markStartBtn, markEndBtn]));
    // 【追加要望対応】「今の位置を開始にする」行と「この範囲を試し再生」「保存」行の間に余白
    row.appendChild(Utils.el("div", { class: "quiz-choice-row dict-row-spaced" }, [previewBtn, saveBtn]));
    return row;
  }

  /* ============================================================
     画面："dictationListen"（▶ 練習する：分割された文を一文ずつ聞く）
     ============================================================ */

  function renderListenScreen(root, params = {}) {
    const set = getById(params.setId);
    if (!set) { root.appendChild(Utils.el("p", { class: "empty-state" }, "教材が見つかりません")); return; }

    const wrap = Utils.el("div", { class: "screen-inner" });
    wrap.appendChild(Utils.el("h2", {}, set.title));

    const audioEl = watchAudio(Utils.el("audio", { controls: "true", style: "width:100%;" }));
    const player = createPlayer(audioEl);
    const originalFile = getOriginalAudioFile(set);

    let mode = null;      // "full"（分割前の音声）| "segment"（一文ずつ）
    let listened = 0;     // 分割前の音声を実際に聞いた秒数（シークで飛ばした分は数えない）
    let lastTime = 0;
    let fullCompleted = false;
    const rewardNote = Utils.el("p", { class: "explore-desc dict-reward-note" }, "");

    audioEl.addEventListener("timeupdate", () => {
      if (mode !== "full") return;
      const d = audioEl.currentTime - lastTime;
      if (d > 0 && d < 1.5) listened += d;
      lastTime = audioEl.currentTime;
    });
    audioEl.addEventListener("ended", () => {
      if (mode !== "full") return;
      // 通しで聞いた実時間が全体の9割以上のときだけ「最後まで再生した」と扱う
      if (audioEl.duration && listened >= audioEl.duration * 0.9) {
        fullCompleted = true;
        rewardNote.textContent = `最後まで聞きました。「編集画面に戻る」を押すと🧭${REWARD_LISTEN}個もらえます。`;
      }
    });

    const lineButtons = [];
    function highlight(activeBtn) {
      lineButtons.forEach((b) => b.classList.toggle("is-playing", b === activeBtn));
    }

    const topBtn = Utils.el("button", {
      class: "btn btn-moss btn-block",
      onclick: () => {
        if (!originalFile) { Utils.showToast("音源が登録されていません。編集画面でアップロードしてください", "error"); return; }
        mode = "full"; listened = 0; lastTime = 0; fullCompleted = false;
        rewardNote.textContent = "";
        highlight(null);
        player.playRange(originalFile, 0, null);
      },
    }, "▶ 練習する");
    wrap.appendChild(topBtn);
    wrap.appendChild(Utils.el("p", { class: "explore-desc" }, "上のボタンで分割前の音声を最初から再生します。下の文をタップすると、その一文だけを再生します。"));
    wrap.appendChild(audioEl);
    wrap.appendChild(rewardNote);

    const listBox = Utils.el("div", { class: "dict-listen-list" });
    if (set.sentences.length === 0) {
      listBox.appendChild(Utils.el("p", { class: "empty-state" }, "まだ一文分割されていません。編集画面で分割してください。"));
    }
    set.sentences.forEach((sent, idx) => {
      const file = sent.audio ? set.audioFiles.find((f) => f.id === sent.audio.fileId) : null;
      const playable = !!(sent.audio && file);
      const btn = Utils.el("button", {
        class: "panel dict-sentence-btn" + (playable ? "" : " is-disabled"),
        disabled: !playable || undefined,
        onclick: () => {
          mode = "segment";
          highlight(btn);
          player.playRange(file, sent.audio.start, sent.audio.end, () => highlight(null));
        },
      }, [
        Utils.el("span", { class: "dict-sentence-no" }, `${idx + 1}`),
        Utils.el("span", { class: "dict-sentence-text" }, sent.text),
        playable ? null : Utils.el("span", { class: "dict-sentence-note" }, "（音声未設定）"),
      ]);
      lineButtons.push(btn);
      listBox.appendChild(btn);
    });
    wrap.appendChild(listBox);

    wrap.appendChild(Utils.el("button", {
      class: "btn btn-moss btn-block dict-btn-gap",
      onclick: () => {
        player.stop();
        if (fullCompleted) {
          const granted = claimReward(set.id, "listen", REWARD_LISTEN);
          if (granted > 0) Utils.showToast(`🧭 コンパスを${granted}個獲得しました`, "success");
          else Utils.showToast("この教材の「練習する」の報酬は、今日はすでに受け取り済みです", "info");
        }
        Router.navigate("dictationDetail", { setId: set.id });
      },
    }, "編集画面に戻る"));

    root.appendChild(wrap);
  }

  /* ============================================================
     画面："dictationPractice"（ディクテーション：一文ずつ聞き取って入力）
     ============================================================ */

  function renderPracticeScreen(root, params = {}) {
    const set = getById(params.setId);
    if (!set) { root.appendChild(Utils.el("p", { class: "empty-state" }, "教材が見つかりません")); return; }
    const playable = set.sentences.filter((s) => s.audio);
    if (playable.length === 0) {
      root.appendChild(Utils.el("p", { class: "empty-state" }, "音声が対応付けられた文がありません。先に教材の編集で音声を設定してください。"));
      return;
    }

    const wrap = Utils.el("div", { class: "screen-inner" });
    wrap.appendChild(Utils.el("h2", {}, set.title));

    let index = 0;
    let showingText = false;
    // 各文の「最初の答え合わせ」の結果（全問正解の判定に使う）。答えを見てから答え合わせした文は不正解扱い。
    const results = new Map();   // sentenceId → correct(boolean)
    const peeked = new Set();    // 答え合わせ前に「答えを見る」を使った文

    const audioEl = watchAudio(Utils.el("audio", { controls: "true", style: "width:100%;" }));
    const player = createPlayer(audioEl);
    const counter = Utils.el("div", { class: "flashcard-counter" }, "");
    const progress = Utils.el("p", { class: "explore-desc dict-reward-note" }, "");
    const textBox = Utils.el("div", { class: "panel" });
    const answerInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "聞き取った内容を入力" });
    const judgeBox = Utils.el("div", {});

    function isAllAnswered() { return results.size >= playable.length; }
    function isAllCorrect() { return isAllAnswered() && [...results.values()].every(Boolean); }

    function updateProgress() {
      let text = `解答済み ${results.size} / ${playable.length}`;
      if (isAllAnswered()) {
        text += isAllCorrect()
          ? `　全問正解です！「編集画面に戻る」を押すと🧭${REWARD_DICTATION_PERFECT}個もらえます。`
          : `　最後まで解きました。「編集画面に戻る」を押すと🧭${REWARD_DICTATION}個もらえます。`;
      }
      progress.textContent = text;
    }

    function render() {
      const sent = playable[index];
      counter.textContent = `${index + 1} / ${playable.length}`;
      textBox.innerHTML = "";
      textBox.appendChild(Utils.el("p", {}, showingText ? sent.text : "（再生して聞き取ってください。「答えを見る」で表示）"));
      answerInput.value = "";
      judgeBox.innerHTML = "";
      updateProgress();
    }

    const playBtn = Utils.el("button", {
      class: "btn btn-moss",
      onclick: () => {
        const sent = playable[index];
        const file = set.audioFiles.find((f) => f.id === sent.audio.fileId);
        if (!file) { Utils.showToast("この文の音源が見つかりません", "error"); return; }
        player.playRange(file, sent.audio.start, sent.audio.end);
      },
    }, "▶ この文を再生");

    const checkBtn = Utils.el("button", {
      class: "btn btn-secondary",
      onclick: () => {
        const sent = playable[index];
        const isCorrect = answerInput.value.trim() === sent.text.trim();
        if (!results.has(sent.id)) results.set(sent.id, isCorrect && !peeked.has(sent.id));
        judgeBox.innerHTML = "";
        judgeBox.appendChild(Utils.el("p", {}, isCorrect ? "正解！" : `正しくは: ${sent.text}`));
        updateProgress();
      },
    }, "答え合わせ");

    const showBtn = Utils.el("button", {
      class: "btn btn-secondary",
      onclick: () => {
        const sent = playable[index];
        if (!showingText && !results.has(sent.id)) peeked.add(sent.id);
        showingText = !showingText;
        render();
      },
    }, "答えを見る");

    const navRow = Utils.el("div", { class: "quiz-choice-row" }, [
      Utils.el("button", { class: "btn btn-secondary", onclick: () => { index = (index - 1 + playable.length) % playable.length; showingText = false; render(); } }, "← 前の文"),
      Utils.el("button", { class: "btn btn-secondary", onclick: () => { index = (index + 1) % playable.length; showingText = false; render(); } }, "次の文 →"),
    ]);

    wrap.appendChild(counter);
    wrap.appendChild(progress);
    wrap.appendChild(Utils.el("p", { class: "explore-desc" }, "全問正解の判定は、各文の最初の答え合わせで決まります。答えを見てから答え合わせした文は不正解として扱われます。"));
    wrap.appendChild(audioEl);
    wrap.appendChild(Utils.el("div", { class: "quiz-choice-row" }, [playBtn, showBtn]));
    wrap.appendChild(textBox);
    wrap.appendChild(answerInput);
    wrap.appendChild(checkBtn);
    wrap.appendChild(judgeBox);
    wrap.appendChild(navRow);
    wrap.appendChild(Utils.el("button", {
      class: "btn btn-moss btn-block", style: "margin-top:16px;",
      onclick: () => {
        player.stop();
        if (isAllAnswered()) {
          const amount = isAllCorrect() ? REWARD_DICTATION_PERFECT : REWARD_DICTATION;
          const granted = claimReward(set.id, "dictation", amount);
          if (granted > 0) Utils.showToast(`🧭 コンパスを${granted}個獲得しました`, "success");
          else Utils.showToast("この教材のディクテーション報酬は、今日はすでに受け取り済みです", "info");
        }
        Router.navigate("dictationDetail", { setId: set.id });
      },
    }, "編集画面に戻る"));

    render();
    root.appendChild(wrap);
  }

  Router.registerScreen("dictationList", renderListScreen);
  Router.registerScreen("dictationDetail", renderDetailScreen);
  Router.registerScreen("dictationListen", renderListenScreen);
  Router.registerScreen("dictationPractice", renderPracticeScreen);

  return {
    getAll, getById, createSet, updateSet, deleteSet,
    splitTextToSentences, setSentencesFromText, addAudioFiles,
    autoSplitByCharCount, setSentenceAudio,
    exportBackupZip, importBackupZip, getOriginalAudioFile,
  };
})();
