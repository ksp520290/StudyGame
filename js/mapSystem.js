/**
 * mapSystem.js
 * -----------------------------------------
 * Phase5：地図（未知の霧のグラフィカル表示）。
 * 【追加要望対応】エリア→問題セット→ステージの3階層それぞれに専用の画面を持たせた。
 *
 * 画面構成（仕様7〜9章・22〜23章に対応）：
 *   "fogStageSelect"   … エリア画面（1000×1000。ジャンルを正方形ブロックとして配置し、
 *                          タイトルと解放率を表示する。ステージ地図とは別の画面）
 *   "questionSetSelect" … 問題セット画面（選んだエリア内の問題セット一覧。旧エリア一覧と
 *                          同じカード形式で表示する）
 *   "areaMap"           … ステージ地図（1000×1000仮想座標。選んだ問題セット内のステージのみを
 *                          表示する。ズーム・パン・霧・図形。ステージの位置が分かるよう、
 *                          霧の不透明度に関わらず常に不透明度100%の輪郭線を描画する）
 *
 * 責務分担：
 *   - fogSystem.js … 霧の不透明度・進捗率を「計算」する
 *   - mapSystem.js … 座標の生成・永続化と、地図の「描画・操作」を行う
 *   - quizSystem.js … クエスト自体の出題・採点（ここからstartLevelを呼ぶだけ）
 *
 * 【Phase6での変更】
 *   建築物レイヤー（buildingSystem.js）を「土地 → 道 → 建築物 → ステージ図形＋霧」の順で
 *   実際に組み込んだ。建築物はエリア全体の霧オーバーレイ（DOM要素として最前面）の
 *   下に描画されるため、エリア進捗が低いほど視覚的に霧の奥へ沈んで見える
 *   （仕様48章：未解放エリアの建築物は見えないようにする、を近似的に満たす）。
 *
 * 【今回の変更で座標の永続化キーを変更した点（要レビュー）】
 *   これまで state.map[genreId] にジャンル単位でステージ座標を永続化していたが、
 *   ステージ地図を「問題セット単位」の画面に分割したため、state.map[questionSetId] に
 *   問題セット単位で座標を持たせる方式に変更した。旧キー（ジャンルID）で保存されていた
 *   既存データは新しい画面からは参照されなくなるが、削除はせず放置してある
 *   （次回アクセス時に問題セット単位で自動的に再生成されるため、実害はない）。
 */

const MapSystem = (() => {
  const VIRTUAL_SIZE = 1000;
  const MARGIN = 110;
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 3;

  let viewState = { scale: 1, x: 0, y: 0 };

  /* ============================================================
     座標生成・永続化
     ============================================================ */

  function getAllStagesInOrder(genre) {
    const stages = [];
    (genre.questionSets || []).forEach((qs) => {
      (qs.quests || []).forEach((stage) => stages.push(stage));
    });
    return stages;
  }

  /** stage.idから決定論的な小さなジッター値を作る（再読み込みしても同じ位置になるようにするため） */
  function hashJitter(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const dx = (h % 61) - 30; // -30〜+30
    const dy = ((Math.floor(h / 8) >>> 0) % 61) - 30;
    return { dx, dy };
  }

  /**
   * 問題セットの地図データ（ステージ座標）を取得する。
   * 無ければ蛇行（スネーク）レイアウトで自動生成し、GameStateに永続化する。
   * 既存ステージの座標は変更せず、新規追加分だけ埋める（Phase6以降で建物を
   * 座標に紐付けても壊れないようにするため）。
   */
  function ensureQuestionSetMap(questionSet) {
    const state = GameState.getState();
    const stages = questionSet.quests || [];
    const key = questionSet.id;
    const existing = state.map[key];
    const missing = stages.filter((s) => !existing || !existing.stagePositions[s.id]);

    if (!existing || missing.length > 0) {
      GameState.update((s) => {
        if (!s.map[key]) {
          s.map[key] = { virtualSize: VIRTUAL_SIZE, stagePositions: {} };
        }
        const positions = s.map[key].stagePositions;
        const perRow = Math.max(1, Math.ceil(Math.sqrt(stages.length)));
        const cellSize = (VIRTUAL_SIZE - MARGIN * 2) / Math.max(1, perRow - 1);

        stages.forEach((stage, i) => {
          if (positions[stage.id]) return; // 既存座標は変更しない
          const row = Math.floor(i / perRow);
          let col = i % perRow;
          if (row % 2 === 1) col = perRow - 1 - col; // 蛇行配置（道がつながって見えるように）
          const baseX = perRow === 1 ? VIRTUAL_SIZE / 2 : MARGIN + col * cellSize;
          const baseY = MARGIN + row * (cellSize || 160);
          const jitter = hashJitter(stage.id);
          positions[stage.id] = {
            x: Utils.clamp(baseX + jitter.dx, MARGIN / 2, VIRTUAL_SIZE - MARGIN / 2),
            y: Utils.clamp(baseY + jitter.dy, MARGIN / 2, VIRTUAL_SIZE - MARGIN / 2),
          };
        });
      });
    }
    return GameState.getState().map[key];
  }

  /* ============================================================
     画面①：エリア画面（"fogStageSelect"）
     1000×1000の仮想座標上に、ジャンル（エリア）を正方形ブロックとして配置し、
     タイトルと解放率を表示する。ステージ地図（画面③）とは別デザイン。
     ============================================================ */

  function renderAreaGridScreen(root) {
    const state = GameState.getState();
    const wrap = Utils.el("div", { class: "screen-inner map-screen-inner" });
    wrap.appendChild(Utils.el("div", { class: "map-header" }, [
      Utils.el("h2", {}, "未知の霧"),
    ]));
    wrap.appendChild(Utils.el("p", {}, "学ぶことで、まだ見ぬ土地の霧が晴れていきます。エリアを選んでください。"));

    if (state.genres.length === 0) {
      wrap.appendChild(Utils.el("p", { class: "empty-state" }, "ジャンルがありません。設定画面から追加してください。"));
      root.appendChild(wrap);
      return;
    }

    const mapContainer = Utils.el("div", { class: "area-map-container" });
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${VIRTUAL_SIZE} ${VIRTUAL_SIZE}`);
    svg.setAttribute("class", "map-svg");

    const bg = document.createElementNS(svgNS, "rect");
    bg.setAttribute("x", 0); bg.setAttribute("y", 0);
    bg.setAttribute("width", VIRTUAL_SIZE); bg.setAttribute("height", VIRTUAL_SIZE);
    bg.setAttribute("class", "map-land-bg");
    svg.appendChild(bg);

    const genres = state.genres;
    const cols = Math.max(1, Math.ceil(Math.sqrt(genres.length)));
    const rows = Math.max(1, Math.ceil(genres.length / cols));
    const cellW = VIRTUAL_SIZE / cols;
    const cellH = VIRTUAL_SIZE / rows;
    const squareSize = Math.min(cellW, cellH) * 0.62;

    genres.forEach((genre, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = cellW * col + cellW / 2;
      const cy = cellH * row + cellH / 2;
      const progress = FogSystem.areaProgressPercent(state, genre);

      const g = document.createElementNS(svgNS, "g");
      g.setAttribute("class", "map-area-group");
      g.setAttribute("transform", `translate(${cx}, ${cy})`);
      g.addEventListener("click", () => Router.navigate("questionSetSelect", { genreId: genre.id }));

      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", -squareSize / 2); rect.setAttribute("y", -squareSize / 2);
      rect.setAttribute("width", squareSize); rect.setAttribute("height", squareSize);
      rect.setAttribute("rx", 8);
      rect.setAttribute("class", "map-area-square");
      g.appendChild(rect);

      // 【追加要望対応】設定画面「未開の情報」でジャンルの背景画像が登録されていれば重ねて表示する
      if (typeof AssetManager !== "undefined" && AssetManager.isImageValue(genre.backgroundImage)) {
        const img = document.createElementNS(svgNS, "image");
        img.setAttribute("x", -squareSize / 2); img.setAttribute("y", -squareSize / 2);
        img.setAttribute("width", squareSize); img.setAttribute("height", squareSize);
        img.setAttribute("preserveAspectRatio", "xMidYMid slice");
        img.setAttribute("clip-path", "inset(0 round 8px)");
        img.setAttributeNS("http://www.w3.org/1999/xlink", "href", genre.backgroundImage);
        img.setAttribute("href", genre.backgroundImage);
        g.appendChild(img);
      }

      // 場所がひと目で分かるよう、常に不透明度100%の輪郭線を重ねる
      const outline = document.createElementNS(svgNS, "rect");
      outline.setAttribute("x", -squareSize / 2); outline.setAttribute("y", -squareSize / 2);
      outline.setAttribute("width", squareSize); outline.setAttribute("height", squareSize);
      outline.setAttribute("rx", 8);
      outline.setAttribute("class", "map-area-outline");
      g.appendChild(outline);

      const title = document.createElementNS(svgNS, "text");
      title.setAttribute("class", "map-area-title");
      title.setAttribute("text-anchor", "middle");
      title.setAttribute("dy", "-0.3em");
      title.textContent = genre.name;
      g.appendChild(title);

      const percentText = document.createElementNS(svgNS, "text");
      percentText.setAttribute("class", "map-area-percent");
      percentText.setAttribute("text-anchor", "middle");
      percentText.setAttribute("dy", "1.3em");
      percentText.textContent = `解放 ${progress}%`;
      g.appendChild(percentText);

      svg.appendChild(g);
    });

    mapContainer.appendChild(svg);
    mapContainer.appendChild(
      Utils.el("div", { class: "map-controls" }, [
        Utils.el("button", { class: "btn btn-secondary map-control-btn", onclick: () => zoomBy(1.25) }, "＋"),
        Utils.el("button", { class: "btn btn-secondary map-control-btn", onclick: () => zoomBy(1 / 1.25) }, "－"),
        Utils.el("button", { class: "btn btn-secondary map-control-btn", onclick: resetView }, "⟲"),
      ])
    );

    wrap.appendChild(mapContainer);
    root.appendChild(wrap);
    setupPanZoom(svg, mapContainer);
  }

  /* ============================================================
     画面②：問題セット画面（"questionSetSelect"）
     選んだエリア内の問題セットを、旧エリア一覧と同じカード形式で表示する。
     ============================================================ */

  function renderQuestionSetListScreen(root, params) {
    const state = GameState.getState();
    const genre = state.genres.find((g) => g.id === params.genreId);
    if (!genre) {
      root.appendChild(Utils.el("p", { class: "empty-state" }, "エリアが見つかりません"));
      return;
    }

    const wrap = Utils.el("div", { class: "screen-inner" });
    wrap.appendChild(Utils.el("div", { class: "map-header" }, [
      Utils.el("button", { class: "icon-btn", onclick: () => Router.navigate("fogStageSelect") }, "エリア選択"),
      Utils.el("h2", {}, genre.title || genre.name),
    ]));

    const questionSets = genre.questionSets || [];
    if (questionSets.length === 0) {
      wrap.appendChild(Utils.el("p", { class: "empty-state" }, "道がありません。設定画面から追加してください。"));
      root.appendChild(wrap);
      return;
    }

    questionSets.forEach((qs) => {
      const progress = FogSystem.questionSetProgressPercent(state, qs);
      const stageCount = (qs.quests || []).length;
      const hasBg = typeof AssetManager !== "undefined" && AssetManager.isImageValue(qs.backgroundImage);
      wrap.appendChild(
        Utils.el("button", {
          class: hasBg ? "area-list-card has-bg-image" : "area-list-card",
          style: hasBg ? `background-image:linear-gradient(rgba(0,0,0,0.15),rgba(0,0,0,0.35)),url('${qs.backgroundImage}')` : "",
          onclick: () => Router.navigate("areaMap", { genreId: genre.id, questionSetId: qs.id }),
        }, [
          Utils.el("div", { class: "area-list-title" }, qs.name),
          Utils.el("div", { class: "progress-track" }, [
            Utils.el("div", { class: "progress-fill", style: `width:${progress}%` }),
          ]),
          Utils.el("div", { class: "progress-meta" }, [
            Utils.el("span", {}, `解放 ${progress}%`),
            Utils.el("span", {}, `ステージ数 ${stageCount}`),
          ]),
        ])
      );
    });

    root.appendChild(wrap);
  }

  /* ============================================================
     画面③：ステージ地図（"areaMap"）。選んだ問題セット内のステージのみを表示する。
     ============================================================ */

  function renderAreaMapScreen(root, params) {
    const state = GameState.getState();
    const genre = state.genres.find((g) => g.id === params.genreId);
    if (!genre) {
      root.appendChild(Utils.el("p", { class: "empty-state" }, "エリアが見つかりません"));
      return;
    }
    const questionSet = (genre.questionSets || []).find((qs) => qs.id === params.questionSetId);
    if (!questionSet) {
      root.appendChild(Utils.el("p", { class: "empty-state" }, "道が見つかりません"));
      return;
    }

    const areaMap = ensureQuestionSetMap(questionSet);
    const stages = questionSet.quests || [];
    const areaProgress = FogSystem.questionSetProgressPercent(state, questionSet);
    const areaFogOpacity = FogSystem.areaFogOpacity(areaProgress);

    const wrap = Utils.el("div", { class: "screen-inner map-screen-inner" });
    wrap.appendChild(Utils.el("div", { class: "map-header" }, [
      Utils.el("button", { class: "icon-btn", onclick: () => Router.navigate("questionSetSelect", { genreId: genre.id }) }, "道の選択"),
      Utils.el("h2", {}, `${genre.title || genre.name} - ${questionSet.name}`),
    ]));

    const mapContainer = Utils.el("div", { class: "area-map-container" });
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${VIRTUAL_SIZE} ${VIRTUAL_SIZE}`);
    svg.setAttribute("class", "map-svg");

    // --- 土地（最下層） ---
    const bg = document.createElementNS(svgNS, "rect");
    bg.setAttribute("x", 0); bg.setAttribute("y", 0);
    bg.setAttribute("width", VIRTUAL_SIZE); bg.setAttribute("height", VIRTUAL_SIZE);
    bg.setAttribute("class", "map-land-bg");
    svg.appendChild(bg);

    // --- ステージをつなぐ道（土地の上・建築物の下） ---
    stages.forEach((stage, i) => {
      if (i === 0) return;
      const a = areaMap.stagePositions[stages[i - 1].id];
      const b = areaMap.stagePositions[stage.id];
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", a.x); line.setAttribute("y1", a.y);
      line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
      line.setAttribute("class", "map-path-line");
      svg.appendChild(line);
    });

    // --- 建築物（道の上・ステージ図形の下。Phase6） ---
    BuildingSystem.getBuildingsForGenre(genre.id).forEach((building) => {
      const stagePos = areaMap.stagePositions[building.hostStageId];
      if (!stagePos) return; // ステージデータが後で削除された場合の防御
      const pos = BuildingSystem.slotVirtualPosition(stagePos, building.slotIndex);

      const g = document.createElementNS(svgNS, "g");
      g.setAttribute("class", "map-building-group");
      g.setAttribute("transform", `translate(${pos.x}, ${pos.y})`);
      g.addEventListener("click", (e) => {
        e.stopPropagation();
        openBuildingPopup(genre, building);
      });

      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", -16); rect.setAttribute("y", -16);
      rect.setAttribute("width", 32); rect.setAttribute("height", 32);
      rect.setAttribute("rx", 4);
      rect.setAttribute("class", `map-building-shape map-building-lv${building.level}`);
      g.appendChild(rect);

      // 【追加要望対応】設定画面「未開の情報」で画像が登録されていればそれを表示し、
      // 無ければ従来どおり絵文字を表示する。
      if (typeof AssetManager !== "undefined" && AssetManager.isImageValue(building.image)) {
        const img = document.createElementNS(svgNS, "image");
        img.setAttribute("x", -15); img.setAttribute("y", -15);
        img.setAttribute("width", 30); img.setAttribute("height", 30);
        img.setAttribute("preserveAspectRatio", "xMidYMid slice");
        img.setAttributeNS("http://www.w3.org/1999/xlink", "href", building.image);
        img.setAttribute("href", building.image);
        g.appendChild(img);
      } else {
        const label = document.createElementNS(svgNS, "text");
        label.setAttribute("class", "map-building-label");
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("dy", "0.35em");
        label.textContent = "🏛";
        g.appendChild(label);
      }

      svg.appendChild(g);
    });

    // --- ステージ図形＋個別の霧 ---
    stages.forEach((stage, i) => {
      const pos = areaMap.stagePositions[stage.id];
      const progress = state.stageProgress[stage.id];
      const fogOpacity = FogSystem.stageFogOpacity(progress);
      const stageNumber = i + 1;
      const isFinal = i === stages.length - 1;
      const shapeType = isFinal ? "star"
        : stageNumber % 10 === 0 ? "square"
        : stageNumber % 5 === 0 ? "triangle"
        : "circle";

      const g = document.createElementNS(svgNS, "g");
      g.setAttribute("class", "map-stage-group");
      g.setAttribute("transform", `translate(${pos.x}, ${pos.y})`);
      g.addEventListener("click", () => openStagePopup(genre, stage, stageNumber));

      g.appendChild(makeStageShape(svgNS, shapeType, false));

      const label = document.createElementNS(svgNS, "text");
      label.setAttribute("class", "map-stage-label");
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("dy", "0.35em");
      label.textContent = String(stageNumber);
      g.appendChild(label);

      if (fogOpacity > 0) {
        const fog = makeStageShape(svgNS, shapeType, true);
        fog.style.opacity = fogOpacity;
        g.appendChild(fog);
      }

      // 【追加要望対応】ステージの位置がひと目で分かるよう、霧の不透明度に関わらず
      // 常に不透明度100%の輪郭線を最前面に描画する（塗りはなし＝線だけ）。
      const outline = makeStageShape(svgNS, shapeType, false);
      outline.setAttribute("class", "map-stage-outline");
      g.appendChild(outline);

      svg.appendChild(g);
    });

    mapContainer.appendChild(svg);

    // --- エリア全体の霧オーバーレイ（未解放なほど濃い。新奇性演出として
    //     奥の地形をうっすら透かすことで「何かありそう」という期待を作る） ---
    mapContainer.appendChild(
      Utils.el("div", { class: "area-fog-overlay", style: `opacity:${areaFogOpacity}` })
    );

    // --- ズーム操作補助ボタン（ホイール/ピンチが使えない場合の代替導線） ---
    mapContainer.appendChild(
      Utils.el("div", { class: "map-controls" }, [
        Utils.el("button", { class: "btn btn-secondary map-control-btn", onclick: () => zoomBy(1.25) }, "＋"),
        Utils.el("button", { class: "btn btn-secondary map-control-btn", onclick: () => zoomBy(1 / 1.25) }, "－"),
        Utils.el("button", { class: "btn btn-secondary map-control-btn", onclick: resetView }, "⟲"),
      ])
    );

    wrap.appendChild(mapContainer);
    root.appendChild(wrap);

    setupPanZoom(svg, mapContainer);
  }

  /** ○△□☆ の図形要素を作る（fog=trueなら霧レイヤー用のクラスを付与） */
  function makeStageShape(svgNS, type, fog) {
    const size = 34;
    let el;
    if (type === "circle") {
      el = document.createElementNS(svgNS, "circle");
      el.setAttribute("r", size / 2);
    } else if (type === "triangle") {
      el = document.createElementNS(svgNS, "polygon");
      const h = size * 0.9;
      el.setAttribute("points", `0,${(-h / 1.6).toFixed(1)} ${(h / 1.7).toFixed(1)},${(h / 2.4).toFixed(1)} ${(-h / 1.7).toFixed(1)},${(h / 2.4).toFixed(1)}`);
    } else if (type === "square") {
      el = document.createElementNS(svgNS, "rect");
      el.setAttribute("x", -size / 2); el.setAttribute("y", -size / 2);
      el.setAttribute("width", size); el.setAttribute("height", size);
    } else {
      el = document.createElementNS(svgNS, "polygon");
      el.setAttribute("points", starPoints(size / 1.6));
    }
    el.setAttribute("class", fog ? "map-stage-fog" : "map-stage-shape" + (type === "star" ? " map-stage-shape-final" : ""));
    return el;
  }

  function starPoints(r) {
    const points = [];
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 === 0 ? r : r / 2.3;
      const angle = (Math.PI / 5) * i - Math.PI / 2;
      points.push(`${(radius * Math.cos(angle)).toFixed(1)},${(radius * Math.sin(angle)).toFixed(1)}`);
    }
    return points.join(" ");
  }

  /* ============================================================
     ステージクリック時のレベル選択ポップアップ
     ============================================================ */

  function openStagePopup(genre, stage, stageNumber) {
    const state = GameState.getState();
    const progress = state.stageProgress[stage.id] || QuizSystem.emptyStageProgress();

    const existing = document.getElementById("map-stage-popup");
    if (existing) existing.remove();

    const overlay = Utils.el("div", { id: "map-stage-popup", class: "map-popup-overlay" });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    const panel = Utils.el("div", { class: "panel map-popup-panel" }, [
      Utils.el("h3", {}, `ステージ${stageNumber}：${stage.name}`),
    ]);

    const btnRow = Utils.el("div", { class: "stage-level-buttons" });
    ["lv1", "lv2", "lv3"].forEach((level) => {
      const cleared = progress.levels[level] === "cleared";
      const locked = QuizSystem.isLevelLocked(progress, level);
      btnRow.appendChild(
        Utils.el("button", {
          class: "btn btn-secondary" + (cleared ? " level-cleared" : ""),
          disabled: locked,
          onclick: () => {
            if (locked) return;
            overlay.remove();
            QuizSystem.startLevel(genre.id, stage.id, level);
          },
        }, QuizSystem.levelLabel(level) + (cleared ? " ✓" : ""))
      );
    });
    panel.appendChild(btnRow);

    // 【Phase6】霧が完全に晴れた（Lv1〜3すべてクリア済み）ステージには、
    // 完成済みだが未配置の建築物があれば「配置する」導線を出す（仕様23章）。
    if (BuildingSystem.isStageEligible(state, stage)) {
      const placeable = BuildingSystem.getPlaceableCount(genre.id);
      const freeSlots = BuildingSystem.getFreeSlots(stage.id);
      if (placeable > 0 && freeSlots.length > 0) {
        panel.appendChild(
          Utils.el("button", {
            class: "btn btn-moss btn-block",
            onclick: () => { overlay.remove(); openBuildingPlacementPopup(genre, stage, stageNumber); },
          }, `🏛 建物を配置する（残り${placeable}件）`)
        );
      }
    }

    panel.appendChild(Utils.el("button", { class: "btn btn-secondary btn-block", onclick: () => overlay.remove() }, "閉じる"));

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  /* ============================================================
     Phase6：建築物の配置・詳細ポップアップ
     ============================================================ */

  /** ステージの空きマスから配置先を選ぶポップアップ */
  function openBuildingPlacementPopup(genre, stage, stageNumber) {
    const existing = document.getElementById("map-stage-popup");
    if (existing) existing.remove();

    const overlay = Utils.el("div", { id: "map-stage-popup", class: "map-popup-overlay" });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    const panel = Utils.el("div", { class: "panel map-popup-panel" }, [
      Utils.el("h3", {}, `ステージ${stageNumber}：建物の配置先を選ぶ`),
      Utils.el("p", {}, "空いているマスを選んでください。建物同士は重なりません。"),
    ]);

    const grid = Utils.el("div", { class: "building-slot-grid" });
    const freeSlots = new Set(BuildingSystem.getFreeSlots(stage.id));
    for (let i = 0; i < BuildingSystem.SLOT_OFFSETS.length; i++) {
      const isFree = freeSlots.has(i);
      grid.appendChild(
        Utils.el("button", {
          class: "btn " + (isFree ? "btn-secondary" : "btn-secondary level-cleared"),
          disabled: !isFree,
          onclick: () => {
            if (!isFree) return;
            BuildingSystem.placeBuilding(genre.id, stage.id, i);
            overlay.remove();
            Utils.showToast("建物を配置しました", "success");
            const ctx = GameState.findStageContext(stage.id);
            Router.navigate("areaMap", { genreId: genre.id, questionSetId: ctx ? ctx.questionSet.id : undefined });
          },
        }, isFree ? "空きマス" : "使用中")
      );
    }
    panel.appendChild(grid);
    panel.appendChild(Utils.el("button", { class: "btn btn-secondary btn-block", onclick: () => overlay.remove() }, "閉じる"));

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  /** 建築物クリック時：名前変更・拡張（Lvアップ）を行うポップアップ */
  function openBuildingPopup(genre, building) {
    const existing = document.getElementById("map-stage-popup");
    if (existing) existing.remove();

    const overlay = Utils.el("div", { id: "map-stage-popup", class: "map-popup-overlay" });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    const state = GameState.getState();
    const tickets = state.buildingExpansionTickets || 0;
    const capacity = BuildingSystem.LEVEL_CAPACITY[building.level];

    const nameInput = Utils.el("input", {
      type: "text",
      class: "review-typing-input",
      value: BuildingSystem.defaultBuildingName(genre, building),
      maxlength: "20",
    });

    const panel = Utils.el("div", { class: "panel map-popup-panel" }, [
      Utils.el("h3", {}, "建築物"),
      nameInput,
      Utils.el("button", {
        class: "btn btn-secondary btn-block",
        onclick: () => {
          BuildingSystem.renameBuilding(building.id, nameInput.value);
          Utils.showToast("名前を変更しました", "success");
          overlay.remove();
          const ctx = GameState.findStageContext(building.hostStageId);
          Router.navigate("areaMap", { genreId: genre.id, questionSetId: ctx ? ctx.questionSet.id : undefined });
        },
      }, "名前を保存"),
      Utils.el("div", { class: "progress-meta building-popup-meta" }, [
        Utils.el("span", {}, `建築Lv ${building.level} / ${BuildingSystem.MAX_LEVEL}`),
        Utils.el("span", {}, `配置可能キャラクター数 ${capacity}`),
      ]),
      Utils.el("p", {}, `建築拡張権限：${tickets}個所持`),
    ]);

    const canExpand = tickets > 0 && building.level < BuildingSystem.MAX_LEVEL;
    panel.appendChild(
      Utils.el("button", {
        class: "btn btn-primary btn-block",
        disabled: !canExpand,
        onclick: () => {
          const ok = BuildingSystem.expandBuilding(building.id);
          if (ok) {
            Utils.showToast("建物を拡張しました！", "success");
            overlay.remove();
            const ctx = GameState.findStageContext(building.hostStageId);
            Router.navigate("areaMap", { genreId: genre.id, questionSetId: ctx ? ctx.questionSet.id : undefined });
          }
        },
      }, building.level >= BuildingSystem.MAX_LEVEL ? "最大Lvに到達済み" : "建築拡張権限を使って拡張する")
    );

    panel.appendChild(Utils.el("button", { class: "btn btn-secondary btn-block", onclick: () => overlay.remove() }, "閉じる"));

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  /* ============================================================
     ズーム・パン操作（PC：ドラッグ＋ホイール／スマホ：1本指ドラッグ＋2本指ピンチ）
     ============================================================ */

  function applyTransform(svg) {
    svg.style.transform = `translate(${viewState.x}px, ${viewState.y}px) scale(${viewState.scale})`;
  }

  function resetView() {
    viewState = { scale: 1, x: 0, y: 0 };
    const svg = document.querySelector(".map-svg");
    if (svg) applyTransform(svg);
  }

  function zoomBy(factor) {
    viewState.scale = Utils.clamp(viewState.scale * factor, MIN_SCALE, MAX_SCALE);
    const svg = document.querySelector(".map-svg");
    if (svg) applyTransform(svg);
  }

  function touchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function setupPanZoom(svg, container) {
    viewState = { scale: 1, x: 0, y: 0 };
    applyTransform(svg);

    let dragging = false;
    let lastX = 0, lastY = 0;
    let lastTouchDist = null;

    container.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      viewState.scale = Utils.clamp(viewState.scale * factor, MIN_SCALE, MAX_SCALE);
      applyTransform(svg);
    }, { passive: false });

    container.addEventListener("mousedown", (e) => {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      viewState.x += (e.clientX - lastX);
      viewState.y += (e.clientY - lastY);
      lastX = e.clientX; lastY = e.clientY;
      applyTransform(svg);
    });
    window.addEventListener("mouseup", () => { dragging = false; });

    container.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        dragging = true;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        dragging = false;
        lastTouchDist = touchDistance(e.touches);
      }
    }, { passive: true });

    container.addEventListener("touchmove", (e) => {
      if (e.touches.length === 1 && dragging) {
        const dx = e.touches[0].clientX - lastX;
        const dy = e.touches[0].clientY - lastY;
        viewState.x += dx; viewState.y += dy;
        lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
        applyTransform(svg);
      } else if (e.touches.length === 2) {
        const dist = touchDistance(e.touches);
        if (lastTouchDist) {
          const factor = dist / lastTouchDist;
          viewState.scale = Utils.clamp(viewState.scale * factor, MIN_SCALE, MAX_SCALE);
          applyTransform(svg);
        }
        lastTouchDist = dist;
      }
    }, { passive: true });

    container.addEventListener("touchend", (e) => {
      if (e.touches.length === 0) { dragging = false; lastTouchDist = null; }
    });
  }

  Router.registerScreen("fogStageSelect", renderAreaGridScreen);
  Router.registerScreen("questionSetSelect", renderQuestionSetListScreen);
  Router.registerScreen("areaMap", renderAreaMapScreen);

  return { ensureQuestionSetMap, getAllStagesInOrder };
})();
