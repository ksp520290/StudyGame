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

  function getAll() {
    return GameState.getState().dictationSets || [];
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
     画面："dictationList"
     ============================================================ */

  function renderListScreen(root) {
    const wrap = Utils.el("div", { class: "screen-inner" });
    wrap.appendChild(Utils.el("h2", {}, "音読ディクテーション"));
    wrap.appendChild(Utils.el("p", { class: "explore-desc" }, "外国語の音読用テキストと音源を登録し、一文ずつのディクテーション練習ができます（任意機能）。"));

    wrap.appendChild(Utils.el("button", {
      class: "btn btn-primary btn-block",
      onclick: () => {
        const id = createSet("無題の教材");
        Router.navigate("dictationDetail", { setId: id });
      },
    }, "＋ 新しい教材を追加"));

    const list = Utils.el("div", { class: "books-list" });
    getAll().forEach((s) => {
      list.appendChild(Utils.el("button", { class: "panel book-list-row", onclick: () => Router.navigate("dictationDetail", { setId: s.id }) }, [
        Utils.el("h3", {}, s.title),
        Utils.el("p", {}, `文の数: ${s.sentences.length} ／ 音源ファイル数: ${s.audioFiles.length}`),
      ]));
    });
    if (getAll().length === 0) {
      list.appendChild(Utils.el("p", { class: "empty-state" }, "まだ教材がありません。"));
    }
    wrap.appendChild(list);
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

    wrap.appendChild(Utils.el("button", {
      class: "btn btn-moss btn-block", style: "margin:8px 0;",
      onclick: () => Router.navigate("dictationPractice", { setId: set.id }),
    }, "▶ 練習する"));

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
      const previewAudio = Utils.el("audio", { controls: "true", style: "width:100%; margin-top:6px;" });
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
    wrap.appendChild(Utils.el("button", { class: "btn btn-moss btn-block", onclick: () => Router.navigate("dictationList") }, "一覧に戻る"));

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

    const audioEl = Utils.el("audio", { controls: "true", style: "width:100%;" });
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
    row.appendChild(Utils.el("div", { class: "quiz-choice-row" }, [previewBtn, saveBtn]));
    return row;
  }

  /* ============================================================
     画面："dictationPractice"（一文ずつのディクテーション練習）
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
    const audioEl = Utils.el("audio", { controls: "true", style: "width:100%;" });
    const counter = Utils.el("div", { class: "flashcard-counter" }, "");
    const textBox = Utils.el("div", { class: "panel" });
    const answerInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "聞き取った内容を入力" });
    const judgeBox = Utils.el("div", {});

    function render() {
      const sent = playable[index];
      counter.textContent = `${index + 1} / ${playable.length}`;
      const file = set.audioFiles.find((f) => f.id === sent.audio.fileId);
      audioEl.src = file ? file.dataUrl : "";
      textBox.innerHTML = "";
      textBox.appendChild(Utils.el("p", {}, showingText ? sent.text : "（再生して聞き取ってください。「答えを見る」で表示）"));
      answerInput.value = "";
      judgeBox.innerHTML = "";
    }

    const playBtn = Utils.el("button", {
      class: "btn btn-moss",
      onclick: () => {
        const sent = playable[index];
        audioEl.currentTime = sent.audio.start;
        audioEl.play();
        const onTime = () => {
          if (audioEl.currentTime >= sent.audio.end) { audioEl.pause(); audioEl.removeEventListener("timeupdate", onTime); }
        };
        audioEl.addEventListener("timeupdate", onTime);
      },
    }, "▶ この文を再生");

    const checkBtn = Utils.el("button", {
      class: "btn btn-secondary",
      onclick: () => {
        const sent = playable[index];
        const isCorrect = answerInput.value.trim() === sent.text.trim();
        judgeBox.innerHTML = "";
        judgeBox.appendChild(Utils.el("p", {}, isCorrect ? "正解！" : `正しくは: ${sent.text}`));
      },
    }, "答え合わせ");

    const showBtn = Utils.el("button", {
      class: "btn btn-secondary",
      onclick: () => { showingText = !showingText; render(); },
    }, "答えを見る");

    const navRow = Utils.el("div", { class: "quiz-choice-row" }, [
      Utils.el("button", { class: "btn btn-secondary", onclick: () => { index = (index - 1 + playable.length) % playable.length; showingText = false; render(); } }, "← 前の文"),
      Utils.el("button", { class: "btn btn-secondary", onclick: () => { index = (index + 1) % playable.length; showingText = false; render(); } }, "次の文 →"),
    ]);

    wrap.appendChild(counter);
    wrap.appendChild(audioEl);
    wrap.appendChild(Utils.el("div", { class: "quiz-choice-row" }, [playBtn, showBtn]));
    wrap.appendChild(textBox);
    wrap.appendChild(answerInput);
    wrap.appendChild(checkBtn);
    wrap.appendChild(judgeBox);
    wrap.appendChild(navRow);
    wrap.appendChild(Utils.el("button", { class: "btn btn-moss btn-block", style: "margin-top:16px;", onclick: () => Router.navigate("dictationDetail", { setId: set.id }) }, "編集画面に戻る"));

    render();
    root.appendChild(wrap);
  }

  Router.registerScreen("dictationList", renderListScreen);
  Router.registerScreen("dictationDetail", renderDetailScreen);
  Router.registerScreen("dictationPractice", renderPracticeScreen);

  return {
    getAll, getById, createSet, updateSet, deleteSet,
    splitTextToSentences, setSentencesFromText, addAudioFiles,
    autoSplitByCharCount, setSentenceAudio,
  };
})();
