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
      index: 0, userAnswers: [], hadWrongThisRun: false,
    };
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
    root.appendChild(wrap);
  }

  function renderQuestionItem(item) {
    const box = Utils.el("div", { class: "panel quiz-item" }, [
      Utils.el("p", { class: "quiz-prompt" }, item.prompt),
    ]);

    if (item.type === "true_false") {
      box.appendChild(Utils.el("div", { class: "quiz-shown-answer" }, `→ ${item.shownAnswer}`));
      box.appendChild(Utils.el("div", { class: "quiz-choice-row" }, [
        Utils.el("button", { class: "btn btn-moss", onclick: () => submitAnswer(true) }, "正答"),
        Utils.el("button", { class: "btn btn-secondary", onclick: () => submitAnswer(false) }, "誤答"),
      ]));
    } else if (item.type === "multiple_choice") {
      const choiceWrap = Utils.el("div", { class: "quiz-choice-grid" });
      item.choices.forEach((choice) => {
        choiceWrap.appendChild(
          Utils.el("button", { class: "btn btn-secondary quiz-choice-btn", onclick: () => submitAnswer(choice) }, choice)
        );
      });
      box.appendChild(choiceWrap);
    } else if (item.type === "reorder") {
      box.appendChild(renderReorderUI(item));
    }

    return box;
  }

  function renderReorderUI(item) {
    const wrap = Utils.el("div", { class: "reorder-wrap" });
    let picked = [];
    const answerDisplay = Utils.el("div", { class: "reorder-answer-display" }, "");
    const poolDisplay = Utils.el("div", { class: "reorder-pool" });

    const refreshPool = () => {
      poolDisplay.innerHTML = "";
      item.scrambled.forEach((ch, idx) => {
        if (picked.includes(idx)) return;
        poolDisplay.appendChild(
          Utils.el("button", {
            class: "char-chip",
            onclick: () => {
              picked.push(idx);
              answerDisplay.textContent = picked.map((i) => item.scrambled[i]).join("");
              refreshPool();
            },
          }, ch)
        );
      });
    };
    refreshPool();

    const resetBtn = Utils.el("button", {
      class: "btn btn-secondary",
      onclick: () => { picked = []; answerDisplay.textContent = ""; refreshPool(); },
    }, "やり直す");

    const submitBtn = Utils.el("button", {
      class: "btn btn-moss",
      onclick: () => submitAnswer(picked.map((i) => item.scrambled[i]).join("")),
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
    if (!isCorrect) session.hadWrongThisRun = true;

    Utils.showToast(isCorrect ? "正解！" : "不正解…", isCorrect ? "success" : "error");

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

  return { startLevel, isLevelLocked, emptyStageProgress, levelLabel };
})();
