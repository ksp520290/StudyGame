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
  // 【追加要望対応】前日より前の日記を書くためのコスト（コンパスまたはチケット1枚）。
  const PAST_DIARY_COMPASS_COST = 5;
  const PAST_DIARY_MIN_DATE = "2000-01-01";

  function getTickets() {
    return GameState.getState().diaryTickets || 0;
  }

  function addTickets(n) {
    GameState.update((state) => {
      state.diaryTickets = Math.max(0, (state.diaryTickets || 0) + n);
    });
  }

  /** 前日「より前」（2日前以前）の日付か。前日分は従来どおり無料で書ける */
  function isPastBeyondYesterday(dateStr) {
    return !!dateStr && dateStr < getYesterday() && dateStr >= PAST_DIARY_MIN_DATE;
  }

  /**
   * 過去日記の支払い。method: "compass" | "ticket"。
   * 残高不足の場合は何も消費せず false を返す。
   */
  function payForPastEntry(method) {
    if (method === "ticket") {
      if (getTickets() < 1) return false;
      addTickets(-1);
      return true;
    }
    if (method === "compass") {
      if (GameState.getState().user.compass < PAST_DIARY_COMPASS_COST) return false;
      RewardSystem.grantCompass(-PAST_DIARY_COMPASS_COST);
      return true;
    }
    return false;
  }

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
        Utils.el("span", { class: "explore-desc" }, `前日（${yesterday}）の変化・一日の流れ・感じたことのいずれかを記録（🎫チケット ${getTickets()} 枚）`),
      ]),
      Utils.el("button", { class: "explore-btn", onclick: () => Router.navigate("diaryHistory") }, [
        "これまでの日記を見る",
        Utils.el("span", { class: "explore-desc" }, `記録日数：${countRecorded()}日`),
      ]),
      Utils.el("button", { class: "explore-btn", onclick: () => Router.navigate("books") }, [
        "読書記録をつける",
        Utils.el("span", { class: "explore-desc" }, "読んだ本の要約・引用・批判的読書メモ（任意）"),
      ]),
      Utils.el("button", { class: "explore-btn", onclick: () => Router.navigate("dictationList") }, [
        "音読ディクテーション",
        Utils.el("span", { class: "explore-desc" }, "外国語の音読テキストと音源で聞き取り練習（任意）"),
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
    // 前日より前の「未記録の日」に書く場合のみ、保存時に支払いが発生する（記録済みの日の編集は無料）
    const payment = (isPastBeyondYesterday(targetDate) && !isDateRecorded(targetDate)) ? (params.payment || null) : null;

    const wrap = Utils.el("div", { class: "screen-inner" });
    wrap.appendChild(Utils.el("h2", {}, `日記（${targetDate}）`));
    wrap.appendChild(Utils.el("p", {}, "3つのうち、書けるものだけで大丈夫です。1つでも記入すればこの日の記録は達成です。"));
    if (isPastBeyondYesterday(targetDate) && !isDateRecorded(targetDate) && !payment) {
      // 支払い方法を選ばずに過去日付の画面へ来た場合は、選択画面（前日の画面）へ戻す
      wrap.appendChild(Utils.el("p", { class: "empty-state" }, "前日より前の日記は、コンパスまたはチケットを使って書けます。"));
      wrap.appendChild(Utils.el("button", { class: "btn btn-moss btn-block", onclick: () => Router.navigate("diaryEntry", { targetDate: getYesterday() }) }, "日記を書く画面へ戻る"));
      root.appendChild(wrap);
      return;
    }
    if (payment) {
      wrap.appendChild(Utils.el("p", { class: "explore-desc" },
        payment === "ticket" ? "🎫 保存するとチケットを1枚使います。" : `🧭 保存するとコンパスを${PAST_DIARY_COMPASS_COST}個使います。`));
    }

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
        if (payment && !payForPastEntry(payment)) {
          Utils.showToast(payment === "ticket" ? "チケットが足りません" : "コンパスが足りません", "error");
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
    if (targetDate === getYesterday()) wrap.appendChild(renderPastDiaryPanel());
    root.appendChild(wrap);
  }

  /**
   * 【追加要望対応】前日より前の日記を書くためのパネル。
   * 🧭5個、または読書記録で獲得したチケット1枚を、保存時に消費する。
   */
  function renderPastDiaryPanel() {
    const panel = Utils.el("div", { class: "panel diary-past-panel" }, [
      Utils.el("h3", {}, "もっと前の日の日記を書く"),
      Utils.el("p", { class: "explore-desc" },
        `前日より前の日は、🧭${PAST_DIARY_COMPASS_COST}個、または🎫チケット1枚を使って書けます（消費は保存したときです）。` +
        "すでに記録済みの日は、無料で編集できます。"),
    ]);
    const dateInput = Utils.el("input", { type: "date", class: "review-typing-input", min: PAST_DIARY_MIN_DATE, max: Utils.addDays(getYesterday(), -1) });
    panel.appendChild(Utils.el("label", { class: "diary-field-label" }, "書きたい日"));
    panel.appendChild(dateInput);

    function go(method) {
      const date = dateInput.value;
      if (!date) { Utils.showToast("日付を選んでください", "error"); return; }
      if (!isPastBeyondYesterday(date)) { Utils.showToast("前日より前の日付を選んでください", "error"); return; }
      if (isDateRecorded(date)) {
        Utils.showToast("この日はすでに記録済みです。無料で編集できます", "info");
        Router.navigate("diaryEntry", { targetDate: date });
        return;
      }
      if (method === "ticket" && getTickets() < 1) { Utils.showToast("チケットがありません", "error"); return; }
      if (method === "compass" && GameState.getState().user.compass < PAST_DIARY_COMPASS_COST) {
        Utils.showToast(`コンパスが足りません（${PAST_DIARY_COMPASS_COST}個必要）`, "error");
        return;
      }
      Router.navigate("diaryEntry", { targetDate: date, payment: method });
    }

    panel.appendChild(Utils.el("button", { class: "btn btn-secondary btn-block", style: "margin-top:10px;", onclick: () => go("compass") },
      `🧭${PAST_DIARY_COMPASS_COST}個を使って書く`));
    panel.appendChild(Utils.el("button", { class: "btn btn-secondary btn-block", style: "margin-top:10px;", onclick: () => go("ticket") },
      `🎫チケットを使って書く（所持 ${getTickets()} 枚）`));
    return panel;
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
    getTickets, addTickets, payForPastEntry, PAST_DIARY_COMPASS_COST,
  };
})();
