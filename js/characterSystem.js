/**
 * characterSystem.js
 * -----------------------------------------
 * Phase7：キャラクターシステム（仕様26〜33章）。
 * ゲーム能力を持たない「愛着・所有感」専用のシステム。
 *
 * データの二層構造：
 *   - characterDefs（定義）：どんなキャラクターが存在しうるか（名前・ジャンル・セリフ等）。
 *     デフォルトで用意されるものと、仲間の誘致（recruitAlly）でユーザーが追加するものがある。
 *   - characters（所持）：ユーザーが実際にガチャで欠片を集めている／完成させた実体。
 *     1つのdefIdにつき所持レコードは最大1つ（重複して集め始めることはない）。
 *
 * 【仕様に明記が無く、このPhaseで判断した点（要レビュー。HANDOFF.md 4章にも記載）】
 *   - ジャンル追加時に対応する初期キャラクター定義が仕様上どう決まるか明記が無いため、
 *     ensureDefaultCharacterDefs() で「ジャンルごとに最低1体のデフォルトキャラクター定義」を
 *     自動生成する方式にした（ガチャの排出対象が0件で詰まないようにするための安全策）。
 *   - キャラクター画像（仕様26章のimage）は、画像アップロード機能（仕様64章の設定画面機能）が
 *     Phase6時点で未実装のため、絵文字を仮のプレースホルダーとして使用している。
 */

const CharacterSystem = (() => {
  const MAX_FRAGMENTS = 10;

  // 仕様28章：欠片数ごとの復元率（%）
  const RECOVERY_RATE_TABLE = {
    1: 20, 2: 30, 3: 40, 4: 50, 5: 60, 6: 70, 7: 80, 8: 90, 9: 95, 10: 100,
  };

  const DEFAULT_DIALOGUES = {
    onComplete: "やっと会えたね。これからもよろしく。",
    onTitleEarned: "その調子、頼もしいよ。",
    onBuildingLevelUp: "この場所、前よりずっと立派になったね。",
  };

  function getDefs() {
    return GameState.getState().characterDefs || [];
  }

  function getOwned() {
    return GameState.getState().characters || [];
  }

  function getDefsForGenre(genreId) {
    return getDefs().filter((d) => d.genreId === genreId);
  }

  function getOwnedByDefId(defId) {
    return getOwned().find((c) => c.defId === defId);
  }

  /** ジャンルに1体もキャラクター定義が無い場合、デフォルト定義を1体自動生成する（安全策） */
  function ensureDefaultCharacterDefs() {
    const state = GameState.getState();
    const missingGenres = state.genres.filter((g) => getDefsForGenre(g.id).length === 0);
    if (missingGenres.length === 0) return;

    GameState.update((s) => {
      missingGenres.forEach((genre) => {
        s.characterDefs.push({
          id: Utils.generateId("chardef"),
          name: `${genre.title || genre.name}の学び手`,
          nickname: "",
          genreId: genre.id,
          image: "🧑‍🎓",
          dialogues: { ...DEFAULT_DIALOGUES },
          source: "default",
        });
      });
    });
  }

  /**
   * ガチャの排出対象になりうる定義一覧（＝まだ完成していないもの）。
   * 仕様30章：「キャラクター完成後、同じキャラクターは排出されません」
   */
  function getAvailableDefsForGacha() {
    ensureDefaultCharacterDefs();
    const completedDefIds = new Set(getOwned().filter((c) => c.obtainedDate).map((c) => c.defId));
    return getDefs().filter((d) => !completedDefIds.has(d.id));
  }

  /**
   * 欠片を1つ加える。所持レコードが無ければ新規作成する。
   * @returns {{ character: object, justCompleted: boolean }}
   */
  function addFragment(defId) {
    let justCompleted = false;
    GameState.update((state) => {
      const def = state.characterDefs.find((d) => d.id === defId);
      if (!def) return;
      let owned = state.characters.find((c) => c.defId === defId);
      if (!owned) {
        owned = {
          id: Utils.generateId("char"),
          defId,
          genreId: def.genreId,
          name: def.name,
          nickname: def.nickname,
          image: def.image,
          fragmentCount: 0,
          recoveryRate: 0,
          obtainedDate: null,
          assignedBuildingId: null,
          contributionCount: 0,
          dialogues: def.dialogues,
        };
        state.characters.push(owned);
      }
      if (owned.fragmentCount >= MAX_FRAGMENTS) return; // 完成済みは加算しない（安全策）
      owned.fragmentCount = Math.min(MAX_FRAGMENTS, owned.fragmentCount + 1);
      owned.recoveryRate = RECOVERY_RATE_TABLE[owned.fragmentCount] || 0;
      if (owned.fragmentCount === MAX_FRAGMENTS && !owned.obtainedDate) {
        owned.obtainedDate = Utils.todayStr();
        justCompleted = true;
      }
    });
    const character = GameState.getState().characters.find((c) => c.defId === defId);
    return { character, justCompleted };
  }

  /** 仲間の誘致（仕様33章）：新しいキャラクター定義を追加する。コスト消費は呼び出し側の責務 */
  function recruitAlly({ name, genreId, image }) {
    const id = Utils.generateId("chardef");
    GameState.update((state) => {
      state.characterDefs.push({
        id,
        name: name.trim().slice(0, 20) || "名もなき仲間",
        nickname: "",
        genreId,
        image: image || "🧑",
        dialogues: { ...DEFAULT_DIALOGUES },
        source: "custom",
      });
    });
    return id;
  }

  /** 【追加要望対応】既存のキャラクター定義を編集する（認識改変画面用） */
  function editCharacterDef(defId, { name, nickname, image }) {
    GameState.update((state) => {
      const d = state.characterDefs.find((x) => x.id === defId);
      if (!d) return;
      if (name != null && name.trim()) d.name = name.trim().slice(0, 20);
      if (nickname != null) d.nickname = nickname.trim().slice(0, 20);
      if (image != null && image !== "") d.image = image;
      // 既に欠片を集め始めている所持レコードがあれば、表示情報も追従させる
      const owned = state.characters.find((c) => c.defId === defId);
      if (owned) {
        if (name != null && name.trim()) owned.name = d.name;
        if (nickname != null) owned.nickname = d.nickname;
        if (image != null && image !== "") owned.image = d.image;
      }
    });
  }

  /** 建築物へキャラクターを配置する。容量オーバーならfalseを返す */
  function assignToBuilding(characterId, buildingId, capacity) {
    const state = GameState.getState();
    const building = state.buildings.find((b) => b.id === buildingId);
    const character = state.characters.find((c) => c.id === characterId);
    if (!building || !character) return false;
    if (!character.obtainedDate) return false; // 未完成キャラクターは配置不可
    if (building.assignedCharacterIds.length >= capacity && !building.assignedCharacterIds.includes(characterId)) {
      return false;
    }

    GameState.update((s) => {
      // 他の建物に配置済みなら外す（1体は1箇所にしか配置できない）
      s.buildings.forEach((b) => {
        b.assignedCharacterIds = b.assignedCharacterIds.filter((cid) => cid !== characterId);
      });
      const b = s.buildings.find((x) => x.id === buildingId);
      if (!b.assignedCharacterIds.includes(characterId)) {
        b.assignedCharacterIds.push(characterId);
      }
      const c = s.characters.find((x) => x.id === characterId);
      c.assignedBuildingId = buildingId;
      c.contributionCount += 1;
    });
    return true;
  }

  function unassignFromBuilding(characterId) {
    GameState.update((s) => {
      s.buildings.forEach((b) => {
        b.assignedCharacterIds = b.assignedCharacterIds.filter((cid) => cid !== characterId);
      });
      const c = s.characters.find((x) => x.id === characterId);
      if (c) c.assignedBuildingId = null;
    });
  }

  function getDialogue(character, triggerKey) {
    return (character.dialogues && character.dialogues[triggerKey]) || DEFAULT_DIALOGUES[triggerKey] || "";
  }

  return {
    MAX_FRAGMENTS, RECOVERY_RATE_TABLE,
    getDefs, getOwned, getDefsForGenre, getOwnedByDefId,
    ensureDefaultCharacterDefs, getAvailableDefsForGacha, addFragment,
    recruitAlly, editCharacterDef, assignToBuilding, unassignFromBuilding, getDialogue,
  };
})();
