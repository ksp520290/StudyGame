/**
 * resultSystem.js
 * -----------------------------------------
 * 仕様書14〜15章の「Perfect / Clear / Fail」判定を担う。
 */

const ResultSystem = (() => {

  function evaluateLevelResult({ genreId, stageId, level, userAnswers, hadWrongThisRun, onRetry }) {
    const state = GameState.getState();
    const progress = state.stageProgress[stageId];

    if (hadWrongThisRun) {
      GameState.update((s) => {
        s.stageProgress[stageId].firstAttemptFailed[level] = true;
      });
      renderFailScreen({ stageId, userAnswers, onRetry });
      return;
    }

    const wasEverFailedBefore = progress.firstAttemptFailed[level];
    const resultType = wasEverFailedBefore ? "clear" : "perfect";

    GameState.update((s) => {
      const p = s.stageProgress[stageId];
      p.levels[level] = "cleared";
      if (!p.levelResults) p.levelResults = { lv1: null, lv2: null, lv3: null };
      p.levelResults[level] = resultType;
    });

    const compassEarned = RewardSystem.calcCompassReward(level);
    RewardSystem.grantCompass(compassEarned);

    const stageJustCompleted = checkAndFinalizeStage(genreId, stageId);

    renderSuccessScreen({ resultType, compassEarned, level, stageJustCompleted });
  }

  function checkAndFinalizeStage(genreId, stageId) {
    const state = GameState.getState();
    const p = state.stageProgress[stageId];
    const allCleared = p.levels.lv1 === "cleared" && p.levels.lv2 === "cleared" && p.levels.lv3 === "cleared";
    if (!allCleared || p.result !== "none") return false;

    const stageWasPerfect = ["lv1", "lv2", "lv3"].every((lv) => p.levelResults[lv] === "perfect");

    GameState.update((s) => {
      const sp = s.stageProgress[stageId];
      sp.result = stageWasPerfect ? "perfect" : "clear";
      sp.completedAt = Utils.todayStr();
    });

    ReviewSystem.scheduleInitialReviews(genreId, stageId, stageWasPerfect);

    // 【Phase9】新規学習カテゴリの称号判定（仕様63章）。ステージが完了した瞬間に判定する。
    if (typeof TitleSystem !== "undefined") TitleSystem.checkAndAward({ trigger: "stageComplete" });

    return true;
  }

  function renderFailScreen({ stageId, userAnswers, onRetry }) {
    const root = document.getElementById("screen-container");
    root.innerHTML = "";
    const wrap = Utils.el("div", { class: "screen screen-inner result-screen" });

    wrap.appendChild(Utils.el("h2", { class: "result-fail-title" }, "もう少し！"));
    wrap.appendChild(Utils.el("p", {}, "間違えた問題を確認して、もう一度挑戦しましょう。誤答は記録に残りません。"));

    const list = Utils.el("div", { class: "panel answer-review-list" });
    userAnswers.forEach((a) => {
      const row = Utils.el("div", { class: "answer-review-row " + (a.isCorrect ? "is-correct" : "is-wrong") }, [
        Utils.el("span", {}, a.item.prompt),
        Utils.el("span", { class: "answer-correct-value" }, `正解: ${Utils.formatAnswerValue(a.item.correctAnswer)}`),
      ]);
      row.addEventListener("click", () => Utils.showAnswerDetailPopup({
        questionId: a.item.questionId,
        prompt: a.item.prompt,
        isCorrect: a.isCorrect,
        userAnswer: a.userAnswer,
        correctAnswer: a.item.correctAnswer,
        note: a.item.note,
      }));
      list.appendChild(row);
    });
    wrap.appendChild(list);

    // 【追加要望対応】今回出題された問題と正答をフラッシュカード形式で確認できるボタン。
    // 「再挑戦」ボタンの上に配置する。
    wrap.appendChild(Utils.el("button", {
      class: "btn btn-secondary btn-block",
      onclick: () => renderFlashcardScreen(userAnswers, () => renderFailScreen({ stageId, userAnswers, onRetry })),
    }, "カード"));

    // 【追加要望対応】「再挑戦」に加えて、ステージ地図へ戻る「ステージへ」ボタンを設置。
    wrap.appendChild(Utils.el("div", { class: "quiz-choice-row" }, [
      Utils.el("button", {
        class: "btn btn-secondary",
        onclick: () => {
          const ctx = GameState.findStageContext(stageId);
          if (ctx) Router.navigate("areaMap", { genreId: ctx.genre.id, questionSetId: ctx.questionSet.id });
          else Router.navigate("fogStageSelect");
        },
      }, "ステージへ"),
      Utils.el("button", { class: "btn btn-primary", onclick: onRetry }, "再挑戦する"),
    ]));

    root.appendChild(wrap);
  }

  /**
   * 【追加要望対応】「カード」ボタンから開くフラッシュカード画面。
   * 今回出題された問題と正答を1枚ずつ表示し、タップすると問題⇔正答が切り替わる。
   * 「前へ／次へ」で他の問題のカードに移動できる。
   */
  function renderFlashcardScreen(userAnswers, onBack) {
    const root = document.getElementById("screen-container");
    root.innerHTML = "";
    const wrap = Utils.el("div", { class: "screen screen-inner flashcard-screen" });
    wrap.appendChild(Utils.el("h2", {}, "カード"));
    wrap.appendChild(Utils.el("p", { class: "explore-desc", style: "text-align:center;" }, "カードをタップすると問題と正答が切り替わります。"));

    let index = 0;
    let showingAnswer = false;

    const counter = Utils.el("div", { class: "flashcard-counter" }, "");
    const card = Utils.el("div", {
      class: "flashcard", tabindex: "0", role: "button",
      "aria-label": "タップで問題と正答を切り替え",
      onclick: () => { showingAnswer = !showingAnswer; render(); },
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { showingAnswer = !showingAnswer; render(); } },
    });

    function render() {
      const a = userAnswers[index];
      counter.textContent = `${index + 1} / ${userAnswers.length}`;
      card.innerHTML = "";
      card.classList.toggle("is-flipped", showingAnswer);
      card.appendChild(Utils.el("div", { class: "flashcard-face-label" }, showingAnswer ? "正答" : "問題"));
      card.appendChild(Utils.el("div", { class: "flashcard-face-content" },
        showingAnswer ? Utils.formatAnswerValue(a.item.correctAnswer) : a.item.prompt));
    }

    const navRow = Utils.el("div", { class: "quiz-choice-row" }, [
      Utils.el("button", {
        class: "btn btn-secondary",
        onclick: () => { index = (index - 1 + userAnswers.length) % userAnswers.length; showingAnswer = false; render(); },
      }, "← 前へ"),
      Utils.el("button", {
        class: "btn btn-secondary",
        onclick: () => { index = (index + 1) % userAnswers.length; showingAnswer = false; render(); },
      }, "次へ →"),
    ]);

    wrap.appendChild(counter);
    wrap.appendChild(card);
    wrap.appendChild(navRow);
    wrap.appendChild(Utils.el("button", { class: "btn btn-primary btn-block", style: "margin-top:16px;", onclick: onBack }, "結果へ戻る"));

    render();
    root.appendChild(wrap);
  }

  function renderSuccessScreen({ resultType, compassEarned, level, stageJustCompleted }) {
    const root = document.getElementById("screen-container");
    root.innerHTML = "";
    const wrap = Utils.el("div", { class: "screen screen-inner result-screen pulse-once" });

    const title = resultType === "perfect" ? "Perfect！" : "Clear！";
    wrap.appendChild(Utils.el("h2", { class: "result-success-title" }, title));
    wrap.appendChild(Utils.el("p", {}, `${levelLabelJa(level)} をクリアしました。`));

    wrap.appendChild(Utils.el("div", { class: "panel reward-panel" }, [
      Utils.el("div", { class: "reward-line" }, `🧭 コンパス +${compassEarned}`),
    ]));

    if (stageJustCompleted) {
      wrap.appendChild(Utils.el("div", { class: "panel stage-complete-panel pop-in" }, [
        Utils.el("h3", {}, "土地の霧が晴れた！"),
        Utils.el("p", {}, "この場所への新規学習は完了です。しばらくすると復習の時期がやってきます。"),
      ]));
    }

    wrap.appendChild(Utils.el("button", { class: "btn btn-moss btn-block", onclick: () => Router.navigate("fogStageSelect") }, "次へ進む"));

    root.appendChild(wrap);
  }

  function levelLabelJa(level) {
    return { lv1: "Lv1（正誤問題）", lv2: "Lv2（四択問題）", lv3: "Lv3（並び替え問題）" }[level] || level;
  }

  return { evaluateLevelResult };
})();
