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

    // 【追加要望対応】「今日の目標」（コミットメント・デバイス）のカウントを進める。
    GameState.recordQuestCompletionForDailyGoal();

    renderSuccessScreen({ resultType, compassEarned, level, stageJustCompleted, genreId, stageId });
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
      // 【追加要望対応】Lv1（正誤）はcorrectAnswerがtrue/falseの真偽値のため、そのまま
      // 表示すると「正答」「誤答」という抽象的な文言になってしまう。実際に出題で使われた
      // 選択肢（answerText）が分かっている場合はそちらを優先して表示する。
      const correctDisplay = a.item.answerText != null ? a.item.answerText : a.item.correctAnswer;
      const row = Utils.el("div", { class: "answer-review-row " + (a.isCorrect ? "is-correct" : "is-wrong") }, [
        Utils.el("span", {}, a.item.prompt),
        Utils.el("span", { class: "answer-correct-value" }, `正解: ${Utils.formatAnswerValue(correctDisplay)}`),
      ]);
      row.addEventListener("click", () => Utils.showAnswerDetailPopup({
        questionId: a.item.questionId,
        prompt: a.item.prompt,
        isCorrect: a.isCorrect,
        userAnswer: a.userAnswer,
        correctAnswer: correctDisplay,
        note: a.item.note,
      }));
      list.appendChild(row);
    });
    wrap.appendChild(list);

    // 【追加要望対応】今回出題された問題と正答をフラッシュカード形式で確認できるボタン。
    // 「再挑戦」ボタンの上に配置する。下のボタン群との間にmarginを設ける。
    wrap.appendChild(Utils.el("button", {
      class: "btn btn-secondary btn-block",
      style: "margin-bottom: 20px;",
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

    /**
     * 【追加要望対応】「正答」面に、その問題で実際に使われた選択肢一覧を表示する。
     * Lv2（四択）: item.choices を、正答をハイライトして一覧表示。
     * Lv3（並び替え）: item.scrambled（バラバラのトークン）を、正答の並び順で一覧表示。
     * Lv1（正誤）や上記が無い形式: 従来通り正答の値のみを表示する。
     */
    function buildAnswerFaceContent(item) {
      const content = Utils.el("div", {}, []);
      // 【追加要望対応】Lv1（正誤）はcorrectAnswerが真偽値のため、そのまま表示すると
      // 「正答」「誤答」という文言になってしまう。実際に出題された選択肢（answerText）が
      // 分かっている場合はそちらを表示する（Lv2/Lv3はcorrectAnswerが既に実際の文字列のため、
      // answerTextと同じ値になり表示は変わらない）。
      const correctDisplay = item.answerText != null ? item.answerText : item.correctAnswer;
      content.appendChild(Utils.el("div", { class: "flashcard-face-content" }, Utils.formatAnswerValue(correctDisplay)));

      if (item.type === "multiple_choice" && Array.isArray(item.choices) && item.choices.length > 0) {
        const list = Utils.el("div", { class: "flashcard-choices-list" },
          item.choices.map((choice) => Utils.el("span", {
            class: "flashcard-choice-chip" + (choice === item.answerText ? " is-correct-choice" : ""),
          }, choice)));
        content.appendChild(list);
      } else if (item.type === "reorder" && Array.isArray(item.scrambled) && item.scrambled.length > 0) {
        const list = Utils.el("div", { class: "flashcard-choices-list" },
          item.scrambled.map((token) => Utils.el("span", { class: "flashcard-choice-chip is-correct-choice" }, token)));
        content.appendChild(list);
      }
      return content;
    }

    function render() {
      const a = userAnswers[index];
      counter.textContent = `${index + 1} / ${userAnswers.length}`;
      card.innerHTML = "";
      card.classList.toggle("is-flipped", showingAnswer);
      card.appendChild(Utils.el("div", {
        class: "flashcard-face-label" + (!showingAnswer ? " is-question-label" : ""),
      }, showingAnswer ? "正答" : "問題"));
      if (showingAnswer) {
        card.appendChild(buildAnswerFaceContent(a.item));
      } else {
        card.appendChild(Utils.el("div", { class: "flashcard-face-content" }, a.item.prompt));
      }
    }

    function goPrev() { index = (index - 1 + userAnswers.length) % userAnswers.length; showingAnswer = false; render(); }
    function goNext() { index = (index + 1) % userAnswers.length; showingAnswer = false; render(); }

    // 【追加要望対応】横方向のスライド（スワイプ）でもカードを切り替えられるようにする。
    let touchStartX = null;
    card.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
    card.addEventListener("touchend", (e) => {
      if (touchStartX === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(dx) < 40) return; // タップ扱い（クリックイベントに任せる）
      if (dx < 0) goNext(); else goPrev();
    }, { passive: true });

    const navRow = Utils.el("div", { class: "quiz-choice-row" }, [
      Utils.el("button", { class: "btn btn-secondary", onclick: goPrev }, "← 前へ"),
      Utils.el("button", { class: "btn btn-secondary", onclick: goNext }, "次へ →"),
    ]);

    wrap.appendChild(counter);
    wrap.appendChild(card);
    wrap.appendChild(navRow);
    wrap.appendChild(Utils.el("button", { class: "btn btn-primary btn-block", style: "margin-top:16px;", onclick: onBack }, "結果へ戻る"));

    render();
    root.appendChild(wrap);
  }

  function renderSuccessScreen({ resultType, compassEarned, level, stageJustCompleted, genreId, stageId }) {
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

    // 【追加要望対応】「次へ進む」を押した際に毎回エリア選択画面まで戻ってしまうと
    // 手間が多いため、Lv1・Lv2クリア時は「同じステージ」を選択した状態（レベル選択
    // ポップアップが開いた状態）へ、Lv3クリア時は「次のステージ」を選択した状態へ
    // 直接遷移する。あわせて「道の選択」「ステージ選択」ボタンも用意する。
    const ctx = GameState.findStageContext(stageId);

    const goNext = () => {
      if (!ctx) { Router.navigate("fogStageSelect"); return; }
      if (level === "lv3") {
        const quests = ctx.questionSet.quests || [];
        const idx = quests.findIndex((s) => s.id === stageId);
        const nextStage = idx !== -1 ? quests[idx + 1] : null;
        Router.navigate("areaMap", {
          genreId: ctx.genre.id, questionSetId: ctx.questionSet.id,
          openStageId: nextStage ? nextStage.id : null,
        });
      } else {
        Router.navigate("areaMap", { genreId: ctx.genre.id, questionSetId: ctx.questionSet.id, openStageId: stageId });
      }
    };
    const goQuestionSetSelect = () => {
      if (ctx) Router.navigate("questionSetSelect", { genreId: ctx.genre.id });
      else Router.navigate("fogStageSelect");
    };
    const goStageSelect = () => {
      if (ctx) Router.navigate("areaMap", { genreId: ctx.genre.id, questionSetId: ctx.questionSet.id });
      else Router.navigate("fogStageSelect");
    };

    wrap.appendChild(Utils.el("button", { class: "btn btn-moss btn-block", onclick: goNext }, "次へ進む"));
    wrap.appendChild(Utils.el("div", { class: "quiz-choice-row" }, [
      Utils.el("button", { class: "btn btn-secondary", onclick: goQuestionSetSelect }, "道の選択"),
      Utils.el("button", { class: "btn btn-secondary", onclick: goStageSelect }, "ステージ選択"),
    ]));

    root.appendChild(wrap);
  }

  function levelLabelJa(level) {
    return { lv1: "Lv1（正誤問題）", lv2: "Lv2（四択問題）", lv3: "Lv3（並び替え問題）" }[level] || level;
  }

  return { evaluateLevelResult };
})();
