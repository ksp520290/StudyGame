/**
 * gameState.js
 * -----------------------------------------
 * アプリ全体の「今の状態」を保持する唯一の場所（Single Source of Truth）。
 *
 * Phase5メモ：state.map は Phase1から「構造だけ確保」されていた領域。
 * Phase5では mapSystem.js が state.map[key] = { virtualSize, stagePositions } の形で
 * 遅延生成・永続化する（createDefaultState/migrateIfNeededの変更は不要。既存の `map: {}` を
 * そのまま利用できる設計にしてある）。keyは当初ジャンルIDだったが、ステージ地図を
 * 「問題セット単位」の画面に分割した際に問題セットIDへ変更された（mapSystem.js参照）。
 */

const GameState = (() => {
  const STORAGE_KEY = "state_v1";
  const STATE_VERSION = 1;

  let state = null;
  let saveTimer = null;
  const SAVE_DEBOUNCE_MS = 400;

  const EMBEDDED_FALLBACK_GENRES = [
    {
      id: "genre_english",
      name: "英語",
      title: "英語のはじめの一歩",
      questionSets: [
        {
          id: "qs_english_word",
          name: "単語",
          quests: [
            {
              id: "quest_word_unit1",
              name: "Unit1",
              questions: [
                { id: "q_001", question: "「apple」の意味は？", answer: "りんご", antonym: "", synonyms: ["林檎"], unrelated: ["机", "空", "走る"] },
                { id: "q_002", question: "「happy」の意味は？", answer: "幸せな", antonym: "悲しい", synonyms: ["嬉しい"], unrelated: ["石", "遅い", "青い"] },
                { id: "q_003", question: "「difficult」の意味は？", answer: "難しい", antonym: "簡単な", synonyms: ["困難な"], unrelated: ["甘い", "速い", "軽い"] },
                { id: "q_004", question: "「begin」の意味は？", answer: "始める", antonym: "終える", synonyms: ["開始する"], unrelated: ["食べる", "眠る", "笑う"] },
                { id: "q_005", question: "「quiet」の意味は？", answer: "静かな", antonym: "うるさい", synonyms: ["穏やかな"], unrelated: ["熱い", "重い", "新しい"] }
              ]
            }
          ]
        }
      ]
    }
  ];

  function createDefaultState(genres) {
    return {
      meta: {
        version: STATE_VERSION,
        createdAt: Utils.todayStr(),
        lastSavedAt: null,
      },
      user: {
        loginDates: [],
        currentStreak: 0,
        longestStreak: 0,
        compass: 0,
        settings: {
          homeDisplayMode: "text",
          // 【追加要望対応】GitHub連携設定（画像自動保存先。assetManager.js参照）。
          // tokenはブラウザ内のIndexedDB/LocalStorageにのみ保存され、api.github.com以外には送信しない。
          github: { owner: "", repo: "", branch: "main", token: "" },
        },
      },
      genres: genres,

      stageProgress: {},

      reviewSchedules: [],
      reviewHistory: [],

      missStreakByGenre: {},
      blueprints: {},
      lifetimeRetryCount: 0,
      gacha: { monthKey: null, loginCountThisMonth: 0, lastLoginDate: null, wasReturningLogin: false },

      // --- Phase5：地図 ---
      // mapSystem.jsが `map[genreId] = { virtualSize, stagePositions:{} }` を遅延生成する。
      map: {},

      // --- Phase6：建築 ---
      // buildingSystem.jsが管理。各要素の形は buildingSystem.js の placeBuilding() 参照：
      // { id, genreId, hostStageId, slotIndex, level(1-5), name, assignedCharacterIds, completedAt }
      buildings: [],
      // 建築拡張権限の所持数（仕様25章）。Phase7のガチャ報酬で増える想定。
      buildingExpansionTickets: 0,

      // --- Phase7：ガチャ・キャラクター ---
      // characterDefs：キャラクターの「定義」（デフォルト＋仲間の誘致で追加されたもの）。
      //   { id, name, nickname, genreId, image, dialogues:{}, source:"default"|"custom" }
      // characters：ユーザーが実際に欠片を集めている／完成させた「所持キャラクター」。
      //   characterSystem.js の addFragment() 参照：
      //   { id, defId, genreId, name, nickname, image, fragmentCount(0-10), recoveryRate,
      //     obtainedDate, assignedBuildingId, contributionCount, dialogues }
      characterDefs: [],
      characters: [],

      // --- 【追加要望対応】建築物の「定義」 ---
      // buildingSystem.js の recruitBuildingType() が管理。仲間の誘致と同じ形の二層構造
      // （定義buildingDefs＋実体buildings）を建築物にも導入したもの。
      //   { id, name, genreId, image, source:"custom" }
      buildingDefs: [],

      // --- Phase8：日記・読書記録 ---
      // diarySystem.js が管理。1件 = { id, targetDate("前日"の日付), changeRecord, dayFlow,
      // feelings, recordedAt }。targetDateにつき1件（upsert）。仕様60〜61章。
      diary: [],
      // readingSystem.js が管理。1件 = 1冊の読書記録（仕様62章）。
      books: [],

      // --- Phase9：称号 ---
      // 獲得済み称号。1件 = { id, defId, label, genreId(null可), source:"builtin"|"custom", earnedAt }
      titles: [],
      // ユーザーが設定画面から追加した「独自称号」の条件定義（仕様64章：称号追加・称号条件設定）。
      // titleSystem.js の CUSTOM_CONDITION_TYPES を参照。
      titleDefs: [],
    };
  }

  async function loadInitialGenres() {
    try {
      const res = await fetch("data/initialData.json");
      if (!res.ok) throw new Error("initialData.jsonの取得に失敗: " + res.status);
      const json = await res.json();
      if (Array.isArray(json.genres) && json.genres.length > 0) {
        return json.genres;
      }
      throw new Error("initialData.jsonにgenresが含まれていません");
    } catch (err) {
      console.warn("[gameState] 初期データのfetchに失敗したため埋め込みデータを使用します", err);
      return Utils.deepClone(EMBEDDED_FALLBACK_GENRES);
    }
  }

  async function init() {
    await StorageEngine.init();
    const saved = await StorageEngine.get(STORAGE_KEY);

    if (saved && typeof saved === "object" && saved.meta) {
      state = saved;
      migrateIfNeeded();
    } else {
      const genres = await loadInitialGenres();
      state = createDefaultState(genres);
      await persist();
    }

    recordLoginForToday();
    return state;
  }

  function migrateIfNeeded() {
    if (!state.meta.version || state.meta.version < STATE_VERSION) {
      state.meta.version = STATE_VERSION;
    }
    const defaults = {
      stageProgress: {},
      reviewSchedules: [],
      reviewHistory: [],
      missStreakByGenre: {},
      blueprints: {},
      lifetimeRetryCount: 0,
      gacha: { monthKey: null, loginCountThisMonth: 0, lastLoginDate: null, wasReturningLogin: false },
      map: {},
      buildings: [], buildingExpansionTickets: 0,
      characterDefs: [], characters: [],
      buildingDefs: [],
      diary: [], books: [],
      titles: [], titleDefs: [],
    };
    for (const [key, value] of Object.entries(defaults)) {
      if (!(key in state)) state[key] = value;
    }
    // 【追加要望対応】旧セーブデータにはuser.settings.githubが無いため補完する。
    if (!state.user.settings) state.user.settings = { homeDisplayMode: "text" };
    if (!state.user.settings.github) {
      state.user.settings.github = { owner: "", repo: "", branch: "main", token: "" };
    }
  }

  function getState() {
    return state;
  }

  function update(mutator) {
    mutator(state);
    scheduleSave();
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { persist(); }, SAVE_DEBOUNCE_MS);
  }

  async function persist() {
    state.meta.lastSavedAt = new Date().toISOString();
    const ok = await StorageEngine.set(STORAGE_KEY, state);
    if (!ok) {
      Utils.showToast("自動保存に失敗しました。設定画面からバックアップを取ることをおすすめします。", "error");
    }
    return ok;
  }

  function recordLoginForToday() {
    const today = Utils.todayStr();
    if (state.user.loginDates.includes(today)) return;

    const dates = state.user.loginDates;
    const yesterday = Utils.addDays(today, -1);
    const wasConsecutive = dates.length > 0 && dates[dates.length - 1] === yesterday;

    dates.push(today);
    state.user.currentStreak = wasConsecutive ? state.user.currentStreak + 1 : 1;
    state.user.longestStreak = Math.max(state.user.longestStreak, state.user.currentStreak);

    // 【Phase7】ガチャ確率優先順位①（仕様40章）：1週間以上ログインしていない
    // 復帰日かどうかを、上書きされる前のlastLoginDateを使って判定し保存しておく。
    // gachaSystem.jsはこのフラグを最優先の条件として参照する。
    const previousLastLogin = state.gacha.lastLoginDate;
    state.gacha.wasReturningLogin = !!previousLastLogin && Utils.diffDays(today, previousLastLogin) >= 7;

    const monthKey = today.slice(0, 7);
    if (state.gacha.monthKey !== monthKey) {
      state.gacha.monthKey = monthKey;
      state.gacha.loginCountThisMonth = 1;
    } else {
      state.gacha.loginCountThisMonth += 1;
    }
    state.gacha.lastLoginDate = today;

    scheduleSave();
  }

  function findStageContext(stageId) {
    for (const genre of state.genres) {
      for (const qs of genre.questionSets || []) {
        for (const quest of qs.quests || []) {
          if (quest.id === stageId) {
            return { genre, questionSet: qs, stage: quest };
          }
        }
      }
    }
    return null;
  }

  /**
   * 【追加要望対応】問題データ詳細ポップアップの「補足追加」機能用。
   * 問題IDから、問題データ本体（GameStateの実体。ミュータブルな参照）を探して返す。
   * 呼び出し側は GameState.update(s => ...) の中で使うこと。
   */
  function findQuestionById(questionId) {
    for (const genre of state.genres) {
      for (const qs of genre.questionSets || []) {
        for (const quest of qs.quests || []) {
          for (const q of quest.questions || []) {
            if (q.id === questionId) return q;
          }
        }
      }
    }
    return null;
  }

  function getLevel() {
    return state.user.loginDates.length;
  }

  return {
    init,
    getState,
    update,
    persist,
    getLevel,
    findStageContext,
    findQuestionById,
  };
})();
