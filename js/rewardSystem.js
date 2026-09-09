/**
 * rewardSystem.js
 * -----------------------------------------
 * 仕様書セクション17-21・34-35・44 に基づく報酬計算ロジック。
 */

const RewardSystem = (() => {

  const BASE_FRAGMENT_PROB = {
    "1day": 1, "3day": 10, "1week": 30, "2week": 50, "1month": 75,
  };

  const QUEST_LEVEL_BASE_COMPASS = { lv1: 1, lv2: 2, lv3: 3 };
  const LOGIN_STREAK_BONUS_CAP = 10;
  const MISS_STREAK_BONUS_PER_MISS = 5;

  // 【補完】過去ステージ再挑戦（仕様44章）。
  // retryProbability = max(0, initialProbability - lifetimeRetryCount × 10)。
  // 「initialProbability」の定義が仕様に明記されていないため、復習を経ずに
  // 即座に挑戦できるショートカットである点を踏まえ、最も低い基本確率（1日後
  // 復習と同じ1%）を初期値として採用した（要レビュー。HANDOFF.md参照）。
  const RETRY_COST_COMPASS = 20;
  const RETRY_INITIAL_PROBABILITY = BASE_FRAGMENT_PROB["1day"];
  const RETRY_PENALTY_PER_COUNT = 10;

  function calcRetryProbability() {
    const state = GameState.getState();
    const count = state.lifetimeRetryCount || 0;
    return Utils.clamp(RETRY_INITIAL_PROBABILITY - count * RETRY_PENALTY_PER_COUNT, 0, 100);
  }

  /** 過去ステージ再挑戦を1回実行する。20🧭消費し、生涯累計再挑戦回数を+1する。 */
  function attemptStageRetry(genreId) {
    const state = GameState.getState();
    if (state.user.compass < RETRY_COST_COMPASS) {
      return { ok: false, reason: "compass_short" };
    }
    const probability = calcRetryProbability();
    grantCompass(-RETRY_COST_COMPASS);
    GameState.update((s) => {
      s.lifetimeRetryCount = (s.lifetimeRetryCount || 0) + 1;
    });
    const won = rollFragment(genreId, probability);
    return { ok: true, won, probability };
  }

  function calcCompassReward(level) {
    const state = GameState.getState();
    const base = QUEST_LEVEL_BASE_COMPASS[level] || 1;
    const streakBonus = Math.min(state.user.currentStreak, LOGIN_STREAK_BONUS_CAP);
    return base + streakBonus;
  }

  function grantCompass(amount) {
    GameState.update((state) => {
      state.user.compass = Math.max(0, state.user.compass + amount);
    });
  }

  function calcFragmentProbability(genreId, reviewStage, opts = {}) {
    const state = GameState.getState();
    const base = BASE_FRAGMENT_PROB[reviewStage] || 0;
    const skippedCarry = opts.skippedCarry || 0;
    const perfectBonus = opts.perfectBonus || 0;
    const missStreak = (state.missStreakByGenre[genreId] || 0);
    const missStreakBonus = missStreak * MISS_STREAK_BONUS_PER_MISS;

    const final = base + skippedCarry + perfectBonus + missStreakBonus;
    return Utils.clamp(final, 0, 100);
  }

  function rollFragment(genreId, probabilityPercent) {
    const won = Math.random() * 100 < probabilityPercent;

    GameState.update((state) => {
      if (won) {
        state.missStreakByGenre[genreId] = 0;
        if (!state.blueprints[genreId]) {
          state.blueprints[genreId] = { fragmentsCollected: 0, completedCount: 0 };
        }
        const bp = state.blueprints[genreId];
        bp.fragmentsCollected += 1;
        if (bp.fragmentsCollected >= 9) {
          bp.fragmentsCollected -= 9;
          bp.completedCount += 1;
        }
      } else {
        state.missStreakByGenre[genreId] = (state.missStreakByGenre[genreId] || 0) + 1;
      }
    });

    return won;
  }

  function getBlueprintProgress(genreId) {
    const state = GameState.getState();
    return state.blueprints[genreId] || { fragmentsCollected: 0, completedCount: 0 };
  }

  return {
    calcCompassReward, grantCompass, calcFragmentProbability, rollFragment,
    getBlueprintProgress, BASE_FRAGMENT_PROB,
    calcRetryProbability, attemptStageRetry, RETRY_COST_COMPASS,
  };
})();
