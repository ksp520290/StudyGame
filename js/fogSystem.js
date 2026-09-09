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
    stageFogOpacity, areaProgressPercent, questionSetProgressPercent,
    areaFogOpacity, countClearedLevels,
  };
})();
