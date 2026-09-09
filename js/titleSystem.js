/**
 * titleSystem.js
 * -----------------------------------------
 * Phase9：称号システム（仕様63章・64章「称号追加・称号条件設定」）。
 *
 * 称号は「エリア名＋称号」形式（仕様63章例：「英語のはじめの一歩」）。
 * 新規学習・復習カテゴリはジャンル（エリア）ごとに判定し、日記カテゴリは
 * ジャンルに属さない全体条件として判定する。
 *
 * 判定は「イベント発生時にだけ全件チェックする」方式（ポーリングしない）。
 * checkAndAward(context) を、以下のタイミングで呼び出す：
 *   - resultSystem.js … ステージ完了時（新規学習カテゴリ）
 *   - reviewSystem.js … 復習完了時（復習カテゴリ）
 *   - diarySystem.js  … 日記保存時（日記カテゴリ）
 *   - gachaSystem.js  … キャラクター完成時（復習カテゴリの一部、および将来拡張用）
 *
 * 【仕様に明記が無く判断した点（要レビュー）】
 *   - 基本称号のしきい値（何ステージで「開拓者」になるか等）は仕様に具体的数値の
 *     定義が無いため、仕様53章（熱狂段階終了条件で使われている「10ステージ」等の
 *     既存の数値基準）と整合するように、はじめの一歩=1・開拓者=5・霧を裂く者=10・
 *     解放者=エリア完全制覇、という段階付けをこのPhaseの判断で採用した。
 *     将来仕様が明確になった場合は BUILTIN_DEFS の threshold のみ変更すればよい。
 *   - 復習カテゴリの「追憶の建築家」は、他の3称号（設計家見習い・知の守護者・
 *     英知の設計家）が設計図の初回欠片・初完成・複数完成を表すのに対応させ、
 *     「そのジャンルで設計図を5回完成させた」を条件とした（独自解釈）。
 *   - 称号獲得演出でのキャラクターのセリフは、そのジャンルで完成済みのキャラクターが
 *     いれば CharacterSystem.getDialogue(character, "onTitleEarned") を表示する
 *     （仕様32章）。完成済みキャラクターがいない場合はセリフを省略する。
 */

const TitleSystem = (() => {
  // --- 基本称号（仕様63章） ---
  const BUILTIN_DEFS = [
    // 新規学習カテゴリ：ジャンルごとに判定
    { id: "nl_1", category: "newLearning", perGenre: true, label: "はじめの一歩", check: (genre, state) => clearedStageCount(state, genre) >= 1 },
    { id: "nl_2", category: "newLearning", perGenre: true, label: "開拓者", check: (genre, state) => clearedStageCount(state, genre) >= 5 },
    { id: "nl_3", category: "newLearning", perGenre: true, label: "霧を裂く者", check: (genre, state) => clearedStageCount(state, genre) >= 10 },
    { id: "nl_4", category: "newLearning", perGenre: true, label: "解放者", check: (genre, state) => {
      const total = totalStageCount(genre);
      return total > 0 && clearedStageCount(state, genre) >= total;
    } },

    // 復習カテゴリ：ジャンルごとに判定（設計図の進み具合を基準とする）
    { id: "rv_1", category: "review", perGenre: true, label: "設計家見習い", check: (genre, state) => blueprintTotalFragments(state, genre.id) >= 1 },
    { id: "rv_2", category: "review", perGenre: true, label: "知の守護者", check: (genre, state) => blueprintCompletedCount(state, genre.id) >= 1 },
    { id: "rv_3", category: "review", perGenre: true, label: "英知の設計家", check: (genre, state) => blueprintCompletedCount(state, genre.id) >= 3 },
    { id: "rv_4", category: "review", perGenre: true, label: "追憶の建築家", check: (genre, state) => blueprintCompletedCount(state, genre.id) >= 5 },

    // 日記カテゴリ：ジャンルに属さない全体条件
    { id: "di_1", category: "diary", perGenre: false, label: "記録者", check: (_, state) => diaryCount(state) >= 1 },
    { id: "di_2", category: "diary", perGenre: false, label: "観察者", check: (_, state) => diaryCount(state) >= 7 },
    { id: "di_3", category: "diary", perGenre: false, label: "長期記録者", check: (_, state) => diaryCount(state) >= 30 },
    { id: "di_4", category: "diary", perGenre: false, label: "長期観察者", check: (_, state) => diaryCount(state) >= 90 },
  ];

  // --- 独自称号の条件タイプ（仕様64章「称号条件設定」で設定画面から選ぶ） ---
  const CUSTOM_CONDITION_TYPES = {
    stagesCleared: { label: "クリア済みステージ数（ジャンル指定）", perGenre: true, getValue: (genre, state) => clearedStageCount(state, genre) },
    blueprintsCompleted: { label: "設計図の完成数（ジャンル指定）", perGenre: true, getValue: (genre, state) => blueprintCompletedCount(state, genre.id) },
    diaryEntries: { label: "日記の記録日数（全体）", perGenre: false, getValue: (_, state) => diaryCount(state) },
    charactersCompleted: { label: "完成キャラクター数（全体）", perGenre: false, getValue: (_, state) => charactersCompletedCount(state) },
    booksRecorded: { label: "読書記録の冊数（全体）", perGenre: false, getValue: (_, state) => (state.books || []).length },
  };

  function clearedStageCount(state, genre) {
    let count = 0;
    (genre.questionSets || []).forEach((qs) => (qs.quests || []).forEach((stage) => {
      const p = state.stageProgress[stage.id];
      if (p && p.result !== "none") count += 1;
    }));
    return count;
  }

  function totalStageCount(genre) {
    let count = 0;
    (genre.questionSets || []).forEach((qs) => { count += (qs.quests || []).length; });
    return count;
  }

  function blueprintCompletedCount(state, genreId) {
    return (state.blueprints[genreId] || { completedCount: 0 }).completedCount;
  }

  function blueprintTotalFragments(state, genreId) {
    const bp = state.blueprints[genreId] || { fragmentsCollected: 0, completedCount: 0 };
    return bp.completedCount * 9 + bp.fragmentsCollected;
  }

  function diaryCount(state) {
    return (state.diary || []).filter((e) => e.changeRecord || e.dayFlow || e.feelings).length;
  }

  function charactersCompletedCount(state) {
    return (state.characters || []).filter((c) => c.obtainedDate).length;
  }

  function getEarned() {
    return GameState.getState().titles || [];
  }

  function isEarned(defId, genreId) {
    return getEarned().some((t) => t.defId === defId && (t.genreId || null) === (genreId || null));
  }

  function getCustomDefs() {
    return GameState.getState().titleDefs || [];
  }

  /** 設定画面から独自称号を追加する（仕様64章） */
  function addCustomDef({ name, conditionType, genreId, threshold }) {
    const id = Utils.generateId("titledef");
    GameState.update((state) => {
      state.titleDefs.push({
        id, name: name.trim().slice(0, 40) || "名もなき称号",
        conditionType, genreId: genreId || null, threshold: Math.max(1, Number(threshold) || 1),
      });
    });
    return id;
  }

  /** 【追加要望対応】既存の独自称号の条件定義を編集する（認識改変画面用） */
  function editCustomDef(id, { name, conditionType, genreId, threshold }) {
    GameState.update((state) => {
      const d = state.titleDefs.find((x) => x.id === id);
      if (!d) return;
      if (name != null && name.trim()) d.name = name.trim().slice(0, 40);
      if (conditionType != null && CUSTOM_CONDITION_TYPES[conditionType]) d.conditionType = conditionType;
      if (genreId !== undefined) d.genreId = genreId || null;
      if (threshold != null) d.threshold = Math.max(1, Number(threshold) || 1);
    });
  }

  function removeCustomDef(id) {
    GameState.update((state) => {
      state.titleDefs = state.titleDefs.filter((d) => d.id !== id);
    });
  }

  /**
   * 全称号（基本＋独自）を評価し、新たに条件を満たしたものを付与する。
   * @param {{trigger?:string}} context ログ用途（現状は特に分岐しない。将来の拡張余地として保持）
   * @returns {Array} 新しく獲得した称号のリスト
   */
  function checkAndAward(context = {}) {
    const state = GameState.getState();
    const newlyEarned = [];

    BUILTIN_DEFS.forEach((def) => {
      if (def.perGenre) {
        state.genres.forEach((genre) => {
          if (isEarned(def.id, genre.id)) return;
          if (def.check(genre, state)) {
            newlyEarned.push(awardTitle(def.id, `${genre.title || genre.name}の${def.label}`, genre.id, "builtin"));
          }
        });
      } else {
        if (isEarned(def.id, null)) return;
        if (def.check(null, state)) {
          newlyEarned.push(awardTitle(def.id, def.label, null, "builtin"));
        }
      }
    });

    getCustomDefs().forEach((def) => {
      const type = CUSTOM_CONDITION_TYPES[def.conditionType];
      if (!type) return;
      if (type.perGenre) {
        const genre = state.genres.find((g) => g.id === def.genreId);
        if (!genre || isEarned(def.id, genre.id)) return;
        if (type.getValue(genre, state) >= def.threshold) {
          newlyEarned.push(awardTitle(def.id, `${genre.title || genre.name}の${def.name}`, genre.id, "custom"));
        }
      } else {
        if (isEarned(def.id, null)) return;
        if (type.getValue(null, state) >= def.threshold) {
          newlyEarned.push(awardTitle(def.id, def.name, null, "custom"));
        }
      }
    });

    newlyEarned.forEach(showTitleEarnedToast);
    return newlyEarned;
  }

  function awardTitle(defId, label, genreId, source) {
    const record = { id: Utils.generateId("title"), defId, label, genreId, source, earnedAt: Utils.todayStr() };
    GameState.update((state) => { state.titles.push(record); });
    return record;
  }

  function showTitleEarnedToast(title) {
    Utils.showToast(`称号「${title.label}」を獲得しました！`, "success");

    const overlay = Utils.el("div", { class: "title-earned-overlay pulse-once" });
    overlay.appendChild(Utils.el("div", { class: "title-earned-badge" }, "称号獲得"));
    overlay.appendChild(Utils.el("h2", {}, title.label));

    if (title.genreId && typeof CharacterSystem !== "undefined") {
      const completedChar = CharacterSystem.getOwned().find((c) => c.genreId === title.genreId && c.obtainedDate);
      if (completedChar) {
        overlay.appendChild(Utils.el("p", { class: "title-earned-dialogue" },
          `「${CharacterSystem.getDialogue(completedChar, "onTitleEarned")}」`));
      }
    }
    overlay.appendChild(Utils.el("button", { class: "btn btn-moss btn-block", onclick: () => overlay.remove() }, "閉じる"));
    document.body.appendChild(overlay);
    setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 6000);
  }

  /* ============================================================
     画面："titles"（獲得済み称号の一覧）
     ============================================================ */

  function renderTitlesScreen(root) {
    const wrap = Utils.el("div", { class: "screen-inner" });
    wrap.appendChild(Utils.el("h2", {}, "称号"));

    const earned = [...getEarned()].sort((a, b) => (a.earnedAt < b.earnedAt ? 1 : -1));
    if (earned.length === 0) {
      wrap.appendChild(Utils.el("p", { class: "empty-state" }, "まだ称号がありません。学習や復習、日記を続けてみましょう。"));
    }
    earned.forEach((t) => {
      wrap.appendChild(Utils.el("div", { class: "panel title-list-row" }, [
        Utils.el("h3", {}, t.label),
        Utils.el("span", { class: "progress-meta" }, [Utils.el("span", {}, t.earnedAt)]),
      ]));
    });

    root.appendChild(wrap);
  }

  Router.registerScreen("titles", renderTitlesScreen);

  return {
    BUILTIN_DEFS, CUSTOM_CONDITION_TYPES,
    getEarned, getCustomDefs, addCustomDef, editCustomDef, removeCustomDef, checkAndAward,
  };
})();
