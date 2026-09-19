/**
 * quizSystem.js
 * -----------------------------------------
 * 「未知の霧（新規学習）」の出題〜採点フローを管理する。
 * 1回のプレイ単位（session）は「1ステージ内の1レベル（Lv1/Lv2/Lv3）」= 1クエスト。
 *
 * 責務：
 *   - 問題の出題・回答受付・採点
 *   - 採点結果を resultSystem.js に渡して Perfect/Clear/Fail 判定・報酬処理を行わせる
 *
 * 【Phase5での変更点】
 *   ステージ選択画面（"fogStageSelect"）は、これまでこのファイルが持つ
 *   renderStageSelectScreen（テキストの一覧表示）で代替していたが、
 *   Phase5でmapSystem.jsが地図ベースのUIに置き換えたため、このファイルは
 *   もう "fogStageSelect" 画面を登録しない。
 *   代わりに、mapSystem.js が再利用できるよう isLevelLocked / emptyStageProgress /
 *   levelLabel をエクスポートする（ロック判定・進捗初期値・表示ラベルの単一の実装元）。
 */

const QuizSystem = (() => {
  let session = null; // { stageId, level, genreId, items, index, userAnswers, hadWrongThisRun }

  function levelLabel(level) {
    return { lv1: "○ Lv1", lv2: "△ Lv2", lv3: "□ Lv3" }[level];
  }

  /** Lv2はLv1クリア後、Lv3はLv2クリア後にのみ挑戦可能（ゴール勾配効果のための段階解放） */
  function isLevelLocked(progress, level) {
    if (level === "lv1") return false;
    if (level === "lv2") return progress.levels.lv1 !== "cleared";
    if (level === "lv3") return progress.levels.lv2 !== "cleared";
    return false;
  }

  function emptyStageProgress() {
    return {
      levels: { lv1: "none", lv2: "none", lv3: "none" },
      firstAttemptFailed: { lv1: false, lv2: false, lv3: false },
      result: "none",
      completedAt: null,
    };
  }

  function ensureStageProgress(stageId) {
    GameState.update((state) => {
      if (!state.stageProgress[stageId]) {
        state.stageProgress[stageId] = emptyStageProgress();
      }
    });
    return GameState.getState().stageProgress[stageId];
  }

  /* ============================================================
     出題・進行
     ============================================================ */

  function startLevel(genreId, stageId, level) {
    ensureStageProgress(stageId);
    const ctx = GameState.findStageContext(stageId);
    if (!ctx) {
      Utils.showToast("ステージデータが見つかりませんでした", "error");
      return;
    }
    const items = QuestionSystem.buildQuestionsForLevel(level, ctx.stage.questions);
    session = {
      genreId, stageId, level, items,
      index: 0, userAnswers: [], hadWrongThisRun: false, voiceLine: null,
    };
    // 【追加要望対応】serihu.jsonの読み込みを先読みしておく（1問目の正解時に間に合うように）。
    if (typeof CharacterVoiceSystem !== "undefined") CharacterVoiceSystem.ensureLoaded();
    Router.navigate("quiz");
  }

  function renderQuizScreen(root) {
    if (!session) {
      root.appendChild(Utils.el("p", { class: "empty-state" }, "出題データがありません"));
      return;
    }
    const item = session.items[session.index];
    const wrap = Utils.el("div", { class: "screen-inner quiz-screen" });

    wrap.appendChild(Utils.el("div", { class: "quiz-progress" },
      `問題 ${session.index + 1} / ${session.items.length}`));

    wrap.appendChild(renderQuestionItem(item));

    // 【追加要望対応】1問目以降、直前に解いた問題の正誤・正答・補足（note）を
    // 問題表示画面の下部に表示する。
    if (session.index > 0) {
      const prevAnswer = session.userAnswers[session.userAnswers.length - 1];
      if (prevAnswer) wrap.appendChild(renderPreviousFeedback(prevAnswer));
    }

    // 【追加要望対応】問題画面下部にキャラクターを表示し、1問正解するごとに
    // 声かけ（セリフ）を表示する。
    wrap.appendChild(renderCharacterVoicePanel());

    root.appendChild(wrap);
  }

  /**
   * 【追加要望対応】問題画面下部のキャラクター声かけパネル。
   * そのジャンルに割り当てられたキャラクター（未取得でも仮の姿・絵文字で表示される）が、
   * 直前に正解した際のセリフ（session.voiceLine）を話す。まだ何も正解していない
   * 1問目では、待機中の案内文を表示する。
   */
  function renderCharacterVoicePanel() {
    let avatarNode = Utils.el("span", { class: "quiz-voice-avatar" }, "🧑");
    let name = "";
    if (typeof CharacterSystem !== "undefined") {
      const ctx = GameState.findStageContext(session.stageId);
      const genre = ctx ? ctx.genre : null;
      if (genre) {
        CharacterSystem.ensureDefaultCharacterDefs();
        const def = (CharacterSystem.getDefsForGenre(genre.id) || [])[0];
        if (def) {
          avatarNode = Utils.iconOrImage(def.image, "quiz-voice-avatar");
          name = def.nickname || def.name || "";
        }
      }
    }
    const line = session.voiceLine;
    return Utils.el("div", { class: "quiz-voice-panel" }, [
      avatarNode,
      Utils.el("div", { class: "quiz-voice-bubble-wrap" }, [
        name ? Utils.el("div", { class: "quiz-voice-name" }, name) : null,
        Utils.el("div", { class: "quiz-voice-bubble" + (line ? "" : " is-idle") },
          line || "正解すると、ここで声をかけてくれるよ。"),
      ]),
    ]);
  }

  /**
   * 【追加要望対応】前問の正誤・正答・補足情報（CSVのnote列）を表示するパネル。
   * 「正答 : 」の横に正答の選択肢を表示し、それ以外の補足情報はアコーディオンで開閉できる。
   */
  function renderPreviousFeedback(prevAnswer) {
    const item = prevAnswer.item;
    const wrap = Utils.el("div", { class: "panel prev-feedback-panel" });
    wrap.appendChild(Utils.el("h4", { class: "prev-feedback-title" }, "前問の補足"));
    wrap.appendChild(Utils.el("div", {
      class: "prev-feedback-status " + (prevAnswer.isCorrect ? "is-correct" : "is-wrong"),
    }, prevAnswer.isCorrect ? "正答" : "誤答"));
    wrap.appendChild(Utils.el("div", { class: "prev-feedback-answer" }, [
      Utils.el("span", { class: "prev-feedback-answer-label" }, "正答 : "),
      Utils.el("span", { class: "prev-feedback-answer-value" },
        Utils.formatAnswerValue(item.answerText != null ? item.answerText : item.correctAnswer)),
    ]));

    const note = item.note;
    if (note && String(note).trim()) {
      const details = Utils.el("details", { class: "settings-accordion prev-feedback-note-accordion" });
      details.appendChild(Utils.el("summary", {}, "補足"));
      details.appendChild(Utils.el("div", { class: "prev-feedback-note-content" }, note));
      wrap.appendChild(details);
    }
    return wrap;
  }

  /**
   * 【追加要望対応】Lv1（正誤）・Lv2（四択）の選択肢ボタンについて、文字が長すぎて
   * 枠内（ボタン内）に収まらない（＝折り返しが発生する）場合は、横並びではなく
   * 縦に1列で並べる表示に切り替える。
   * ボタンがまだDOMに接続されていない（＝clientWidthが確定していない）ことがあるため、
   * requestAnimationFrameで実際に描画された後に判定する。判定は「一時的にnowrapにして
   * scrollWidthとclientWidthを比較する」方式で、判定後は元の折り返し設定に戻すため、
   * 通常時の見た目には影響しない。
   * @param {HTMLElement} containerEl 選択肢ボタンを内包する要素（quiz-choice-row / quiz-choice-grid）
   */
  function adjustChoiceLayoutIfOverflowing(containerEl) {
    requestAnimationFrame(() => {
      const buttons = Array.from(containerEl.querySelectorAll("button"));
      if (buttons.length === 0) return;
      const anyOverflow = buttons.some((btn) => {
        const prevWhiteSpace = btn.style.whiteSpace;
        btn.style.whiteSpace = "nowrap";
        const overflow = btn.scrollWidth > btn.clientWidth + 1;
        btn.style.whiteSpace = prevWhiteSpace;
        return overflow;
      });
      if (anyOverflow) containerEl.classList.add("is-vertical-choices");
    });
  }

  function renderQuestionItem(item, onSubmit) {
    const submit = onSubmit || submitAnswer;
    const box = Utils.el("div", { class: "panel quiz-item" }, [
      Utils.el("p", { class: "quiz-prompt" }, item.prompt),
    ]);

    if (item.type === "true_false") {
      box.appendChild(Utils.el("div", { class: "quiz-shown-answer" }, `→ ${item.shownAnswer}`));
      const choiceRow = Utils.el("div", { class: "quiz-choice-row" }, [
        Utils.el("button", { class: "btn btn-moss", onclick: () => submit(true) }, "正答"),
        Utils.el("button", { class: "btn btn-secondary", onclick: () => submit(false) }, "誤答"),
      ]);
      box.appendChild(choiceRow);
      adjustChoiceLayoutIfOverflowing(choiceRow);
    } else if (item.type === "multiple_choice") {
      const choiceWrap = Utils.el("div", { class: "quiz-choice-grid" });
      item.choices.forEach((choice) => {
        choiceWrap.appendChild(
          Utils.el("button", { class: "btn btn-secondary quiz-choice-btn", onclick: () => submit(choice) }, choice)
        );
      });
      box.appendChild(choiceWrap);
      adjustChoiceLayoutIfOverflowing(choiceWrap);
    } else if (item.type === "reorder") {
      box.appendChild(renderReorderUI(item, submit));
    }

    return box;
  }

  /**
   * 【追加要望対応】並び替えUIの挙動変更：
   *   - 解答欄（answerDisplay）に並べたカードも1枚ずつタップ可能なボタンとして表示し、
   *     再タップすると解答欄から取り除き、元のプール内の位置（スロット）へ戻す。
   *   - プール側は使用済みのカードを詰めて再配置せず、そのスロットを「空いたまま」
   *     （見えないプレースホルダー）にして、他のカードの位置がズレないようにする。
   */
  function renderReorderUI(item, onSubmit) {
    const submit = onSubmit || submitAnswer;
    const wrap = Utils.el("div", { class: "reorder-wrap" });
    let picked = []; // タップされた順に並ぶ、item.scrambled内のインデックス配列
    const answerDisplay = Utils.el("div", { class: "reorder-answer-display" });
    const poolDisplay = Utils.el("div", { class: "reorder-pool" });

    const refresh = () => {
      // 解答欄：選んだ順にチップを表示。タップで取り消し、元のプール位置へ戻す。
      answerDisplay.innerHTML = "";
      picked.forEach((idx) => {
        answerDisplay.appendChild(
          Utils.el("button", {
            class: "char-chip char-chip-picked",
            onclick: () => {
              picked = picked.filter((i) => i !== idx);
              refresh();
            },
          }, item.scrambled[idx])
        );
      });

      // プール：全スロットを常に同じ位置に表示し、使用済みスロットは詰めずに空けておく。
      poolDisplay.innerHTML = "";
      item.scrambled.forEach((ch, idx) => {
        if (picked.includes(idx)) {
          poolDisplay.appendChild(Utils.el("span", { class: "char-chip char-chip-empty" }, ""));
        } else {
          poolDisplay.appendChild(
            Utils.el("button", {
              class: "char-chip",
              onclick: () => {
                picked.push(idx);
                refresh();
              },
            }, ch)
          );
        }
      });
    };
    refresh();

    const resetBtn = Utils.el("button", {
      class: "btn btn-secondary",
      onclick: () => { picked = []; refresh(); },
    }, "やり直す");

    const submitBtn = Utils.el("button", {
      class: "btn btn-moss",
      onclick: () => submit(picked.map((i) => item.scrambled[i]).join("")),
    }, "決定");

    wrap.appendChild(answerDisplay);
    wrap.appendChild(poolDisplay);
    wrap.appendChild(Utils.el("div", { class: "quiz-choice-row" }, [resetBtn, submitBtn]));
    return wrap;
  }

  function submitAnswer(rawAnswer) {
    const item = session.items[session.index];
    const isCorrect = checkAnswer(item, rawAnswer);
    session.userAnswers.push({ questionId: item.questionId, isCorrect, item, userAnswer: rawAnswer });
    if (!isCorrect) {
      session.hadWrongThisRun = true;
      // 【追加要望対応】☆フォルダ：問題単位で誤答回数を記録する（3回で☆フォルダ入り）。
      const addedToStar = GameState.recordQuestionMistake(item.questionId, session.genreId, session.stageId, session.level);
      if (addedToStar) Utils.showToast("この問題は☆フォルダに入りました（明日また出題されます）", "info");
    } else if (typeof CharacterVoiceSystem !== "undefined") {
      // 【追加要望対応】1問正解するごとに、キャラクターが声かけ（セリフ）をする。
      const ctx = GameState.findStageContext(session.stageId);
      CharacterVoiceSystem.ensureLoaded()
        .then(() => { session.voiceLine = CharacterVoiceSystem.pickLine(ctx ? ctx.genre : null); })
        .catch((err) => console.error("[quizSystem] セリフの取得に失敗しました", err));
    }

    // 【追加要望対応】正誤メッセージの表記を「正答」「誤答」に統一。
    Utils.showToast(isCorrect ? "正答" : "誤答", isCorrect ? "success" : "error");

    if (session.index < session.items.length - 1) {
      session.index += 1;
      Router.navigate("quiz");
    } else {
      finishLevel();
    }
  }

  function checkAnswer(item, rawAnswer) {
    if (item.type === "true_false") return rawAnswer === item.correctAnswer;
    return rawAnswer === item.correctAnswer;
  }

  function finishLevel() {
    ResultSystem.evaluateLevelResult({
      genreId: session.genreId,
      stageId: session.stageId,
      level: session.level,
      userAnswers: session.userAnswers,
      hadWrongThisRun: session.hadWrongThisRun,
      onRetry: () => startLevel(session.genreId, session.stageId, session.level),
    });
  }

  // 【Phase5変更】"fogStageSelect" は mapSystem.js が登録するため、ここでは登録しない。
  Router.registerScreen("quiz", renderQuizScreen);

  return {
    startLevel, isLevelLocked, emptyStageProgress, levelLabel, renderQuestionItem, checkAnswer,
    getSession: () => session,
  };
})();
