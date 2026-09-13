/**
 * fogSystem.js
 * -----------------------------------------
 * Phase5：霧の不透明度計算のみを担当する純粋関数モジュール。
 * 「霧をどう描画するか」はmapSystem.jsが担当し、このファイルは
 * 「霧が何%であるべきか」の計算だけに専念する（責務分離）。
 *
 * 仕様書46〜47章：
 *   - エリア霧：fogOpacity = 100 - areaProgress（%）
 *   - ステージ霧：未開始70% / Lv1クリア50% / Lv2クリア30% / Lv3クリア0%
 */

const FogSystem = (() => {

  // 仕様47章のステージ霧不透明度（0〜3レベルクリア数がインデックス）
  const STAGE_FOG_BY_LEVELS_CLEARED = [0.7, 0.5, 0.3, 0];

  // 【追加要望対応】ステージ霧を単色塗りつぶしではなく画像（assets/img/配下）で表示する。
  // denceFog.png(未開始) → lightFog.png(Lv1クリア) → fogYellow.png(Lv2クリア) → 画像なし(Lv3クリア＝霧完全に晴れ)。
  // 不透明度は指定通りクリア段階によらず一律30%とする（null＝霧なし）。
  const STAGE_FOG_IMAGE_BY_LEVELS_CLEARED = ["denceFog.png", "lightFog.png", "fogYellow.png", null];
  const STAGE_FOG_IMAGE_OPACITY = 0.3;

  /** stageProgressから「クリア済みレベル数（0〜3）」を数える */
  function countClearedLevels(progress) {
    if (!progress) return 0;
    return ["lv1", "lv2", "lv3"].filter((lv) => progress.levels[lv] === "cleared").length;
  }

  /** ステージ単位の霧の不透明度（0〜1）を返す */
  function stageFogOpacity(progress) {
    const cleared = countClearedLevels(progress);
    return STAGE_FOG_BY_LEVELS_CLEARED[cleared];
  }

  /** ステージ単位の霧画像ファイル名（assets/img/配下）を返す。霧なし（Lv3クリア済み）ならnull。 */
  function stageFogImage(progress) {
    const cleared = countClearedLevels(progress);
    return STAGE_FOG_IMAGE_BY_LEVELS_CLEARED[cleared];
  }

  /** 「ステージ配列×3レベル」のうち、クリア済みレベルの割合（0〜100）を返す共通計算 */
  function stagesProgressPercent(state, stages) {
    let total = 0;
    let cleared = 0;
    (stages || []).forEach((stage) => {
      total += 3;
      const p = state.stageProgress[stage.id];
      if (p) cleared += countClearedLevels(p);
    });
    return total === 0 ? 0 : Math.round((cleared / total) * 100);
  }

  /**
   * エリア（ジャンル）全体の進捗率（0〜100）を返す。
   * 「全ステージ×3レベルのうち、クリア済みレベルの割合」で計算する。
   */
  function areaProgressPercent(state, genre) {
    const stages = [];
    (genre.questionSets || []).forEach((qs) => {
      (qs.quests || []).forEach((stage) => stages.push(stage));
    });
    return stagesProgressPercent(state, stages);
  }

  /** 問題セット単位の進捗率（0〜100）。仕様9章：問題セット画面用。 */
  function questionSetProgressPercent(state, questionSet) {
    return stagesProgressPercent(state, (questionSet && questionSet.quests) || []);
  }

  /** エリア全体の霧の不透明度（0〜1）。仕様46章：fogOpacity = 100 - areaProgress */
  function areaFogOpacity(areaProgressPercentValue) {
    return Utils.clamp((100 - areaProgressPercentValue) / 100, 0, 1);
  }

  return {
    stageFogOpacity, stageFogImage, STAGE_FOG_IMAGE_OPACITY,
    areaProgressPercent, questionSetProgressPercent,
    areaFogOpacity, countClearedLevels,
  };
})();
