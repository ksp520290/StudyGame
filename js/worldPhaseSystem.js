/**
 * worldPhaseSystem.js
 * -----------------------------------------
 * Phase10：熱狂段階／習慣・愛着段階の判定（仕様53〜54章）。
 *
 * 仕様53章の5条件のうち2つ以上を満たすと熱狂段階が終了し、習慣・愛着段階に入る。
 * 5条件はすべて「一度満たしたら二度と後戻りしない」性質の値（累計ログイン日数、
 * 解放済みステージ数、クリア済み問題セット、設計図完成数、キャラクター完成数）
 * だけで構成されているため、都度計算するだけで十分であり、専用の永続フラグは
 * 持たせていない（GameStateへの構造追加が不要という利点もある）。
 *
 * 仕様54章：ゲームシステム自体は変えず、ホーム画面の「表示の重点」だけを変える。
 * router.jsのrenderHomeScreen()はこのモジュールのisHabitPhase()を参照して
 * パネルの並び・強調内容を出し分ける。
 *
 * 【仕様に明記が無く判断した点】
 *   条件②「複数問題セットをまたいでエリア内10ステージ以上解放」の「解放」は、
 *   フォグが完全に晴れていなくとも当該ステージに一度でも着手していれば
 *   （state.stageProgressに記録があれば）「解放」とみなした。理由：フォグ自体は
 *   Lv1着手だけで70%→50%に変化する仕様48章の設計と整合させ、「まだ何もしていない
 *   状態」とだけを区別できれば十分と判断したため。
 */

const WorldPhaseSystem = (() => {

  function countStagesTouchedAcrossMultipleSets(genre, state) {
    let touched = 0;
    let setsWithProgress = 0;
    (genre.questionSets || []).forEach((qs) => {
      let anyInSet = false;
      (qs.quests || []).forEach((stage) => {
        if (state.stageProgress[stage.id]) { touched += 1; anyInSet = true; }
      });
      if (anyInSet) setsWithProgress += 1;
    });
    return { touched, setsWithProgress };
  }

  function hasFullyClearedQuestionSet(genre, state) {
    return (genre.questionSets || []).some((qs) => {
      if (!qs.quests || qs.quests.length === 0) return false;
      return qs.quests.every((stage) => {
        const p = state.stageProgress[stage.id];
        return p && p.result !== "none";
      });
    });
  }

  /** 仕様53章の5条件を個別に評価する（設定画面等での可視化にも使えるよう公開） */
  function evaluateConditions() {
    const state = GameState.getState();

    const cond1 = state.user.loginDates.length >= 7;

    let cond2 = false;
    state.genres.forEach((genre) => {
      const { touched, setsWithProgress } = countStagesTouchedAcrossMultipleSets(genre, state);
      if (touched >= 10 && setsWithProgress >= 2) cond2 = true;
    });

    const cond3 = state.genres.some((genre) => hasFullyClearedQuestionSet(genre, state));

    const cond4 = Object.values(state.blueprints || {}).some((bp) => (bp.completedCount || 0) >= 1);

    const cond5 = (state.characters || []).some((c) => c.obtainedDate);

    return [cond1, cond2, cond3, cond4, cond5];
  }

  function isHabitPhase() {
    const met = evaluateConditions().filter(Boolean).length;
    return met >= 2;
  }

  return { evaluateConditions, isHabitPhase };
})();
