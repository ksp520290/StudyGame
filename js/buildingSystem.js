/**
 * buildingSystem.js
 * -----------------------------------------
 * Phase6：建築システム（仕様17〜25章）。
 *
 * 責務：
 *   - 設計図9分割→建築物「完成」の判定自体はPhase4のrewardSystem.rollFragment()が
 *     既に行っている（state.blueprints[genreId].completedCountが増える）。
 *     このファイルは「完成した建築物を実際に地図へ配置する」以降（配置・改名・拡張）を担当する。
 *   - 建築物は「霧が完全に晴れたステージ上のマス」にのみ配置可能（仕様23章）。
 *
 * 【仕様に明記が無く、このPhaseで判断した点（要レビュー。HANDOFF.md 4章にも記載）】
 *   1ステージにつき、ステージ図形を中心とした周囲3x3グリッドから中心を除いた
 *   8マスを配置枠として扱う。この「1ステージ=8マス」という数値は仕様書に定義が
 *   無いため、Phase6独自の実装判断である。将来的に仕様が明確になった場合は
 *   SLOT_OFFSETSのみ変更すれば良いよう、他コードから独立させてある。
 *
 * 【建築拡張権限について】
 *   仕様25章：「建築拡張権限はガチャ報酬などで獲得」。Phase7（ガチャ）が未実装の
 *   現時点では state.buildingExpansionTickets を増やす手段が無いため、
 *   動作確認時はブラウザコンソールから以下を実行してテストしてください。
 *     GameState.update(s => { s.buildingExpansionTickets = (s.buildingExpansionTickets||0) + 1; })
 */

const BuildingSystem = (() => {
  const MAX_LEVEL = 5;
  const LEVEL_CAPACITY = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 }; // 仕様25章：Lvごとの配置可能キャラクター数

  // ステージ中心（ステージ図形そのもの）を除いた周囲8マスの相対オフセット（仮想座標）
  const SLOT_OFFSETS = [
    { dx: -48, dy: -48 }, { dx: 0, dy: -48 }, { dx: 48, dy: -48 },
    { dx: -48, dy: 0 },                       { dx: 48, dy: 0 },
    { dx: -48, dy: 48 },  { dx: 0, dy: 48 },  { dx: 48, dy: 48 },
  ];

  function getBuildings() {
    return GameState.getState().buildings || [];
  }

  function getBuildingsForGenre(genreId) {
    return getBuildings().filter((b) => b.genreId === genreId);
  }

  function getBuildingById(buildingId) {
    return getBuildings().find((b) => b.id === buildingId);
  }

  // ============================================================
  // 【追加要望対応】建築物の「定義」（buildingDefs）
  // 仲間の誘致（characterSystem.recruitAlly）と同じ発想で、設定画面の
  // 「未開の情報」からユーザーが直接、建築物のみため見た目（名前・画像）を
  // 🧭20を払って登録できるようにしたもの。登録すると、そのジャンルの
  // 「配置可能な建築物」が1つ増える（既存の設計図9枚完成の流れと同じ枠に合流する）。
  // ============================================================

  function getBuildingDefs() {
    return GameState.getState().buildingDefs || [];
  }

  function getBuildingDefsForGenre(genreId) {
    return getBuildingDefs().filter((d) => d.genreId === genreId);
  }

  /** そのジャンルでまだどの配置建築物にも使われていない定義（＝次に配置されるときの見た目候補） */
  function getUnusedBuildingDefForGenre(genreId) {
    const usedDefIds = new Set(getBuildings().filter((b) => b.defId).map((b) => b.defId));
    return getBuildingDefsForGenre(genreId).find((d) => !usedDefIds.has(d.id)) || null;
  }

  /**
   * 建築物の定義を新規登録する（コスト消費は呼び出し側の責務。仕様33章の仲間の誘致と同じ扱い）。
   * 登録と同時に、そのジャンルの設計図完成数を1つ増やし、即座に配置可能にする
   * （通常の「設計図9枚を集めて完成」とは別ルートで、配置対象を1つ用意する形）。
   */
  function recruitBuildingType({ name, genreId, image }) {
    const id = Utils.generateId("buildingdef");
    GameState.update((state) => {
      state.buildingDefs.push({
        id,
        name: (name || "").trim().slice(0, 20) || "名もなき建物",
        genreId,
        image: image || "",
        source: "custom",
      });
      if (!state.blueprints[genreId]) {
        state.blueprints[genreId] = { fragmentsCollected: 0, completedCount: 0 };
      }
      state.blueprints[genreId].completedCount += 1;
    });
    return id;
  }

  function editBuildingDef(defId, { name, image }) {
    GameState.update((state) => {
      const d = state.buildingDefs.find((x) => x.id === defId);
      if (!d) return;
      if (name != null && name.trim()) d.name = name.trim().slice(0, 20);
      if (image != null && image !== "") d.image = image;
      // 既にこの定義で配置済みの建築物があれば、見た目も追従させる
      state.buildings.forEach((b) => {
        if (b.defId === defId) {
          if (name != null && name.trim() && !b.name) b.name = d.name;
          if (image != null && image !== "") b.image = d.image;
        }
      });
    });
  }

  /** 配置済みの建築物の画像を直接差し替える（認識改変画面用） */
  function setBuildingImage(buildingId, image) {
    GameState.update((state) => {
      const b = state.buildings.find((x) => x.id === buildingId);
      if (b && image) b.image = image;
    });
  }

  /** そのジャンルで「設計図は完成済みだがまだ地図に配置していない」建築物の数 */
  function getPlaceableCount(genreId) {
    const state = GameState.getState();
    const bp = state.blueprints[genreId] || { completedCount: 0 };
    const placedCount = getBuildingsForGenre(genreId).length;
    return Math.max(0, bp.completedCount - placedCount);
  }

  /** ステージが建築物配置の対象か（=霧が完全に晴れている＝Lv1〜3すべてクリア） */
  function isStageEligible(state, stage) {
    const progress = state.stageProgress[stage.id];
    return FogSystem.stageFogOpacity(progress) === 0;
  }

  /** 指定ステージの8マスのうち、まだ建築物が置かれていないマスのインデックス一覧 */
  function getFreeSlots(stageId) {
    const used = new Set(getBuildings().filter((b) => b.hostStageId === stageId).map((b) => b.slotIndex));
    const free = [];
    for (let i = 0; i < SLOT_OFFSETS.length; i++) {
      if (!used.has(i)) free.push(i);
    }
    return free;
  }

  function getBuildingAtSlot(stageId, slotIndex) {
    return getBuildings().find((b) => b.hostStageId === stageId && b.slotIndex === slotIndex);
  }

  /** ステージの仮想座標＋スロットのオフセットから、建築物の仮想座標を求める（地図座標系と共通） */
  function slotVirtualPosition(stagePos, slotIndex) {
    const off = SLOT_OFFSETS[slotIndex];
    return { x: stagePos.x + off.dx, y: stagePos.y + off.dy };
  }

  /**
   * 建築物を配置する。
   * 呼び出し前に getPlaceableCount(genreId) > 0 かつ getFreeSlots(stageId) に
   * 空きがあることを確認すること（UI側でボタンの活性制御を行う）。
   */
  function placeBuilding(genreId, stageId, slotIndex) {
    const id = Utils.generateId("building");
    // 【追加要望対応】「未開の情報」から登録した建築物の定義が未使用のまま残っていれば、
    // その名前・画像をこの配置に引き継ぐ（無ければ従来どおり無名・絵文字表示）。
    const def = getUnusedBuildingDefForGenre(genreId);
    GameState.update((state) => {
      state.buildings.push({
        id,
        genreId,
        hostStageId: stageId,
        slotIndex,
        level: 1,
        name: def ? def.name : "", // 空文字＝未設定。表示時はdefaultBuildingName()でジャンル名から仮の名前を作る
        image: def ? def.image : "",
        defId: def ? def.id : null,
        assignedCharacterIds: [], // Phase7以降で使用
        completedAt: Utils.todayStr(),
      });
    });
    return id;
  }

  /** 名前変更（仕様24章）。空にすると「未設定」扱いに戻せる */
  function renameBuilding(buildingId, newName) {
    GameState.update((state) => {
      const b = state.buildings.find((x) => x.id === buildingId);
      if (b) b.name = newName.trim().slice(0, 20);
    });
  }

  /** 建築拡張権限を1消費してLvアップする（仕様25章）。成功したらtrueを返す */
  function expandBuilding(buildingId) {
    const state = GameState.getState();
    const tickets = state.buildingExpansionTickets || 0;
    const building = state.buildings.find((b) => b.id === buildingId);
    if (!building || tickets <= 0 || building.level >= MAX_LEVEL) return false;

    GameState.update((s) => {
      s.buildingExpansionTickets -= 1;
      const b = s.buildings.find((x) => x.id === buildingId);
      b.level = Math.min(MAX_LEVEL, b.level + 1);
    });
    return true;
  }

  function defaultBuildingName(genre, building) {
    return building.name || `${genre.title || genre.name}の建物`;
  }

  return {
    MAX_LEVEL, LEVEL_CAPACITY, SLOT_OFFSETS,
    getBuildingsForGenre, getBuildingById, getPlaceableCount, isStageEligible,
    getFreeSlots, getBuildingAtSlot, slotVirtualPosition,
    placeBuilding, renameBuilding, expandBuilding, defaultBuildingName,
    getBuildingDefs, getBuildingDefsForGenre, getUnusedBuildingDefForGenre,
    recruitBuildingType, editBuildingDef, setBuildingImage,
  };
})();
