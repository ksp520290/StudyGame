/**
 * router.js
 * -----------------------------------------
 * 画面（screen）の切り替えを一元管理する。
 */

const Router = (() => {
  let currentScreen = null;
  const screenContainer = () => document.getElementById("screen-container");
  const nav = () => document.getElementById("main-nav");

  const screens = {
    title: renderTitleScreen,
    home: renderHomeScreen,
    explore: renderExploreScreen,
    settings: renderSettingsScreen,
  };

  function registerScreen(name, renderFn) {
    screens[name] = renderFn;
  }

  function navigate(name, params = {}) {
    if (!screens[name]) {
      console.error(`[router] 未定義の画面: ${name}`);
      return;
    }
    currentScreen = name;

    if (name === "title") {
      nav().classList.add("hidden");
    } else {
      nav().classList.remove("hidden");
      updateNavActiveState(name);
    }

    const container = screenContainer();
    container.innerHTML = "";
    container.scrollTop = 0;
    const screenEl = Utils.el("div", { class: "screen" });
    container.appendChild(screenEl);
    screens[name](screenEl, params);
  }

  function updateNavActiveState(name) {
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.screen === name);
    });
  }

  function getCurrentScreen() {
    return currentScreen;
  }

  /**
   * 【追加要望対応】待ち受け画面の「ログイン」は、デバイス上のバックアップファイル
   * （終了ボタンで保存したJSON等）を選択して読み込む方式にした。
   * この端末にすでに保存データがある場合向けに、下に小さく
   * 「この端末の保存データで続ける」も用意し、初回利用や
   * バックアップファイルが手元に無い場合の入り口を確保している。
   */
  function renderTitleScreen(root) {
    const backupFileInput = Utils.el("input", { type: "file", accept: ".json,application/json", style: "display:none;" });
    backupFileInput.addEventListener("change", () => {
      const file = backupFileInput.files[0];
      if (file) handleLoginWithBackupFile(file);
      backupFileInput.value = "";
    });

    root.appendChild(
      Utils.el("div", { class: "screen-title" }, [
        Utils.el("div", {}, [
          Utils.el("h1", { class: "title-heading" }, "霧晴れの開拓譚"),
          Utils.el("p", { class: "title-sub" }, "学びが、まだ見ぬ世界の霧を晴らす。"),
        ]),
        Utils.el("button", { class: "btn btn-primary", onclick: () => backupFileInput.click() }, "ログイン"),
        Utils.el("p", { class: "title-sub", style: "font-size:12px; margin-top:4px;" }, "デバイス内のバックアップファイル（.json）を選択します"),
        Utils.el("button", {
          class: "btn btn-secondary btn-block", style: "margin-top:16px;",
          onclick: handleContinueOnThisDeviceClick,
        }, "この端末の保存データで続ける"),
        backupFileInput,
      ])
    );
  }

  async function handleLoginWithBackupFile(file) {
    await GameState.init();
    try {
      await ImportExport.importBackupFromFile(file);
    } catch (err) {
      // importBackupFromFile側でトースト表示済み。ログインは中断せず待ち受け画面のまま。
      return;
    }
    await App.playCutscene("open", "扉が開く…");
    navigate("home");
  }

  async function handleContinueOnThisDeviceClick() {
    await GameState.init();
    await App.playCutscene("open", "扉が開く…");
    navigate("home");
  }

  function renderHomeScreen(root) {
    const state = GameState.getState();
    const level = GameState.getLevel();
    const genres = state.genres;

    const wrap = Utils.el("div", { class: "screen-inner" });

    wrap.appendChild(
      Utils.el("div", { class: "home-header" }, [
        Utils.el("div", { class: "home-header-left" }, [
          Utils.el("button", { class: "icon-btn", "aria-label": `所持コンパス${state.user.compass}個。探索画面へ`, onclick: () => navigate("explore") }, `🧭 ${state.user.compass}`),
          // 【Phase8】仕様35章「左上：ガチャ」＋仕様61章「前日分の日記記録でガチャ解放」の実装。
          // DiarySystem.isGachaUnlockedToday()＝前日分の日記が記録済みかどうかで分岐する：
          //   記録済み → 直接ガチャ画面へ（仕様61章「霧晴れの開拓日誌→直接ガチャ画面」）
          //   未記録   → 霧晴れの開拓日誌（journal）へ誘導し、先に日記を書いてもらう
          Utils.el("button", {
            class: "icon-btn",
            "aria-label": "ガチャ",
            onclick: () => navigate((typeof DiarySystem !== "undefined" && DiarySystem.isGachaUnlockedToday()) ? "gacha" : "journal"),
          }, "📔"),
        ]),
        Utils.el("div", { class: "level-badge" }, [
          Utils.el("div", { class: "level-num" }, String(level)),
          Utils.el("div", { class: "fs-xs" }, "累計ログイン日数"),
        ]),
        Utils.el("button", {
          class: "icon-btn", "aria-label": "保存して終了",
          // 【追加要望対応】終了ボタン：まずGameState.persist()でDB（IndexedDB/LocalStorage）への
          // 保存を明示的に確定させてから、従来通りバックアップJSONも書き出す。
          onclick: () => { GameState.persist().then(() => ImportExport.exportBackup()); },
        }, "終了"),
      ])
    );

    const pendingReviewCount = ReviewSystem
      ? Object.values(ReviewSystem.getCategorizedReviews()).reduce((sum, arr) => sum + arr.length, 0)
        + ReviewSystem.getStarQuestionsDue().length
      : 0;
    const recommendText = pendingReviewCount > 0
      ? `今日の復習が ${pendingReviewCount} クエスト待っています`
      : (genres.length > 0 ? `「${genres[0].name}」の新しい問題に挑戦する` : "設定画面からジャンルを追加しよう");
    const recommendTarget = pendingReviewCount > 0 ? "review" : "explore";

    wrap.appendChild(
      Utils.el("div", { class: "recommend-box" }, [
        Utils.el("div", { class: "recommend-label" }, "今日のおすすめ行動"),
        Utils.el("div", { class: "recommend-action" }, recommendText),
        Utils.el("button", { class: "btn btn-moss btn-block", onclick: () => navigate(recommendTarget) }, "はじめる"),
      ])
    );

    // 【Phase10】仕様53〜54章：熱狂段階／習慣・愛着段階でホーム画面の重点を切り替える。
    // ゲームシステム自体（データ・確率など）は一切変えず、見せ方のみを変える。
    const isHabitPhase = typeof WorldPhaseSystem !== "undefined" && WorldPhaseSystem.isHabitPhase();

    const panel = Utils.el("div", { class: "panel" }, [
      Utils.el("h2", {}, isHabitPhase ? "自分の世界の様子" : "世界の様子"),
    ]);
    if (genres.length === 0) {
      panel.appendChild(Utils.el("p", { class: "empty-state" }, "まだジャンルがありません。設定画面から追加してください。"));
    } else {
      genres.forEach((genre) => {
        panel.appendChild(renderGenreProgressRow(state, genre, isHabitPhase));
      });
    }
    wrap.appendChild(panel);

    if (isHabitPhase) {
      wrap.appendChild(renderWorldSummaryPanel(state));
    }

    root.appendChild(wrap);
  }

  /** 熱狂段階：ステージ進捗を主役に。習慣段階：設計図・建築の積み上げを主役にする */
  function renderGenreProgressRow(state, genre, isHabitPhase) {
    const stageTotal = countStages(genre);
    const stageCleared = countClearedStages(state, genre);
    const bp = RewardSystem.getBlueprintProgress(genre.id);
    const buildingCount = (state.buildings || []).filter((b) => b.genreId === genre.id).length;

    if (!isHabitPhase) {
      return Utils.el("div", { class: "genre-progress-row" }, [
        Utils.el("h3", {}, genre.title || genre.name),
        Utils.el("div", { class: "progress-track" }, [
          Utils.el("div", { class: "progress-fill", style: `width: ${stageTotal ? Math.round((stageCleared / stageTotal) * 100) : 0}%` }),
        ]),
        Utils.el("div", { class: "progress-meta" }, [
          Utils.el("span", {}, `ステージ ${stageCleared} / ${stageTotal}`),
          Utils.el("span", {}, `設計図 ${bp.fragmentsCollected} / 9（完成${bp.completedCount}）`),
        ]),
      ]);
    }

    return Utils.el("div", { class: "genre-progress-row" }, [
      Utils.el("h3", {}, genre.title || genre.name),
      Utils.el("div", { class: "progress-track" }, [
        Utils.el("div", { class: "progress-fill", style: `width: ${Math.round((bp.fragmentsCollected / 9) * 100)}%` }),
      ]),
      Utils.el("div", { class: "progress-meta" }, [
        Utils.el("span", {}, `設計図 あと${9 - bp.fragmentsCollected}片（完成${bp.completedCount}）`),
        Utils.el("span", {}, `建築物 ${buildingCount}棟`),
      ]),
      Utils.el("div", { class: "progress-meta" }, [
        Utils.el("span", {}, `ステージ ${stageCleared} / ${stageTotal}`),
      ]),
    ]);
  }

  /** 習慣段階のみ表示：世界全体（建築・キャラクター・称号）の積み上げサマリ */
  function renderWorldSummaryPanel(state) {
    const buildingTotal = (state.buildings || []).length;
    const characterTotal = (state.characters || []).filter((c) => c.obtainedDate).length;
    const titleTotal = (state.titles || []).length;
    return Utils.el("div", { class: "panel world-summary-panel" }, [
      Utils.el("h2", {}, "積み上げてきたもの"),
      Utils.el("div", { class: "world-summary-grid" }, [
        Utils.el("div", { class: "world-summary-item" }, [Utils.el("div", { class: "world-summary-num" }, String(buildingTotal)), Utils.el("div", {}, "建築物")]),
        Utils.el("div", { class: "world-summary-item" }, [Utils.el("div", { class: "world-summary-num" }, String(characterTotal)), Utils.el("div", {}, "仲間")]),
        Utils.el("div", { class: "world-summary-item" }, [Utils.el("div", { class: "world-summary-num" }, String(titleTotal)), Utils.el("div", {}, "称号")]),
      ]),
      Utils.el("button", { class: "btn btn-secondary btn-block", onclick: () => navigate("titles") }, "称号を見る"),
    ]);
  }

  function countStages(genre) {
    let count = 0;
    (genre.questionSets || []).forEach((qs) => { count += (qs.quests || []).length; });
    return count;
  }

  function countClearedStages(state, genre) {
    let count = 0;
    (genre.questionSets || []).forEach((qs) => {
      (qs.quests || []).forEach((stage) => {
        const p = state.stageProgress[stage.id];
        if (p && p.result !== "none") count += 1;
      });
    });
    return count;
  }

  function renderExploreScreen(root) {
    const wrap = Utils.el("div", { class: "screen-inner" });
    wrap.appendChild(Utils.el("h2", {}, "探索"));

    const list = Utils.el("div", { class: "explore-list" }, [
      Utils.el("button", { class: "explore-btn", onclick: () => navigate("fogStageSelect") }, [
        "未知の霧",
        Utils.el("span", { class: "explore-desc" }, "新しく学び、土地の霧を晴らす"),
      ]),
      Utils.el("button", { class: "explore-btn", onclick: () => navigate("review") }, [
        "知の探究",
        Utils.el("span", { class: "explore-desc" }, "過去の学びを復習し、設計図を集める"),
      ]),
      Utils.el("button", { class: "explore-btn wide", onclick: () => navigate("journal") }, [
        "霧晴れの開拓日誌",
        Utils.el("span", { class: "explore-desc" }, "日記と読書記録をつける"),
      ]),
      Utils.el("button", { class: "explore-btn wide", onclick: () => navigate("retryStage") }, [
        "過去ステージ再挑戦",
        Utils.el("span", { class: "explore-desc" }, `🧭${RewardSystem.RETRY_COST_COMPASS}を消費して、クリア済みのエリアにもう一度挑む`),
      ]),
    ]);
    wrap.appendChild(list);
    root.appendChild(wrap);
  }

  // 【補完】過去ステージ再挑戦画面（仕様44章）
  function renderRetryStageScreen(root) {
    const state = GameState.getState();
    const wrap = Utils.el("div", { class: "screen-inner" });
    wrap.appendChild(Utils.el("h2", {}, "過去ステージ再挑戦"));
    wrap.appendChild(Utils.el("p", { class: "explore-desc" },
      `クリア済みのエリアを選んで再挑戦できます。🧭${RewardSystem.RETRY_COST_COMPASS}を消費し、設計図の欠片獲得に挑戦します（挑戦するほど確率は下がります）。`));

    const clearedGenreIds = new Set();
    Object.entries(state.stageProgress).forEach(([stageId, progress]) => {
      if (progress.result === "perfect" || progress.result === "clear") {
        const ctx = GameState.findStageContext(stageId);
        if (ctx) clearedGenreIds.add(ctx.genre.id);
      }
    });
    const clearedGenres = state.genres.filter((g) => clearedGenreIds.has(g.id));

    if (clearedGenres.length === 0) {
      wrap.appendChild(Utils.el("p", { class: "empty-state" }, "まだクリア済みのステージがありません"));
      root.appendChild(wrap);
      return;
    }

    const probability = RewardSystem.calcRetryProbability();
    wrap.appendChild(Utils.el("p", { class: "settings-row" }, [
      Utils.el("span", {}, "現在の欠片獲得確率"),
      Utils.el("span", { class: "value" }, `${probability}%`),
    ]));

    const resultBox = Utils.el("div", { class: "panel", style: "display:none; margin-top:12px;" });

    clearedGenres.forEach((g) => {
      wrap.appendChild(Utils.el("button", {
        class: "explore-btn wide",
        onclick: () => {
          const res = RewardSystem.attemptStageRetry(g.id);
          if (!res.ok) {
            Utils.showToast(`コンパスが足りません（🧭${RewardSystem.RETRY_COST_COMPASS}必要）`, "error");
            return;
          }
          resultBox.style.display = "block";
          resultBox.innerHTML = "";
          resultBox.appendChild(Utils.el("p", {}, res.won
            ? `設計図の欠片を1つ手に入れました！（確率${res.probability}%）`
            : `今回は何も見つかりませんでした…（確率${res.probability}%）`));
          Utils.showToast(res.won ? "設計図の欠片を獲得！" : "欠片は得られませんでした", res.won ? "success" : "info");
          navigate("retryStage");
        },
      }, [
        g.title || g.name,
        Utils.el("span", { class: "explore-desc" }, `🧭${RewardSystem.RETRY_COST_COMPASS}で挑戦する`),
      ]));
    });

    wrap.appendChild(resultBox);
    root.appendChild(wrap);
  }
  registerScreen("retryStage", renderRetryStageScreen);

  /* ============================================================
     【追加要望対応】設定画面の共通UI部品
     ============================================================ */

  /** タブ切り替えUI。tabs = [{key, label, render(container)}] */
  function buildTabPanel(tabs) {
    const nav = Utils.el("div", { class: "settings-tabs", role: "tablist" });
    const content = Utils.el("div", { class: "settings-tab-content" });
    function activate(key) {
      Array.from(nav.children).forEach((btn) => btn.classList.toggle("active", btn.dataset.key === key));
      content.innerHTML = "";
      const tab = tabs.find((t) => t.key === key);
      if (tab) tab.render(content);
    }
    tabs.forEach((t) => {
      nav.appendChild(Utils.el("button", {
        type: "button", class: "settings-tab-btn", "data-key": t.key,
        onclick: () => activate(t.key),
      }, t.label));
    });
    activate(tabs[0].key);
    return Utils.el("div", { class: "settings-tab-panel" }, [nav, content]);
  }

  /**
   * 画像アップロード用の入力欄を1つ作る。
   * AssetManager.uploadImage() を呼び、GitHub連携が設定済みならassets/imgへ自動保存、
   * 未設定ならdataURLとして扱う（要望1章・6章対応）。
   * @returns {{wrap: HTMLElement, getValue: () => string}}
   */
  function buildImageUploadField(labelText, folderHint, initialValue) {
    let currentValue = initialValue || "";
    const preview = Utils.el("img", {
      class: "image-upload-preview",
      src: currentValue || "",
      style: currentValue ? "" : "display:none;",
      alt: "",
    });
    const fileInput = Utils.el("input", { type: "file", accept: "image/*", class: "review-typing-input" });
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;
      Utils.showToast("画像をアップロード中…", "info");
      try {
        const result = await AssetManager.uploadImage(file, folderHint);
        currentValue = result.image;
        preview.src = currentValue;
        preview.style.display = "";
      } catch (err) {
        console.error("[settings] 画像アップロードに失敗しました", err);
        Utils.showToast("画像の読み込みに失敗しました", "error");
      }
    });
    const wrap = Utils.el("div", { class: "image-upload-field" }, [
      Utils.el("label", { class: "diary-field-label" }, labelText),
      preview,
      fileInput,
    ]);
    return { wrap, getValue: () => currentValue };
  }

  /* ============================================================
     設定画面本体
     ============================================================ */

  function renderSettingsScreen(root) {
    const state = GameState.getState();
    const wrap = Utils.el("div", { class: "screen-inner" });
    wrap.appendChild(Utils.el("h2", {}, "設定"));

    wrap.appendChild(renderAccountInfoGroup(state));
    wrap.appendChild(renderNewInfoGroup(state));
    wrap.appendChild(renderEditInfoGroup(state));
    wrap.appendChild(renderGithubSettingsGroup(state));
    wrap.appendChild(renderBackupAndDataGroup(state));

    root.appendChild(wrap);
  }

  /* --- 【追加要望対応】「アカウント情報」＋「現在の状況確認」を統合 --- */
  function renderAccountInfoGroup(state) {
    const group = settingsAccordion("アカウント情報", [
      settingsRow("累計ログイン日数", String(state.user.loginDates.length)),
      settingsRow("連続ログイン日数", String(state.user.currentStreak)),
      settingsRow("保存方式", StorageEngine.getMode() === "indexeddb" ? "IndexedDB" : "LocalStorage"),
    ], { open: true });

    group.appendChild(Utils.el("h4", { style: "margin-top:16px;" }, "土地解放状況（エリアごとの進捗）"));
    if (state.genres.length === 0) {
      group.appendChild(Utils.el("p", {}, "ジャンルがまだありません"));
    } else {
      state.genres.forEach((g) => {
        const pct = (typeof FogSystem !== "undefined") ? FogSystem.areaProgressPercent(state, g) : 0;
        group.appendChild(settingsRow(g.title || g.name, `${pct}%解放`));
      });
    }

    group.appendChild(Utils.el("h4", { style: "margin-top:12px;" }, "所持キャラクター"));
    const owned = (typeof CharacterSystem !== "undefined") ? CharacterSystem.getOwned() : [];
    if (owned.length === 0) {
      group.appendChild(Utils.el("p", {}, "まだキャラクターがいません"));
    } else {
      owned.forEach((c) => {
        const status = c.fragmentCount >= CharacterSystem.MAX_FRAGMENTS ? "完成" : `欠片${c.fragmentCount}/${CharacterSystem.MAX_FRAGMENTS}`;
        group.appendChild(settingsRow(c.name, status));
      });
    }

    group.appendChild(Utils.el("h4", { style: "margin-top:12px;" }, "所持建築物"));
    const buildings = state.buildings || [];
    if (buildings.length === 0) {
      group.appendChild(Utils.el("p", {}, "まだ建築物がありません"));
    } else {
      buildings.forEach((b) => {
        const genre = state.genres.find((g) => g.id === b.genreId);
        const label = (typeof BuildingSystem !== "undefined" && genre) ? BuildingSystem.defaultBuildingName(genre, b) : (b.name || "名称未設定");
        group.appendChild(settingsRow(label, `Lv${b.level}`));
      });
    }

    return group;
  }

  /* --- 【追加要望対応】「バックアップ」と「問題データ管理」を統合し、範囲ごとにタブ切替 --- */
  function renderBackupAndDataGroup(state) {
    const tabs = [
      { key: "backup", label: "バックアップ", render: (c) => renderDataMgmtBackupTab(c) },
      { key: "all", label: "全問題", render: (c) => renderDataMgmtQuestionsTab(c, "all") },
      { key: "genre", label: "エリア別", render: (c) => renderDataMgmtQuestionsTab(c, "genre") },
      { key: "questionset", label: "道別", render: (c) => renderDataMgmtQuestionsTab(c, "questionset") },
      { key: "stage", label: "ステージ別", render: (c) => renderDataMgmtQuestionsTab(c, "stage") },
    ];
    const group = settingsAccordion("データ管理", [
      Utils.el("p", { class: "explore-desc" },
        "バックアップ全体、または問題データを範囲ごとに、JSON・CSVのどちらかの形式で入力（読み込み）・出力（書き出し）できます。上のタブで範囲を切り替えてください。"),
    ]);
    group.appendChild(buildTabPanel(tabs));
    return group;
  }

  /** JSON/CSVの形式選択ラジオボタンを作る共通ヘルパー。{wrap, getFormat} を返す */
  function buildFormatSelector(initial = "json") {
    let format = initial;
    const jsonRadio = Utils.el("input", { type: "radio", name: `fmt_${Utils.generateId("f")}`, checked: initial === "json" });
    const csvRadio = Utils.el("input", { type: "radio", name: jsonRadio.name, checked: initial === "csv" });
    jsonRadio.addEventListener("change", () => { if (jsonRadio.checked) format = "json"; });
    csvRadio.addEventListener("change", () => { if (csvRadio.checked) format = "csv"; });
    const wrap = Utils.el("div", { class: "format-selector-row" }, [
      Utils.el("label", { class: "format-selector-option" }, [jsonRadio, " JSON"]),
      Utils.el("label", { class: "format-selector-option" }, [csvRadio, " CSV"]),
    ]);
    return { wrap, getFormat: () => format };
  }

  /* --- 「バックアップ」タブ：アプリ全体のデータをJSON/CSVで入出力 --- */
  function renderDataMgmtBackupTab(container) {
    container.appendChild(Utils.el("p", { class: "explore-desc" },
      "ジャンル・問題・進捗・コンパス・建築物・キャラクター・称号・日記など、アプリの全データをまとめて入出力します。"));

    const fmt = buildFormatSelector("json");
    container.appendChild(fmt.wrap);

    container.appendChild(Utils.el("button", {
      class: "btn btn-primary btn-block", style: "margin-top:10px;",
      onclick: () => {
        if (fmt.getFormat() === "json") ImportExport.exportBackup();
        else ImportExport.exportBackupAsCSV();
      },
    }, "バックアップを出力"));

    const fileInput = Utils.el("input", {
      type: "file", accept: ".json,.csv,application/json,text/csv", style: "margin-top:10px; width:100%;",
      onchange: (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const isCsv = fmt.getFormat() === "csv";
        const promise = isCsv ? ImportExport.importBackupFromCSVFile(file) : ImportExport.importBackupFromFile(file);
        promise.then(() => navigate("home")).catch(() => {});
      },
    });
    container.appendChild(Utils.el("div", { style: "margin-top:10px;" }, [
      Utils.el("label", { class: "settings-row" }, "バックアップを読み込む（選んだ形式のファイルを選択）"),
      fileInput,
    ]));
  }

  /**
   * 「全問題／エリア別／道別／ステージ別」タブ共通の実装。
   * scope: "all" | "genre" | "questionset" | "stage"
   */
  function renderDataMgmtQuestionsTab(container, scope) {
    const state = GameState.getState();
    if (scope !== "all" && state.genres.length === 0) {
      container.appendChild(Utils.el("p", {}, "先にジャンルを追加してください"));
      return;
    }

    // --- 範囲選択（エリア別／道別／ステージ別のときのみ表示） ---
    const selectorWrap = Utils.el("div", {});
    container.appendChild(selectorWrap);

    const genreSelect = Utils.el("select", { class: "review-typing-input" },
      state.genres.map((g) => Utils.el("option", { value: g.id }, g.title || g.name)));
    const qsSelect = Utils.el("select", { class: "review-typing-input" });
    const stageSelect = Utils.el("select", { class: "review-typing-input" });

    function refreshQsOptions() {
      const genre = GameState.getState().genres.find((g) => g.id === genreSelect.value);
      qsSelect.innerHTML = "";
      (genre ? genre.questionSets : []).forEach((qs) => {
        qsSelect.appendChild(Utils.el("option", { value: qs.id }, qs.name));
      });
    }
    function refreshStageOptions() {
      const genre = GameState.getState().genres.find((g) => g.id === genreSelect.value);
      const qs = genre && genre.questionSets.find((x) => x.id === qsSelect.value);
      stageSelect.innerHTML = "";
      (qs ? qs.quests : []).forEach((stage) => {
        stageSelect.appendChild(Utils.el("option", { value: stage.id }, stage.name));
      });
    }

    if (scope === "genre" || scope === "questionset" || scope === "stage") {
      selectorWrap.appendChild(Utils.el("label", { class: "diary-field-label" }, "対象エリア"));
      selectorWrap.appendChild(genreSelect);
    }
    if (scope === "questionset" || scope === "stage") {
      refreshQsOptions();
      genreSelect.addEventListener("change", () => { refreshQsOptions(); refreshStageOptions(); });
      selectorWrap.appendChild(Utils.el("label", { class: "diary-field-label" }, "対象の道"));
      selectorWrap.appendChild(qsSelect);
    }
    if (scope === "stage") {
      refreshStageOptions();
      qsSelect.addEventListener("change", refreshStageOptions);
      selectorWrap.appendChild(Utils.el("label", { class: "diary-field-label" }, "対象ステージ"));
      selectorWrap.appendChild(stageSelect);
    }

    if ((scope === "questionset" || scope === "stage") && qsSelect.options.length === 0) {
      container.appendChild(Utils.el("p", {}, "道がありません。先に追加してください。"));
      return;
    }
    if (scope === "stage" && stageSelect.options.length === 0) {
      container.appendChild(Utils.el("p", {}, "ステージがありません。先に追加してください。"));
      return;
    }

    function currentFilter() {
      const f = {};
      if (scope === "genre" || scope === "questionset" || scope === "stage") f.genreId = genreSelect.value;
      if (scope === "questionset" || scope === "stage") f.questionSetId = qsSelect.value;
      if (scope === "stage") f.stageId = stageSelect.value;
      return f;
    }
    function scopeLabelText() {
      return { all: "全問題", genre: "エリア別", questionset: "道別", stage: "ステージ別" }[scope];
    }

    // --- 出力 ---
    container.appendChild(Utils.el("h4", { style: "margin-top:16px;" }, "出力"));
    const exportFmt = buildFormatSelector("json");
    container.appendChild(exportFmt.wrap);
    container.appendChild(Utils.el("button", {
      class: "btn btn-secondary btn-block", style: "margin-top:8px;",
      onclick: () => {
        const state2 = GameState.getState();
        const filter = currentFilter();
        const questions = CsvManager.collectQuestions(state2, filter);
        if (questions.length === 0) {
          Utils.showToast("出力対象の問題がありません", "error");
          return;
        }
        const genreForCsv = filter.genreId ? state2.genres.find((g) => g.id === filter.genreId) : null;
        const baseName = `questions_${scope}_${Utils.todayStr()}`;
        if (exportFmt.getFormat() === "json") {
          const json = CsvManager.toJSON(questions, { scope });
          const blob = new Blob([json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = `${baseName}.json`;
          document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(url);
        } else {
          const csv = CsvManager.toCSV(questions, genreForCsv ? genreForCsv.id : "");
          const blob = new Blob(["\ufeff" + csv], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = `${baseName}.csv`;
          document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(url);
        }
        Utils.showToast(`${scopeLabelText()}の問題データ（${questions.length}問）を出力しました`, "success");
      },
    }, `${scopeLabelText()}を出力する`));

    // --- 入力 ---
    container.appendChild(Utils.el("h4", { style: "margin-top:20px;" }, "入力"));
    const importFmt = buildFormatSelector("json");
    container.appendChild(importFmt.wrap);

    const fallbackFields = Utils.el("div", { style: "margin-top:6px;" });
    let fallbackQsInput = null;
    let fallbackStageInput = null;
    if (scope === "all" || scope === "genre") {
      fallbackQsInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "道の名前（各行にquestion_set列が無い場合に使用）" });
      fallbackFields.appendChild(Utils.el("label", { class: "diary-field-label" }, "道の名前（フォールバック）"));
      fallbackFields.appendChild(fallbackQsInput);
    }
    if (scope !== "stage") {
      fallbackStageInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "ステージ名（各行にstage列が無い場合に使用）" });
      fallbackFields.appendChild(Utils.el("label", { class: "diary-field-label" }, "ステージ名（フォールバック）"));
      fallbackFields.appendChild(fallbackStageInput);
    }
    container.appendChild(fallbackFields);

    const importFileInput = Utils.el("input", { type: "file", accept: ".json,.csv,application/json,text/csv", style: "margin-top:6px; width:100%;" });
    const resultBox = Utils.el("div", { class: "settings-row", style: "display:none; flex-direction:column; align-items:flex-start; white-space:pre-wrap; font-size:13px;" });
    const conflictBox = Utils.el("div", { style: "display:none; margin-top:12px;" });
    container.appendChild(importFileInput);
    container.appendChild(Utils.el("button", {
      class: "btn btn-primary btn-block", style: "margin-top:8px;",
      onclick: () => {
        const file = importFileInput.files[0];
        if (!file) { Utils.showToast("ファイルを選択してください", "error"); return; }
        const reader = new FileReader();
        reader.onload = () => {
          const text = reader.result;
          const currentState = GameState.getState();
          const existingIds = CsvManager.collectAllQuestionIds(currentState);
          const parsed = importFmt.getFormat() === "json"
            ? CsvManager.parseQuestionsJSON(text, existingIds)
            : CsvManager.parseQuestionsCSV(text, existingIds);
          const { questions, conflicts, errors, warnings } = parsed;

          resultBox.style.display = "flex";
          const lines = [];
          if (errors.length > 0) {
            lines.push(`❌ エラー ${errors.length}件（該当行はスキップされました）`);
            errors.slice(0, 10).forEach((e) => lines.push("  - " + e));
            if (errors.length > 10) lines.push(`  ...ほか${errors.length - 10}件`);
          }
          if (warnings.length > 0) {
            lines.push(`⚠ 警告 ${warnings.length}件`);
            warnings.slice(0, 5).forEach((w) => lines.push("  - " + w));
          }

          if (questions.length > 0) {
            GameState.update((s) => {
              const applyResult = CsvManager.applyImportedQuestions(s, questions, {
                scope,
                genreId: scope !== "all" ? genreSelect.value : null,
                questionSetId: (scope === "questionset" || scope === "stage") ? qsSelect.value : null,
                stageId: scope === "stage" ? stageSelect.value : null,
                fallbackQuestionSetName: fallbackQsInput ? fallbackQsInput.value.trim() : "",
                fallbackStageName: fallbackStageInput ? fallbackStageInput.value.trim() : "",
              });
              lines.push(`✅ 新規取り込み: ${applyResult.imported}問（新規の道 ${applyResult.createdQuestionSets}件・新規ステージ ${applyResult.createdStages}件${scope === "all" ? `・新規ジャンル ${applyResult.createdGenres}件` : ""}）`);
              if (applyResult.skipped.length > 0) {
                lines.push(`⚠ 配置できず除外: ${applyResult.skipped.length}件`);
                applyResult.skipped.slice(0, 5).forEach((s2) => lines.push("  - " + s2));
              }
            });
          }

          if (conflicts.length === 0 && questions.length === 0) {
            lines.push("✅ 取り込める問題がありませんでした");
          }
          resultBox.textContent = lines.join("\n");
          if (questions.length > 0) Utils.showToast(`${questions.length}問を取り込みました`, "success");

          renderConflicts(conflicts);
        };
        reader.onerror = () => Utils.showToast("ファイルの読み込みに失敗しました", "error");
        reader.readAsText(file, "utf-8");
      },
    }, "取り込む"));
    container.appendChild(resultBox);
    container.appendChild(conflictBox);

    /**
     * 【追加要望対応】idが既存データと重複した行の解決UI。
     * 行ごとに「新（インポート内容）」「旧（既存のまま）」を選べるほか、
     * 「すべて新を採用」「すべて旧を残す」の一括ボタンも用意する。
     */
    function renderConflicts(conflicts) {
      conflictBox.innerHTML = "";
      if (!conflicts || conflicts.length === 0) { conflictBox.style.display = "none"; return; }
      conflictBox.style.display = "block";

      conflictBox.appendChild(Utils.el("h4", {}, `⚠ id重複 ${conflicts.length}件（新旧どちらを残すか選んでください）`));

      const radios = []; // { id, incoming, getKeep() }
      const rowsWrap = Utils.el("div", {});

      conflicts.forEach((c) => {
        const existing = GameState.findQuestionById(c.id) || {};
        const name = `conflict_${c.id}`;
        const oldRadio = Utils.el("input", { type: "radio", name, value: "old", checked: "true" });
        const newRadio = Utils.el("input", { type: "radio", name, value: "new" });
        const row = Utils.el("div", { class: "panel", style: "margin-bottom:8px;" }, [
          Utils.el("div", { class: "diary-field-label" }, `id: ${c.id}（${c.lineNo}行目/件目）`),
          Utils.el("div", { class: "settings-row" }, [
            Utils.el("span", {}, "既存(旧)"),
            Utils.el("span", { class: "value" }, `${existing.question || "(不明)"} → ${existing.answer || "(不明)"}`),
          ]),
          Utils.el("div", { class: "settings-row" }, [
            Utils.el("span", {}, "取込データ(新)"),
            Utils.el("span", { class: "value" }, `${c.incoming.question} → ${c.incoming.answer}`),
          ]),
          Utils.el("label", { class: "settings-row" }, [oldRadio, "旧（既存）を残す"]),
          Utils.el("label", { class: "settings-row" }, [newRadio, "新（取込データ）を採用する"]),
        ]);
        radios.push({ id: c.id, incoming: c.incoming, oldRadio, newRadio });
        rowsWrap.appendChild(row);
      });

      conflictBox.appendChild(Utils.el("div", { class: "quiz-choice-row", style: "margin:8px 0;" }, [
        Utils.el("button", {
          class: "btn btn-secondary",
          onclick: () => radios.forEach((r) => { r.newRadio.checked = true; }),
        }, "すべて新を採用"),
        Utils.el("button", {
          class: "btn btn-secondary",
          onclick: () => radios.forEach((r) => { r.oldRadio.checked = true; }),
        }, "すべて旧を残す"),
      ]));

      conflictBox.appendChild(rowsWrap);

      conflictBox.appendChild(Utils.el("button", {
        class: "btn btn-primary btn-block",
        onclick: () => {
          const resolutions = radios.map((r) => ({
            id: r.id, incoming: r.incoming, keep: r.newRadio.checked ? "new" : "old",
          }));
          GameState.update((s) => {
            CsvManager.applyConflictResolutions(s, resolutions);
          });
          const newCount = resolutions.filter((r) => r.keep === "new").length;
          Utils.showToast(`重複${conflicts.length}件を反映しました（新採用: ${newCount}件）`, "success");
          conflictBox.innerHTML = "";
          conflictBox.style.display = "none";
        },
      }, "重複の解決を反映する"));
    }
  }

  /* --- 【追加要望対応】画像自動保存設定（GitHub連携。assetManager.js参照） --- */
  function renderGithubSettingsGroup(state) {
    const cfg = AssetManager.getGithubConfig();
    const group = settingsAccordion("GitHub連携", [
      Utils.el("p", { class: "explore-desc" },
        "設定すると、「未開の情報」「認識改変」で追加・変更する画像がリポジトリのassets/img/へ自動保存されます。未設定の場合は画像をブラウザ内（バックアップJSON・IndexedDB）にのみ保存します。トークンはこの端末にのみ保存され、api.github.com以外へは送信されません。"),
    ]);

    const ownerInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "リポジトリのオーナー名（例：ksp520290）", value: cfg.owner });
    const repoInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "リポジトリ名（例：StudyGame）", value: cfg.repo });
    const branchInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "ブランチ名（既定：main）", value: cfg.branch || "main" });
    const tokenInput = Utils.el("input", { type: "password", class: "review-typing-input", placeholder: "Personal Access Token（repo権限）", value: cfg.token });

    group.appendChild(Utils.el("label", { class: "diary-field-label" }, "オーナー"));
    group.appendChild(ownerInput);
    group.appendChild(Utils.el("label", { class: "diary-field-label" }, "リポジトリ名"));
    group.appendChild(repoInput);
    group.appendChild(Utils.el("label", { class: "diary-field-label" }, "ブランチ"));
    group.appendChild(branchInput);
    group.appendChild(Utils.el("label", { class: "diary-field-label" }, "トークン"));
    group.appendChild(tokenInput);
    group.appendChild(Utils.el("button", {
      class: "btn btn-primary btn-block",
      style: "margin-top:8px;",
      onclick: () => {
        AssetManager.setGithubConfig({
          owner: ownerInput.value, repo: repoInput.value,
          branch: branchInput.value, token: tokenInput.value,
        });
        Utils.showToast("GitHub連携設定を保存しました", "success");
      },
    }, "この内容で保存する"));

    return group;
  }

  /* --- 【追加要望対応】「仲間の誘致」→「未開の情報」（新規追加をタブで切替） --- */
  function renderNewInfoGroup(state) {
    const tabs = [
      { key: "genre", label: "ジャンル", render: (c) => renderNewGenreTab(c) },
      { key: "questionSet", label: "道", render: (c) => renderNewQuestionSetTab(c, GameState.getState()) },
      { key: "character", label: "キャラクター", render: (c) => renderNewCharacterTab(c, GameState.getState()) },
      { key: "building", label: "建築物", render: (c) => renderNewBuildingTab(c, GameState.getState()) },
      { key: "title", label: "称号", render: (c) => renderNewTitleTab(c, GameState.getState()) },
    ];
    const group = settingsAccordion("未開の情報", [
      Utils.el("p", { class: "explore-desc" }, "ジャンル・道・キャラクター・建築物・称号を、新しく追加します。上のタブで切り替えてください。"),
    ]);
    group.appendChild(buildTabPanel(tabs));
    return group;
  }

  function renderNewGenreTab(container) {
    const nameInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "ジャンル名（例：数学）" });
    const titleInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "称号用の呼び方（未入力ならジャンル名を使用）" });
    const bgField = buildImageUploadField("背景画像（任意）", "genre-bg", "");
    container.appendChild(Utils.el("label", { class: "diary-field-label" }, "ジャンル名"));
    container.appendChild(nameInput);
    container.appendChild(Utils.el("label", { class: "diary-field-label" }, "称号用の呼び方"));
    container.appendChild(titleInput);
    container.appendChild(bgField.wrap);
    container.appendChild(Utils.el("button", {
      class: "btn btn-primary btn-block",
      onclick: () => {
        if (!nameInput.value.trim()) { Utils.showToast("ジャンル名を入力してください", "error"); return; }
        const name = nameInput.value.trim();
        GameState.update((s) => {
          s.genres.push({
            id: Utils.generateId("genre"), name, title: titleInput.value.trim() || name,
            backgroundImage: bgField.getValue(), questionSets: [],
          });
        });
        Utils.showToast(`ジャンル「${name}」を追加しました`, "success");
        navigate("settings");
      },
    }, "ジャンルを追加する"));
  }

  function renderNewQuestionSetTab(container, state) {
    if (state.genres.length === 0) { container.appendChild(Utils.el("p", {}, "先にジャンルを追加してください")); return; }
    const genreSelect = Utils.el("select", { class: "review-typing-input" },
      state.genres.map((g) => Utils.el("option", { value: g.id }, g.title || g.name)));
    const nameInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "新しい道の名前" });
    const bgField = buildImageUploadField("背景画像（任意）", "qs-bg", "");
    container.appendChild(Utils.el("label", { class: "diary-field-label" }, "対象エリア"));
    container.appendChild(genreSelect);
    container.appendChild(Utils.el("label", { class: "diary-field-label" }, "道の名前"));
    container.appendChild(nameInput);
    container.appendChild(bgField.wrap);
    container.appendChild(Utils.el("button", {
      class: "btn btn-primary btn-block",
      onclick: () => {
        if (!nameInput.value.trim()) { Utils.showToast("名前を入力してください", "error"); return; }
        GameState.update((s) => {
          const genre = s.genres.find((x) => x.id === genreSelect.value);
          if (!genre) return;
          genre.questionSets.push({
            id: Utils.generateId("qs"), name: nameInput.value.trim(),
            backgroundImage: bgField.getValue(), quests: [],
          });
        });
        Utils.showToast("道を追加しました", "success");
        navigate("settings");
      },
    }, "道を追加する"));
  }

  function renderNewCharacterTab(container, state) {
    if (typeof CharacterSystem === "undefined" || state.genres.length === 0) {
      container.appendChild(Utils.el("p", {}, "先にジャンルを追加してください")); return;
    }
    const RECRUIT_COST = 20;
    const nameInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "キャラクターの名前", maxlength: "20" });
    const genreSelect = Utils.el("select", { class: "review-typing-input" },
      state.genres.map((g) => Utils.el("option", { value: g.id }, g.title || g.name)));
    const imgField = buildImageUploadField("画像（任意。未設定なら絵文字🧑）", "character", "");
    container.appendChild(Utils.el("p", {}, `🧭${RECRUIT_COST}を消費して、新しいキャラクターをガチャの排出対象に追加します。`));
    container.appendChild(Utils.el("label", { class: "diary-field-label" }, "名前"));
    container.appendChild(nameInput);
    container.appendChild(Utils.el("label", { class: "diary-field-label" }, "対応ジャンル"));
    container.appendChild(genreSelect);
    container.appendChild(imgField.wrap);
    container.appendChild(Utils.el("button", {
      class: "btn btn-primary btn-block",
      onclick: () => {
        const currentState = GameState.getState();
        if (currentState.user.compass < RECRUIT_COST) {
          Utils.showToast(`コンパスが足りません（🧭${RECRUIT_COST}必要）`, "error"); return;
        }
        if (!nameInput.value.trim()) { Utils.showToast("名前を入力してください", "error"); return; }
        RewardSystem.grantCompass(-RECRUIT_COST);
        CharacterSystem.recruitAlly({ name: nameInput.value, genreId: genreSelect.value, image: imgField.getValue() || "🧑" });
        Utils.showToast("新しい仲間をガチャの排出対象に追加しました", "success");
        navigate("settings");
      },
    }, `🧭${RECRUIT_COST}で誘致する`));
  }

  /** 【追加要望対応】建築物版の「仲間の誘致」。入力内容・コスト(🧭20)はキャラクターと同じ。 */
  function renderNewBuildingTab(container, state) {
    if (typeof BuildingSystem === "undefined" || state.genres.length === 0) {
      container.appendChild(Utils.el("p", {}, "先にジャンルを追加してください")); return;
    }
    const COST = 20;
    const nameInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "建築物の名前", maxlength: "20" });
    const genreSelect = Utils.el("select", { class: "review-typing-input" },
      state.genres.map((g) => Utils.el("option", { value: g.id }, g.title || g.name)));
    const imgField = buildImageUploadField("画像（任意。未設定なら絵文字🏛）", "building", "");
    container.appendChild(Utils.el("p", {}, `🧭${COST}を消費して、新しい建築物を配置可能にします（次に「未知の霧」でクリア済みステージの空きマスへ配置する際、この見た目が使われます）。`));
    container.appendChild(Utils.el("label", { class: "diary-field-label" }, "名前"));
    container.appendChild(nameInput);
    container.appendChild(Utils.el("label", { class: "diary-field-label" }, "対応ジャンル"));
    container.appendChild(genreSelect);
    container.appendChild(imgField.wrap);
    container.appendChild(Utils.el("button", {
      class: "btn btn-primary btn-block",
      onclick: () => {
        const currentState = GameState.getState();
        if (currentState.user.compass < COST) {
          Utils.showToast(`コンパスが足りません（🧭${COST}必要）`, "error"); return;
        }
        if (!nameInput.value.trim()) { Utils.showToast("名前を入力してください", "error"); return; }
        RewardSystem.grantCompass(-COST);
        BuildingSystem.recruitBuildingType({ name: nameInput.value, genreId: genreSelect.value, image: imgField.getValue() });
        Utils.showToast("新しい建築物を配置可能になりました", "success");
        navigate("settings");
      },
    }, `🧭${COST}で登録する`));
  }

  function renderNewTitleTab(container, state) {
    if (typeof TitleSystem === "undefined") return;
    const nameInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "称号の名前（例：単語マスター）" });
    const typeSelect = Utils.el("select", { class: "review-typing-input" },
      Object.entries(TitleSystem.CUSTOM_CONDITION_TYPES).map(([key, def]) => Utils.el("option", { value: key }, def.label)));
    const genreSelect = Utils.el("select", { class: "review-typing-input" },
      state.genres.map((g) => Utils.el("option", { value: g.id }, g.title || g.name)));
    const thresholdInput = Utils.el("input", { type: "number", class: "review-typing-input", value: "5", min: "1" });

    container.appendChild(Utils.el("label", { class: "diary-field-label" }, "称号名"));
    container.appendChild(nameInput);
    container.appendChild(Utils.el("label", { class: "diary-field-label" }, "達成条件"));
    container.appendChild(typeSelect);
    container.appendChild(Utils.el("label", { class: "diary-field-label" }, "対象ジャンル（ジャンル指定の条件のみ使用）"));
    container.appendChild(genreSelect);
    container.appendChild(Utils.el("label", { class: "diary-field-label" }, "達成に必要な数"));
    container.appendChild(thresholdInput);
    container.appendChild(Utils.el("button", {
      class: "btn btn-primary btn-block",
      onclick: () => {
        if (!nameInput.value.trim()) { Utils.showToast("称号名を入力してください", "error"); return; }
        TitleSystem.addCustomDef({
          name: nameInput.value, conditionType: typeSelect.value,
          genreId: genreSelect.value, threshold: thresholdInput.value,
        });
        Utils.showToast("独自称号を追加しました", "success");
        navigate("settings");
      },
    }, "この条件で称号を追加する"));

    const customDefs = TitleSystem.getCustomDefs();
    if (customDefs.length > 0) {
      container.appendChild(Utils.el("h3", { style: "margin-top:16px;" }, "設定済みの独自称号"));
      customDefs.forEach((d) => {
        const typeDef = TitleSystem.CUSTOM_CONDITION_TYPES[d.conditionType];
        container.appendChild(Utils.el("div", { class: "settings-row" }, [
          Utils.el("span", {}, `${d.name}（${typeDef ? typeDef.label : d.conditionType} ≥ ${d.threshold}）`),
        ]));
      });
    }
    container.appendChild(Utils.el("button", {
      class: "btn btn-secondary btn-block",
      onclick: () => navigate("titles"),
    }, `獲得した称号を見る（${TitleSystem.getEarned().length}個）`));
  }

  /* --- 【追加要望対応】「認識改変」：既存のジャンル/問題セット/キャラクター/建築物/称号を編集 --- */
  function renderEditInfoGroup(state) {
    const tabs = [
      { key: "genre", label: "ジャンル", render: (c) => renderEditGenreTab(c, GameState.getState()) },
      { key: "questionSet", label: "道", render: (c) => renderEditQuestionSetTab(c, GameState.getState()) },
      { key: "character", label: "キャラクター", render: (c) => renderEditCharacterTab(c, GameState.getState()) },
      { key: "building", label: "建築物", render: (c) => renderEditBuildingTab(c, GameState.getState()) },
      { key: "title", label: "称号", render: (c) => renderEditTitleTab(c, GameState.getState()) },
    ];
    const group = settingsAccordion("認識改変", [
      Utils.el("p", { class: "explore-desc" }, "既に存在するジャンル・道・キャラクター・建築物・称号の内容を選んで変更します。"),
    ]);
    group.appendChild(buildTabPanel(tabs));
    return group;
  }

  function renderEditGenreTab(container, state) {
    if (state.genres.length === 0) { container.appendChild(Utils.el("p", {}, "ジャンルがありません")); return; }
    const select = Utils.el("select", { class: "review-typing-input" },
      state.genres.map((g) => Utils.el("option", { value: g.id }, g.title || g.name)));
    const formBox = Utils.el("div", { style: "margin-top:10px;" });
    function renderForm() {
      formBox.innerHTML = "";
      const g = GameState.getState().genres.find((x) => x.id === select.value);
      if (!g) return;
      const nameInput = Utils.el("input", { type: "text", class: "review-typing-input", value: g.name });
      const titleInput = Utils.el("input", { type: "text", class: "review-typing-input", value: g.title || "" });
      const bgField = buildImageUploadField("背景画像（差し替える場合のみ選択）", "genre-bg", g.backgroundImage || "");
      formBox.appendChild(Utils.el("label", { class: "diary-field-label" }, "ジャンル名"));
      formBox.appendChild(nameInput);
      formBox.appendChild(Utils.el("label", { class: "diary-field-label" }, "称号用の呼び方"));
      formBox.appendChild(titleInput);
      formBox.appendChild(bgField.wrap);
      formBox.appendChild(Utils.el("button", {
        class: "btn btn-primary btn-block",
        onclick: () => {
          if (!nameInput.value.trim()) { Utils.showToast("ジャンル名を入力してください", "error"); return; }
          GameState.update((s) => {
            const target = s.genres.find((x) => x.id === g.id);
            if (!target) return;
            target.name = nameInput.value.trim();
            target.title = titleInput.value.trim() || target.name;
            target.backgroundImage = bgField.getValue();
          });
          Utils.showToast("エリア情報を変更しました", "success");
          navigate("settings");
        },
      }, "この内容で保存する"));
    }
    select.addEventListener("change", renderForm);
    container.appendChild(Utils.el("label", { class: "diary-field-label" }, "対象エリア"));
    container.appendChild(select);
    container.appendChild(formBox);
    renderForm();
  }

  function renderEditQuestionSetTab(container, state) {
    if (state.genres.length === 0) { container.appendChild(Utils.el("p", {}, "ジャンルがありません")); return; }
    const genreSelect = Utils.el("select", { class: "review-typing-input" },
      state.genres.map((g) => Utils.el("option", { value: g.id }, g.title || g.name)));
    const formBox = Utils.el("div", { style: "margin-top:10px;" });
    function renderForm() {
      formBox.innerHTML = "";
      const g = GameState.getState().genres.find((x) => x.id === genreSelect.value);
      if (!g) return;
      const qsList = g.questionSets || [];
      if (qsList.length === 0) { formBox.appendChild(Utils.el("p", {}, "道がありません")); return; }
      const qsSelect = Utils.el("select", { class: "review-typing-input" },
        qsList.map((qs) => Utils.el("option", { value: qs.id }, qs.name)));
      const subForm = Utils.el("div", { style: "margin-top:10px;" });
      function renderSub() {
        subForm.innerHTML = "";
        const genreNow = GameState.getState().genres.find((x) => x.id === g.id);
        const qs = genreNow && genreNow.questionSets.find((x) => x.id === qsSelect.value);
        if (!qs) return;
        const nameInput = Utils.el("input", { type: "text", class: "review-typing-input", value: qs.name });
        const bgField = buildImageUploadField("背景画像（差し替える場合のみ選択）", "qs-bg", qs.backgroundImage || "");
        subForm.appendChild(Utils.el("label", { class: "diary-field-label" }, "道の名前"));
        subForm.appendChild(nameInput);
        subForm.appendChild(bgField.wrap);
        subForm.appendChild(Utils.el("div", { style: "display:flex; gap:8px; margin-top:8px;" }, [
          Utils.el("button", {
            class: "btn btn-primary",
            onclick: () => {
              if (!nameInput.value.trim()) { Utils.showToast("名前を入力してください", "error"); return; }
              GameState.update((s) => {
                const genre = s.genres.find((x) => x.id === g.id);
                const target = genre && genre.questionSets.find((x) => x.id === qs.id);
                if (!target) return;
                target.name = nameInput.value.trim();
                target.backgroundImage = bgField.getValue();
              });
              Utils.showToast("道を変更しました", "success");
              navigate("settings");
            },
          }, "保存"),
          Utils.el("button", {
            class: "btn btn-secondary",
            onclick: () => {
              if (!confirm(`「${qs.name}」を削除しますか？含まれるステージ・問題もすべて削除されます。`)) return;
              GameState.update((s) => {
                const genre = s.genres.find((x) => x.id === g.id);
                if (!genre) return;
                genre.questionSets = genre.questionSets.filter((x) => x.id !== qs.id);
              });
              Utils.showToast("道を削除しました", "success");
              navigate("settings");
            },
          }, "削除"),
        ]));
      }
      qsSelect.addEventListener("change", renderSub);
      formBox.appendChild(Utils.el("label", { class: "diary-field-label" }, "道"));
      formBox.appendChild(qsSelect);
      formBox.appendChild(subForm);
      renderSub();
    }
    genreSelect.addEventListener("change", renderForm);
    container.appendChild(Utils.el("label", { class: "diary-field-label" }, "対象エリア"));
    container.appendChild(genreSelect);
    container.appendChild(formBox);
    renderForm();
  }

  function renderEditCharacterTab(container, state) {
    if (typeof CharacterSystem === "undefined") return;
    CharacterSystem.ensureDefaultCharacterDefs();
    const defs = CharacterSystem.getDefs();
    if (defs.length === 0) { container.appendChild(Utils.el("p", {}, "キャラクターがまだいません")); return; }
    const select = Utils.el("select", { class: "review-typing-input" },
      defs.map((d) => Utils.el("option", { value: d.id }, d.name)));
    const formBox = Utils.el("div", { style: "margin-top:10px;" });
    function renderForm() {
      formBox.innerHTML = "";
      const d = CharacterSystem.getDefs().find((x) => x.id === select.value);
      if (!d) return;
      const nameInput = Utils.el("input", { type: "text", class: "review-typing-input", value: d.name });
      const nicknameInput = Utils.el("input", { type: "text", class: "review-typing-input", value: d.nickname || "", placeholder: "ニックネーム（任意）" });
      const imgField = buildImageUploadField("画像（差し替える場合のみ選択）", "character", d.image || "");
      formBox.appendChild(Utils.el("label", { class: "diary-field-label" }, "名前"));
      formBox.appendChild(nameInput);
      formBox.appendChild(Utils.el("label", { class: "diary-field-label" }, "ニックネーム"));
      formBox.appendChild(nicknameInput);
      formBox.appendChild(imgField.wrap);
      formBox.appendChild(Utils.el("button", {
        class: "btn btn-primary btn-block",
        onclick: () => {
          CharacterSystem.editCharacterDef(d.id, { name: nameInput.value, nickname: nicknameInput.value, image: imgField.getValue() });
          Utils.showToast("キャラクター情報を変更しました", "success");
          navigate("settings");
        },
      }, "この内容で保存する"));
    }
    select.addEventListener("change", renderForm);
    container.appendChild(Utils.el("label", { class: "diary-field-label" }, "対象キャラクター"));
    container.appendChild(select);
    container.appendChild(formBox);
    renderForm();
  }

  function renderEditBuildingTab(container, state) {
    if (typeof BuildingSystem === "undefined") return;
    const buildings = state.buildings || [];
    if (buildings.length === 0) { container.appendChild(Utils.el("p", {}, "まだ建築物がありません")); return; }
    const select = Utils.el("select", { class: "review-typing-input" },
      buildings.map((b) => {
        const genre = state.genres.find((g) => g.id === b.genreId);
        return Utils.el("option", { value: b.id }, BuildingSystem.defaultBuildingName(genre || {}, b));
      }));
    const formBox = Utils.el("div", { style: "margin-top:10px;" });
    function renderForm() {
      formBox.innerHTML = "";
      const b = GameState.getState().buildings.find((x) => x.id === select.value);
      if (!b) return;
      const genre = GameState.getState().genres.find((g) => g.id === b.genreId);
      const nameInput = Utils.el("input", { type: "text", class: "review-typing-input", value: b.name || "" });
      const imgField = buildImageUploadField("画像（差し替える場合のみ選択）", "building", b.image || "");
      formBox.appendChild(settingsRow("ジャンル", genre ? (genre.title || genre.name) : "—"));
      formBox.appendChild(settingsRow("建築レベル", `Lv${b.level}`));
      formBox.appendChild(Utils.el("label", { class: "diary-field-label" }, "名前"));
      formBox.appendChild(nameInput);
      formBox.appendChild(imgField.wrap);
      formBox.appendChild(Utils.el("button", {
        class: "btn btn-primary btn-block",
        onclick: () => {
          BuildingSystem.renameBuilding(b.id, nameInput.value);
          const img = imgField.getValue();
          if (img) BuildingSystem.setBuildingImage(b.id, img);
          Utils.showToast("建築物情報を変更しました", "success");
          navigate("settings");
        },
      }, "この内容で保存する"));
    }
    select.addEventListener("change", renderForm);
    container.appendChild(Utils.el("label", { class: "diary-field-label" }, "対象建築物"));
    container.appendChild(select);
    container.appendChild(formBox);
    renderForm();
  }

  function renderEditTitleTab(container, state) {
    if (typeof TitleSystem === "undefined") return;
    const defs = TitleSystem.getCustomDefs();
    if (defs.length === 0) {
      container.appendChild(Utils.el("p", {}, "独自称号がまだありません（「未開の情報」タブから追加できます）"));
      return;
    }
    const select = Utils.el("select", { class: "review-typing-input" },
      defs.map((d) => Utils.el("option", { value: d.id }, d.name)));
    const formBox = Utils.el("div", { style: "margin-top:10px;" });
    function renderForm() {
      formBox.innerHTML = "";
      const d = TitleSystem.getCustomDefs().find((x) => x.id === select.value);
      if (!d) return;
      const nameInput = Utils.el("input", { type: "text", class: "review-typing-input", value: d.name });
      const typeSelect = Utils.el("select", { class: "review-typing-input" },
        Object.entries(TitleSystem.CUSTOM_CONDITION_TYPES).map(([key, def]) => Utils.el("option", { value: key }, def.label)));
      typeSelect.value = d.conditionType;
      const genreSelect = Utils.el("select", { class: "review-typing-input" },
        GameState.getState().genres.map((g) => Utils.el("option", { value: g.id }, g.title || g.name)));
      if (d.genreId) genreSelect.value = d.genreId;
      const thresholdInput = Utils.el("input", { type: "number", class: "review-typing-input", value: String(d.threshold), min: "1" });
      formBox.appendChild(Utils.el("label", { class: "diary-field-label" }, "称号名"));
      formBox.appendChild(nameInput);
      formBox.appendChild(Utils.el("label", { class: "diary-field-label" }, "達成条件"));
      formBox.appendChild(typeSelect);
      formBox.appendChild(Utils.el("label", { class: "diary-field-label" }, "対象ジャンル（ジャンル指定の条件のみ使用）"));
      formBox.appendChild(genreSelect);
      formBox.appendChild(Utils.el("label", { class: "diary-field-label" }, "達成に必要な数"));
      formBox.appendChild(thresholdInput);
      formBox.appendChild(Utils.el("div", { style: "display:flex; gap:8px; margin-top:8px;" }, [
        Utils.el("button", {
          class: "btn btn-primary",
          onclick: () => {
            if (!nameInput.value.trim()) { Utils.showToast("称号名を入力してください", "error"); return; }
            TitleSystem.editCustomDef(d.id, {
              name: nameInput.value, conditionType: typeSelect.value,
              genreId: genreSelect.value, threshold: thresholdInput.value,
            });
            Utils.showToast("称号の条件を変更しました", "success");
            navigate("settings");
          },
        }, "保存"),
        Utils.el("button", {
          class: "btn btn-secondary",
          onclick: () => {
            TitleSystem.removeCustomDef(d.id);
            Utils.showToast("称号を削除しました", "success");
            navigate("settings");
          },
        }, "削除"),
      ]));
    }
    select.addEventListener("change", renderForm);
    container.appendChild(Utils.el("label", { class: "diary-field-label" }, "対象の独自称号"));
    container.appendChild(select);
    container.appendChild(formBox);
    renderForm();
  }


  /** 設定画面の各セクションをアコーディオン（<details>）として作る共通ヘルパー */
  function settingsAccordion(title, children, opts = {}) {
    const summary = Utils.el("summary", {}, title);
    const details = Utils.el("details", { class: "settings-accordion" }, [summary, ...children]);
    if (opts.open) details.setAttribute("open", "");
    return details;
  }

  function settingsRow(label, value) {
    return Utils.el("div", { class: "settings-row" }, [
      Utils.el("span", {}, label),
      Utils.el("span", { class: "value" }, value),
    ]);
  }

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.screen));
  });

  return { navigate, getCurrentScreen, registerScreen };
})();
