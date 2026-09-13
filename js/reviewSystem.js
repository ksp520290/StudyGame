/**
 * reviewSystem.js
 * -----------------------------------------
 * 仕様書16〜17章・50〜51章に基づく復習（知の探究）システム。
 */

const ReviewSystem = (() => {
  const REVIEW_STAGE_ORDER = ["1day", "3day", "1week", "2week", "1month"];
  const REVIEW_STAGE_DAYS = { "1day": 1, "3day": 3, "1week": 7, "2week": 14, "1month": 30 };
  const REVIEW_STAGE_LABEL = {
    "1day": "前日の復習", "3day": "3日前の復習", "1week": "1週間前の復習",
    "2week": "2週間前の復習", "1month": "1か月前の復習",
  };
  const REVIEW_COMPLETION_COMPASS = 2;
  // 【追加要望対応】☆フォルダ（3回以上間違えた問題の翌日再出題）の報酬は、
  // 通常の復習クエスト報酬の半分とする（仕様に明記が無いため、コンパスは
  // REVIEW_COMPLETION_COMPASSの半分、設計図確率は「1日後」基本確率の半分を採用）。
  const STAR_REVIEW_COMPASS = Math.max(1, Math.round(REVIEW_COMPLETION_COMPASS / 2));

  function scheduleInitialReviews(genreId, stageId, stageWasPerfect) {
    const today = Utils.todayStr();
    GameState.update((state) => {
      const entries = REVIEW_STAGE_ORDER.map((reviewStage) => ({
        id: Utils.generateId("review"),
        genreId, stageId, reviewStage,
        scheduledDate: Utils.addDays(today, REVIEW_STAGE_DAYS[reviewStage]),
        status: "pending",
        skippedProbabilityCarry: 0,
        perfectBonusNext: 0,
        correctionQuestion: null,
      }));

      if (stageWasPerfect) {
        const oneDay = entries.find((e) => e.reviewStage === "1day");
        const threeDay = entries.find((e) => e.reviewStage === "3day");
        oneDay.status = "skipped";
        threeDay.skippedProbabilityCarry += RewardSystem.BASE_FRAGMENT_PROB["1day"];
      }

      state.reviewSchedules.push(...entries);
    });
  }

  function getCategorizedReviews() {
    const state = GameState.getState();
    const today = Utils.todayStr();
    const categories = {
      "前日の復習": [], "3日前の復習": [], "1週間前の復習": [], "2週間前の復習": [], "1か月前の復習": [], "未復習": [],
    };

    state.reviewSchedules
      .filter((e) => e.status === "pending")
      .forEach((entry) => {
        if (entry.scheduledDate > today) return;
        if (entry.scheduledDate < today) {
          categories["未復習"].push({ ...entry, overdueDays: Utils.diffDays(today, entry.scheduledDate) * -1 });
        } else {
          categories[REVIEW_STAGE_LABEL[entry.reviewStage]].push(entry);
        }
      });

    return categories;
  }

  /** 【追加要望対応】☆フォルダ：3回以上間違えた問題のうち、本日以降が出題予定日のもの */
  function getStarQuestionsDue() {
    const state = GameState.getState();
    const today = Utils.todayStr();
    return (state.starQuestions || []).filter((e) => e.status === "pending" && e.scheduledDate <= today);
  }

  function renderReviewListScreen(root) {
    const categories = getCategorizedReviews();
    const starEntries = getStarQuestionsDue();
    const wrap = Utils.el("div", { class: "screen-inner" });
    wrap.appendChild(Utils.el("h2", {}, "知の探究"));

    const totalPending = Object.values(categories).reduce((sum, arr) => sum + arr.length, 0);
    if (totalPending === 0 && starEntries.length === 0) {
      wrap.appendChild(Utils.el("p", { class: "empty-state" }, "今日の復習はすべて完了しています。お疲れさまでした。"));
      root.appendChild(wrap);
      return;
    }

    // 【追加要望対応】☆フォルダ（3回以上間違えた問題）を最上部に表示する。
    if (starEntries.length > 0) {
      const details = Utils.el("details", { class: "review-accordion", open: "true" });
      details.appendChild(Utils.el("summary", {}, `☆ 3回以上間違えた問題（残り${starEntries.length}問）`));
      starEntries.forEach((entry) => {
        const ctx = GameState.findStageContext(entry.stageId);
        const question = GameState.findQuestionById(entry.questionId);
        const label = (ctx ? `${ctx.genre.name} - ${ctx.questionSet.name} - ${ctx.stage.name}` : entry.stageId)
          + (question ? `「${question.question}」` : "");
        details.appendChild(Utils.el("div", { class: "review-row review-row-available" }, [
          Utils.el("span", {}, label),
          Utils.el("button", { class: "btn btn-primary", onclick: () => Router.navigate("starReviewPlay", { entryId: entry.id }) }, "挑戦する"),
        ]));
      });
      wrap.appendChild(details);
    }

    Object.entries(categories).forEach(([label, entries]) => {
      if (entries.length === 0) return;
      const details = Utils.el("details", { class: "review-accordion", open: "true" });
      details.appendChild(Utils.el("summary", {}, `${label}（残り${entries.length}クエスト）`));
      entries.forEach((entry) => {
        details.appendChild(renderReviewRow(entry, label === "未復習"));
      });
      wrap.appendChild(details);
    });

    root.appendChild(wrap);
  }

  function renderReviewRow(entry, isOverdue) {
    const ctx = GameState.findStageContext(entry.stageId);
    const stageName = ctx ? `${ctx.genre.name} - ${ctx.questionSet.name} - ${ctx.stage.name}` : entry.stageId;
    return Utils.el("div", { class: "review-row " + (isOverdue ? "review-row-overdue" : "review-row-available") }, [
      Utils.el("span", {}, stageName + (isOverdue ? `（${entry.overdueDays}日超過）` : "")),
      Utils.el("button", { class: "btn btn-primary", onclick: () => startReview(entry.id) }, "復習する"),
    ]);
  }

  function findEntry(entryId) {
    return GameState.getState().reviewSchedules.find((e) => e.id === entryId);
  }

  function startReview(entryId) {
    const entry = findEntry(entryId);
    if (!entry) { Utils.showToast("復習データが見つかりません", "error"); return; }
    Router.navigate("reviewPlay", { entryId });
  }

  function renderReviewPlayScreen(root, params) {
    const entry = findEntry(params.entryId);
    if (!entry) { root.appendChild(Utils.el("p", { class: "empty-state" }, "データがありません")); return; }
    const ctx = GameState.findStageContext(entry.stageId);
    if (!ctx) { root.appendChild(Utils.el("p", { class: "empty-state" }, "ステージが見つかりません")); return; }

    const wrap = Utils.el("div", { class: "screen-inner" });
    wrap.appendChild(Utils.el("h2", {}, REVIEW_STAGE_LABEL[entry.reviewStage]));

    if (entry.reviewStage === "1day" || entry.reviewStage === "3day") {
      wrap.appendChild(renderTypingReview(entry, ctx));
    } else if (entry.reviewStage === "1week") {
      wrap.appendChild(renderCorrectionCreateReview(entry, ctx));
    } else if (entry.reviewStage === "2week") {
      wrap.appendChild(renderCorrectionSolveReview(entry, ctx));
    } else if (entry.reviewStage === "1month") {
      wrap.appendChild(renderWorksheetReview(entry, ctx));
    }

    root.appendChild(wrap);
  }

  function renderTypingReview(entry, ctx) {
    const items = buildTypingItems(ctx.stage.questions);
    const box = Utils.el("div", { class: "panel" });
    const inputs = [];

    items.forEach((item) => {
      const input = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "答えを入力" });
      inputs.push({ item, input });
      box.appendChild(Utils.el("div", { class: "review-typing-row" }, [
        Utils.el("div", {}, item.prompt),
        input,
      ]));
    });

    box.appendChild(Utils.el("button", {
      class: "btn btn-primary btn-block",
      onclick: () => {
        const results = inputs.map(({ item, input }) => input.value.trim() === item.correctAnswer);
        const allCorrect = results.every(Boolean);
        // 【追加要望対応】☆フォルダ：復習タイピングでの誤答も問題単位で記録する。
        let anyAddedToStar = false;
        inputs.forEach(({ item }, i) => {
          if (!results[i]) {
            const added = GameState.recordQuestionMistake(item.questionId, entry.genreId, entry.stageId, "typing");
            if (added) anyAddedToStar = true;
          }
        });
        if (anyAddedToStar) Utils.showToast("誤答した問題が☆フォルダに入りました（明日また出題されます）", "info");
        showReviewFeedbackThenComplete(entry, allCorrect, inputs.map(({ item, input }, i) => ({
          prompt: item.prompt, correctAnswer: item.correctAnswer, isCorrect: results[i],
          userAnswer: input.value.trim(), note: item.note,
        })));
      },
    }, "採点する"));

    return box;
  }

  function buildTypingItems(questions) {
    return questions.map((q) => ({ questionId: q.id, prompt: q.question, correctAnswer: q.answer, note: q.note || "" }));
  }

  function renderCorrectionCreateReview(entry, ctx) {
    const q = ctx.stage.questions[0];
    const wrongChoices = [q.antonym, ...(q.unrelated || [])].filter(Boolean);
    const box = Utils.el("div", { class: "panel" }, [
      Utils.el("p", {}, `お題: 「${q.question}」`),
      Utils.el("p", {}, "以下から誤答例を1つ選んでください。"),
    ]);
    let selectedWrong = null;
    const choiceRow = Utils.el("div", { class: "quiz-choice-row" });
    wrongChoices.forEach((choice) => {
      choiceRow.appendChild(Utils.el("button", {
        class: "btn btn-secondary",
        onclick: (e) => {
          selectedWrong = choice;
          choiceRow.querySelectorAll("button").forEach((b) => b.classList.remove("btn-moss"));
          e.target.classList.add("btn-moss");
        },
      }, choice));
    });
    box.appendChild(choiceRow);

    const correctionInput = Utils.el("textarea", { class: "review-textarea", placeholder: "訂正内容を書いてください（正しくはこうです、等）" });
    const explanationInput = Utils.el("textarea", { class: "review-textarea", placeholder: "なぜ誤りなのか、解説を書いてください" });
    box.appendChild(correctionInput);
    box.appendChild(explanationInput);

    box.appendChild(Utils.el("button", {
      class: "btn btn-primary btn-block",
      onclick: () => {
        const correction = correctionInput.value.trim();
        const explanation = explanationInput.value.trim();
        if (!selectedWrong || !correction || !explanation) {
          Utils.showToast("すべての項目を入力してください", "error");
          return;
        }
        GameState.update((state) => {
          const e = state.reviewSchedules.find((x) => x.id === entry.id);
          e.correctionQuestion = { question: q.question, wrongChoice: selectedWrong, correction, explanation };
        });
        completeReview(entry.id, true);
      },
    }, "作成して完了"));

    return box;
  }

  function renderCorrectionSolveReview(entry, ctx) {
    const state = GameState.getState();
    const oneWeekEntry = state.reviewSchedules.find(
      (e) => e.stageId === entry.stageId && e.reviewStage === "1week" && e.correctionQuestion
    );
    const box = Utils.el("div", { class: "panel" });

    if (!oneWeekEntry) {
      box.appendChild(Utils.el("p", { class: "empty-state" }, "1週間後に作成した訂正問題が見つかりませんでした。"));
      box.appendChild(Utils.el("button", { class: "btn btn-primary btn-block", onclick: () => completeReview(entry.id, false) }, "完了"));
      return box;
    }

    const cq = oneWeekEntry.correctionQuestion;
    box.appendChild(Utils.el("p", {}, `お題: 「${cq.question}」`));
    box.appendChild(Utils.el("p", {}, `誤答例: ${cq.wrongChoice}`));
    box.appendChild(Utils.el("p", {}, "あなたが1週間前に書いた「訂正内容」をもう一度入力してください。"));
    const input = Utils.el("input", { type: "text", class: "review-typing-input" });
    box.appendChild(input);

    box.appendChild(Utils.el("button", {
      class: "btn btn-primary btn-block",
      onclick: () => {
        const correct = input.value.trim() === cq.correction;
        showReviewFeedbackThenComplete(entry, correct, [
          { prompt: "訂正内容", correctAnswer: cq.correction, isCorrect: correct, userAnswer: input.value.trim() },
        ]);
      },
    }, "採点する"));

    return box;
  }

  function renderWorksheetReview(entry, ctx) {
    const MIN_LENGTH = 20;
    const box = Utils.el("div", { class: "panel" }, [
      Utils.el("p", {}, `このステージ（${ctx.stage.name}）で学んだことを、自分の言葉で${MIN_LENGTH}文字以上でまとめてください。`),
    ]);
    const textarea = Utils.el("textarea", { class: "review-textarea", rows: "6" });
    const counter = Utils.el("div", { class: "char-counter" }, `0 / ${MIN_LENGTH}`);
    textarea.addEventListener("input", () => {
      counter.textContent = `${textarea.value.length} / ${MIN_LENGTH}`;
    });
    box.appendChild(textarea);
    box.appendChild(counter);

    const submitBtn = Utils.el("button", {
      class: "btn btn-primary btn-block",
      onclick: () => {
        if (textarea.value.trim().length < MIN_LENGTH) {
          Utils.showToast(`あと${MIN_LENGTH - textarea.value.trim().length}文字必要です`, "error");
          return;
        }
        renderSelfGrade();
      },
    }, "書き終えた（自己採点へ）");
    box.appendChild(submitBtn);

    function renderSelfGrade() {
      box.innerHTML = "";
      box.appendChild(Utils.el("p", {}, "自己採点してください（後から変更できます）"));
      const gradeRow = Utils.el("div", { class: "quiz-choice-row" }, [
        Utils.el("button", { class: "btn btn-moss", onclick: () => completeReview(entry.id, true) }, "正答"),
        Utils.el("button", { class: "btn btn-secondary", onclick: () => completeReview(entry.id, false) }, "誤答"),
      ]);
      box.appendChild(gradeRow);
    }

    return box;
  }

  function showReviewFeedbackThenComplete(entry, wasSuccessful, resultRows) {
    const root = document.getElementById("screen-container");
    root.innerHTML = "";
    const wrap = Utils.el("div", { class: "screen screen-inner" });
    wrap.appendChild(Utils.el("h2", {}, wasSuccessful ? "正解！" : "答え合わせ"));
    resultRows.forEach((r) => {
      const row = Utils.el("div", { class: "answer-review-row " + (r.isCorrect ? "is-correct" : "is-wrong") }, [
        Utils.el("span", {}, r.prompt),
        Utils.el("span", { class: "answer-correct-value" }, `正解: ${Utils.formatAnswerValue(r.correctAnswer)}`),
      ]);
      row.addEventListener("click", () => Utils.showAnswerDetailPopup({
        questionId: r.questionId,
        prompt: r.prompt,
        isCorrect: r.isCorrect,
        userAnswer: r.userAnswer,
        correctAnswer: r.correctAnswer,
        note: r.note,
      }));
      wrap.appendChild(row);
    });
    wrap.appendChild(Utils.el("button", {
      class: "btn btn-primary btn-block",
      onclick: () => completeReview(entry.id, wasSuccessful),
    }, "次へ"));
    root.appendChild(wrap);
  }

  function completeReview(entryId, wasSuccessful) {
    const entry = findEntry(entryId);
    if (!entry) return;

    const finalProb = RewardSystem.calcFragmentProbability(entry.genreId, entry.reviewStage, {
      skippedCarry: entry.skippedProbabilityCarry,
      perfectBonus: entry.perfectBonusNext,
    });
    const wonFragment = RewardSystem.rollFragment(entry.genreId, finalProb);
    RewardSystem.grantCompass(REVIEW_COMPLETION_COMPASS);

    GameState.update((state) => {
      const e = state.reviewSchedules.find((x) => x.id === entryId);
      e.status = "done";
      state.reviewHistory.push({
        id: Utils.generateId("hist"), stageId: entry.stageId, genreId: entry.genreId,
        reviewStage: entry.reviewStage, wasSuccessful, wonFragment, date: Utils.todayStr(),
      });

      propagateSkipOrBonus(state, entry, wasSuccessful);
    });

    // 【Phase9】復習カテゴリの称号判定（仕様63章）。
    if (typeof TitleSystem !== "undefined") TitleSystem.checkAndAward({ trigger: "reviewComplete" });

    renderReviewResultScreen(wonFragment, finalProb);
  }

  function propagateSkipOrBonus(state, entry, wasSuccessful) {
    if (!wasSuccessful) return;
    const idx = REVIEW_STAGE_ORDER.indexOf(entry.reviewStage);
    const nextStage = REVIEW_STAGE_ORDER[idx + 1];
    if (!nextStage) return;

    const nextEntry = state.reviewSchedules.find((e) => e.stageId === entry.stageId && e.reviewStage === nextStage);
    if (!nextEntry || nextEntry.status !== "pending") return;

    if (entry.reviewStage === "1day" || entry.reviewStage === "3day") {
      const afterNextStage = REVIEW_STAGE_ORDER[idx + 2];
      const afterNextEntry = afterNextStage
        ? state.reviewSchedules.find((e) => e.stageId === entry.stageId && e.reviewStage === afterNextStage)
        : null;
      if (afterNextEntry) {
        nextEntry.status = "skipped";
        afterNextEntry.skippedProbabilityCarry += RewardSystem.BASE_FRAGMENT_PROB[nextStage];
      }
    } else {
      nextEntry.perfectBonusNext = 10;
    }
  }

  function renderReviewResultScreen(wonFragment, finalProb) {
    const root = document.getElementById("screen-container");
    root.innerHTML = "";
    const wrap = Utils.el("div", { class: "screen screen-inner result-screen" });
    wrap.appendChild(Utils.el("h2", {}, "復習完了"));
    wrap.appendChild(Utils.el("div", { class: "panel reward-panel" + (wonFragment ? " fragment-pop" : "") }, [
      Utils.el("div", { class: "reward-line" }, `🧭 コンパス +${REVIEW_COMPLETION_COMPASS}`),
      Utils.el("div", { class: "reward-line" }, wonFragment
        ? "🧩 設計図の欠片を手に入れた！"
        : `探索したが、今回は欠片は見つからなかった（確率${finalProb.toFixed(1)}%）`),
    ]));
    wrap.appendChild(Utils.el("button", {
      class: "btn btn-moss btn-block",
      onclick: () => Router.navigate("review"),
    }, "知の探究へ戻る"));
    root.appendChild(wrap);
  }

  /* ============================================================
     【追加要望対応】☆フォルダ：3回以上間違えた問題の翌日単問再出題
     ============================================================ */

  function findStarEntry(entryId) {
    return (GameState.getState().starQuestions || []).find((e) => e.id === entryId);
  }

  function renderStarReviewPlayScreen(root, params) {
    const entry = findStarEntry(params.entryId);
    if (!entry) { root.appendChild(Utils.el("p", { class: "empty-state" }, "データが見つかりません")); return; }
    const question = GameState.findQuestionById(entry.questionId);
    if (!question) { root.appendChild(Utils.el("p", { class: "empty-state" }, "問題データが見つかりません")); return; }

    const wrap = Utils.el("div", { class: "screen-inner" });
    wrap.appendChild(Utils.el("h2", {}, "☆ 3回以上間違えた問題"));
    wrap.appendChild(Utils.el("p", { class: "explore-desc" }, "前回までと同じ形式で出題します。正答すると通常の復習の半分の報酬がもらえます。"));

    if (entry.format === "lv1" || entry.format === "lv2" || entry.format === "lv3") {
      const item = QuestionSystem.buildQuestionsForLevel(entry.format, [question])[0];
      wrap.appendChild(QuizSystem.renderQuestionItem(item, (rawAnswer) => {
        const isCorrect = QuizSystem.checkAnswer(item, rawAnswer);
        completeStarReview(entry, isCorrect, item.prompt, item.correctAnswer, rawAnswer, question.note);
      }));
    } else {
      // "typing"：復習のタイピング形式と同じ、完全一致判定
      const box = Utils.el("div", { class: "panel" }, [
        Utils.el("p", { class: "quiz-prompt" }, question.question),
      ]);
      const input = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "答えを入力" });
      box.appendChild(input);
      box.appendChild(Utils.el("button", {
        class: "btn btn-primary btn-block",
        onclick: () => {
          const isCorrect = input.value.trim() === question.answer;
          completeStarReview(entry, isCorrect, question.question, question.answer, input.value.trim(), question.note);
        },
      }, "採点する"));
      wrap.appendChild(box);
    }

    root.appendChild(wrap);
  }

  function completeStarReview(entry, wasCorrect, prompt, correctAnswer, userAnswer, note) {
    const root = document.getElementById("screen-container");
    root.innerHTML = "";
    const wrap = Utils.el("div", { class: "screen screen-inner result-screen" });
    wrap.appendChild(Utils.el("h2", {}, wasCorrect ? "正解！" : "不正解…"));

    const row = Utils.el("div", { class: "answer-review-row " + (wasCorrect ? "is-correct" : "is-wrong") }, [
      Utils.el("span", {}, prompt),
      Utils.el("span", { class: "answer-correct-value" }, `正解: ${Utils.formatAnswerValue(correctAnswer)}`),
    ]);
    row.addEventListener("click", () => Utils.showAnswerDetailPopup({
      questionId: entry.questionId, prompt, isCorrect: wasCorrect, userAnswer, correctAnswer, note,
    }));
    wrap.appendChild(row);

    if (wasCorrect) {
      // 【追加要望対応】正答時のみ☆フォルダから外し、誤答回数をリセット。報酬は半分。
      RewardSystem.grantCompass(STAR_REVIEW_COMPASS);
      const halfProb = RewardSystem.BASE_FRAGMENT_PROB["1day"] / 2;
      const wonFragment = RewardSystem.rollFragment(entry.genreId, halfProb);

      GameState.update((state) => {
        const e = state.starQuestions.find((x) => x.id === entry.id);
        if (e) e.status = "done";
        state.questionMistakes[entry.questionId] = 0;
      });

      wrap.appendChild(Utils.el("div", { class: "panel reward-panel" + (wonFragment ? " fragment-pop" : "") }, [
        Utils.el("div", { class: "reward-line" }, `🧭 コンパス +${STAR_REVIEW_COMPASS}（通常の復習の半分）`),
        Utils.el("div", { class: "reward-line" }, wonFragment
          ? "🧩 設計図の欠片を手に入れた！"
          : `探索したが、今回は欠片は見つからなかった（確率${halfProb.toFixed(1)}%）`),
      ]));
    } else {
      // 誤答時：☆フォルダには残したまま、翌日また出題する。
      GameState.update((state) => {
        const e = state.starQuestions.find((x) => x.id === entry.id);
        if (e) e.scheduledDate = Utils.addDays(Utils.todayStr(), 1);
      });
      wrap.appendChild(Utils.el("p", {}, "この問題は☆フォルダに残り、明日また出題されます。"));
    }

    wrap.appendChild(Utils.el("button", {
      class: "btn btn-moss btn-block",
      onclick: () => Router.navigate("review"),
    }, "知の探究へ戻る"));
    root.appendChild(wrap);
  }

  Router.registerScreen("review", renderReviewListScreen);
  Router.registerScreen("reviewPlay", renderReviewPlayScreen);
  Router.registerScreen("starReviewPlay", renderStarReviewPlayScreen);

  return { scheduleInitialReviews, getCategorizedReviews, getStarQuestionsDue };
})();
