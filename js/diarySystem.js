/**
 * diarySystem.js
 * -----------------------------------------
 * Phase8：日記システム（仕様60〜61章）。
 *
 * 「霧晴れの開拓日誌」の中核。前日分の
 *   - 前日の変化記録 (changeRecord)
 *   - 一日の流れ     (dayFlow)
 *   - 感じたこと     (feelings)
 * のうち、いずれか1つでも記入して保存すればその日のタスクは達成。
 * 読書していない日でも日記だけで達成でき、読書を強制しない（仕様60章）。
 *
 * 1つの対象日（targetDate）につき記録は1件（upsert）。
 * 対象日は基本的に「前日」＝ today - 1日。過去の未記入分をさかのぼって
 * 埋めることも許可する（仕様に明記が無いが、損失回避の原則＝「休んでも失わない」
 * に沿って、過去分の記録も歓迎する設計とした。判断根拠：仕様68章の復帰設計）。
 *
 * 【仕様に明記が無く判断した点】
 *   仕様61章「前日分の日記のいずれかの記録を保存するとガチャ画面が解放される」を
 *   実現するため isGachaUnlockedToday() を用意した。これは「前日日付のエントリが
 *   存在し、3項目のいずれかが空でない」ことをもって判定する。
 *   日記保存時の🧭+1報酬は仕様に明記が無い独自追加（学習報酬を上回らない極小量。
 *   HANDOFF後継者はrewardの是非を見直して良い）。
 */

const DiarySystem = (() => {
  const DIARY_SAVE_COMPASS = 1; // 新規記録時のみの小報酬（学習報酬より必ず小さく保つ）

  function getAll() {
    return GameState.getState().diary || [];
  }

  function getEntryForDate(dateStr) {
    return getAll().find((d) => d.targetDate === dateStr) || null;
  }

  function isDateRecorded(dateStr) {
    const e = getEntryForDate(dateStr);
    if (!e) return false;
    return !!(e.changeRecord?.trim() || e.dayFlow?.trim() || e.feelings?.trim());
  }

  function getYesterday() {
    return Utils.addDays(Utils.todayStr(), -1);
  }

  /** 仕様61章のゲート判定：前日分が記録済みか */
  function isGachaUnlockedToday() {
    return isDateRecorded(getYesterday());
  }

  /**
   * 記録を保存（upsert）。新規作成時のみ小報酬とタイトル判定を行う。
   * @returns {{ entry:object, isNew:boolean, unlockedGacha:boolean }}
   */
  function saveEntry(targetDate, { changeRecord = "", dayFlow = "", feelings = "" }) {
    let isNew = false;
    GameState.update((state) => {
      let entry = state.diary.find((d) => d.targetDate === targetDate);
      if (!entry) {
        isNew = true;
        entry = { id: Utils.generateId("diary"), targetDate, changeRecord: "", dayFlow: "", feelings: "", recordedAt: null };
        state.diary.push(entry);
      }
      entry.changeRecord = changeRecord.trim().slice(0, 400);
      entry.dayFlow = dayFlow.trim().slice(0, 400);
      entry.feelings = feelings.trim().slice(0, 400);
      entry.recordedAt = Utils.todayStr();
    });

    const entry = getEntryForDate(targetDate);
    const hasContent = !!(entry.changeRecord || entry.dayFlow || entry.feelings);
    if (isNew && hasContent) {
      RewardSystem.grantCompass(DIARY_SAVE_COMPASS);
    }
    if (typeof TitleSystem !== "undefined" && hasContent) {
      TitleSystem.checkAndAward({ trigger: "diary" });
    }
    const unlockedGacha = targetDate === getYesterday() && hasContent;
    return { entry, isNew, unlockedGacha };
  }

  function getHistorySorted() {
    return [...getAll()].sort((a, b) => (a.targetDate < b.targetDate ? 1 : -1));
  }

  function countRecorded() {
    return getAll().filter((e) => e.changeRecord || e.dayFlow || e.feelings).length;
  }

  /* ============================================================
     画面："journal"（霧晴れの開拓日誌：ハブ画面）
     ============================================================ */

  function renderJournalScreen(root) {
    const wrap = Utils.el("div", { class: "screen-inner" });
    wrap.appendChild(Utils.el("h2", {}, "霧晴れの開拓日誌"));
    wrap.appendChild(Utils.el("p", {}, "前日の記録をつけると、探索の合間の楽しみ（ガチャ）が解放されます。読書は任意です。"));

    const yesterday = getYesterday();
    const unlocked = isGachaUnlockedToday();

    const gateCard = Utils.el("div", { class: "panel journal-gate-card " + (unlocked ? "is-unlocked" : "is-locked") }, [
      Utils.el("h3", {}, unlocked ? "🎰 ガチャが解放されています" : "🔒 ガチャは前日の記録でひらく"),
      Utils.el("p", {}, unlocked
        ? "前日分の日記を記録済みです。探索の合間に、ガチャを楽しめます。"
        : `前日（${yesterday}）の日記をまだ記録していません。下の「日記を書く」からどれか1つ記入してみましょう。`),
    ]);
    if (unlocked) {
      gateCard.appendChild(Utils.el("button", {
        class: "btn btn-moss btn-block",
        onclick: () => Router.navigate("gacha"),
      }, "🎰 ガチャへ進む"));
    }
    wrap.appendChild(gateCard);

    const list = Utils.el("div", { class: "explore-list" }, [
      Utils.el("button", { class: "explore-btn", onclick: () => Router.navigate("diaryEntry", { targetDate: yesterday }) }, [
        "日記を書く",
        Utils.el("span", { class: "explore-desc" }, `前日（${yesterday}）の変化・一日の流れ・感じたことのいずれかを記録`),
      ]),
      Utils.el("button", { class: "explore-btn", onclick: () => Router.navigate("diaryHistory") }, [
        "これまでの日記を見る",
        Utils.el("span", { class: "explore-desc" }, `記録日数：${countRecorded()}日`),
      ]),
      Utils.el("button", { class: "explore-btn", onclick: () => Router.navigate("books") }, [
        "読書記録をつける",
        Utils.el("span", { class: "explore-desc" }, "読んだ本の要約・引用・批判的読書メモ（任意）"),
      ]),
    ]);
    wrap.appendChild(list);

    root.appendChild(wrap);
  }

  /* ============================================================
     画面："diaryEntry"（1日分の記録入力）
     ============================================================ */

  function renderDiaryEntryScreen(root, params = {}) {
    const targetDate = params.targetDate || getYesterday();
    const existing = getEntryForDate(targetDate) || { changeRecord: "", dayFlow: "", feelings: "" };

    const wrap = Utils.el("div", { class: "screen-inner" });
    wrap.appendChild(Utils.el("h2", {}, `日記（${targetDate}）`));
    wrap.appendChild(Utils.el("p", {}, "3つのうち、書けるものだけで大丈夫です。1つでも記入すればこの日の記録は達成です。"));

    const panel = Utils.el("div", { class: "panel diary-form" });

    const changeInput = Utils.el("textarea", { class: "review-textarea", placeholder: "前日の変化記録（何ができるようになった？何が変わった？）" });
    changeInput.value = existing.changeRecord || "";
    const flowInput = Utils.el("textarea", { class: "review-textarea", placeholder: "一日の流れ（どんな一日だった？）" });
    flowInput.value = existing.dayFlow || "";
    const feelingsInput = Utils.el("textarea", { class: "review-textarea", placeholder: "感じたこと" });
    feelingsInput.value = existing.feelings || "";

    panel.appendChild(Utils.el("label", { class: "diary-field-label" }, "前日の変化記録"));
    panel.appendChild(changeInput);
    panel.appendChild(Utils.el("label", { class: "diary-field-label" }, "一日の流れ"));
    panel.appendChild(flowInput);
    panel.appendChild(Utils.el("label", { class: "diary-field-label" }, "感じたこと"));
    panel.appendChild(feelingsInput);

    panel.appendChild(Utils.el("button", {
      class: "btn btn-primary btn-block",
      onclick: () => {
        const values = { changeRecord: changeInput.value, dayFlow: flowInput.value, feelings: feelingsInput.value };
        if (!values.changeRecord.trim() && !values.dayFlow.trim() && !values.feelings.trim()) {
          Utils.showToast("いずれか1つは記入してください", "error");
          return;
        }
        const result = saveEntry(targetDate, values);
        Utils.showToast("日記を保存しました", "success");
        if (result.unlockedGacha) {
          Utils.showToast("🎰 ガチャが解放されました！", "success");
        }
        Router.navigate("journal");
      },
    }, "保存する"));

    wrap.appendChild(panel);
    root.appendChild(wrap);
  }

  /* ============================================================
     画面："diaryHistory"（過去の日記一覧）
     ============================================================ */

  function renderDiaryHistoryScreen(root) {
    const wrap = Utils.el("div", { class: "screen-inner" });
    wrap.appendChild(Utils.el("h2", {}, "これまでの日記"));

    const entries = getHistorySorted().filter((e) => e.changeRecord || e.dayFlow || e.feelings);
    if (entries.length === 0) {
      wrap.appendChild(Utils.el("p", { class: "empty-state" }, "まだ記録がありません。"));
    }
    entries.forEach((e) => {
      const card = Utils.el("div", { class: "panel diary-history-card" }, [
        Utils.el("h3", {}, e.targetDate),
      ]);
      if (e.changeRecord) card.appendChild(Utils.el("p", {}, `【変化】${e.changeRecord}`));
      if (e.dayFlow) card.appendChild(Utils.el("p", {}, `【一日の流れ】${e.dayFlow}`));
      if (e.feelings) card.appendChild(Utils.el("p", {}, `【感じたこと】${e.feelings}`));
      card.appendChild(Utils.el("button", {
        class: "btn btn-secondary",
        onclick: () => Router.navigate("diaryEntry", { targetDate: e.targetDate }),
      }, "編集する"));
      wrap.appendChild(card);
    });

    root.appendChild(wrap);
  }

  Router.registerScreen("journal", renderJournalScreen);
  Router.registerScreen("diaryEntry", renderDiaryEntryScreen);
  Router.registerScreen("diaryHistory", renderDiaryHistoryScreen);

  return {
    getEntryForDate, isDateRecorded, getYesterday, isGachaUnlockedToday,
    saveEntry, getHistorySorted, countRecorded,
  };
})();
