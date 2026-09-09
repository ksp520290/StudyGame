/**
 * gachaSystem.js
 * -----------------------------------------
 * Phase7：ガチャシステム（仕様36〜43章）。完全な娯楽要素であり、ゲーム進行そのものには
 * 影響しない（当たり外れの結果は「キャラクター欠片」または「建築拡張権限」のみ）。
 *
 * 確率式（仕様39〜43章）：
 *   x = state.gacha.loginCountThisMonth（月内ログイン回数。Phase1から記録済み）
 *   優先順位：
 *     ① 1週間以上ぶりの復帰日（state.gacha.wasReturningLogin） → 中確率
 *     ② x が 1〜3                                        → 高確率
 *     ③ x が 4〜11                                        → 中確率
 *     ④ x が 12以上                                       → 基本確率
 *   高確率 y = min(95, 50 + 45*((x-1)/30)^2)
 *   中確率 y = min(95, 25 + 70*((x-1)/30)^2)
 *   基本確率 y = min(95, 5 + 90*((x-1)/30)^2)
 *
 * 【仕様に明記が無く、このPhaseで判断した点（要レビュー。HANDOFF.md 4章にも記載）】
 *   仕様61章では「前日分の日記記録でガチャ画面が解放される」とあるが、日記システムは
 *   Phase8で実装予定のため、Phase7時点ではまだ日記によるゲートが存在しない。
 *   そのため本Phaseでは、ホーム画面から直接「gacha」画面へ遷移できる仮の導線
 *   （home-headerに🎰ボタンを追加）を用意した。Phase8で日記システムを実装する際は、
 *   この導線を「前日分の日記が未記録なら開拓日誌画面へ誘導し、記録済みなら直接
 *   ガチャ画面へ」という仕様どおりの分岐に置き換えることを推奨する。
 */

const GachaSystem = (() => {
  const GACHA_COST = 20;
  const MISS_REFUND = 10;

  function calcHitProbability() {
    const state = GameState.getState();
    const x = Math.max(1, state.gacha.loginCountThisMonth || 1);
    const t = (x - 1) / 30;

    if (state.gacha.wasReturningLogin) {
      return Math.min(95, 25 + 70 * t * t); // ①復帰日：中確率
    }
    if (x <= 3) {
      return Math.min(95, 50 + 45 * t * t); // ②高確率
    }
    if (x <= 11) {
      return Math.min(95, 25 + 70 * t * t); // ③中確率
    }
    return Math.min(95, 5 + 90 * t * t); // ④基本確率
  }

  /**
   * ガチャを1回引く。呼び出し前にコンパス残高チェックはここで行う。
   * @returns {{ ok:boolean, reason?:string, hit?:boolean, rewardType?:string,
   *             character?:object, justCompleted?:boolean, probability?:number }}
   */
  function pull() {
    const state = GameState.getState();
    if (state.user.compass < GACHA_COST) {
      return { ok: false, reason: "コンパスが足りません（20🧭必要）" };
    }

    const probability = calcHitProbability();
    RewardSystem.grantCompass(-GACHA_COST);

    const hit = Math.random() * 100 < probability;
    if (!hit) {
      RewardSystem.grantCompass(MISS_REFUND);
      return { ok: true, hit: false, probability };
    }

    const rewardType = Math.random() < 0.5 ? "fragment" : "expansionTicket";
    if (rewardType === "expansionTicket") {
      GameState.update((s) => { s.buildingExpansionTickets = (s.buildingExpansionTickets || 0) + 1; });
      return { ok: true, hit: true, probability, rewardType };
    }

    const candidates = CharacterSystem.getAvailableDefsForGacha();
    if (candidates.length === 0) {
      // 排出できるキャラクターが1体も残っていない場合は建築拡張権限で代替する（安全策）
      GameState.update((s) => { s.buildingExpansionTickets = (s.buildingExpansionTickets || 0) + 1; });
      return { ok: true, hit: true, probability, rewardType: "expansionTicket", fallback: true };
    }
    const chosenDef = Utils.shuffle(candidates)[0];
    const { character, justCompleted } = CharacterSystem.addFragment(chosenDef.id);
    return { ok: true, hit: true, probability, rewardType: "fragment", character, justCompleted };
  }

  /* ============================================================
     画面："gacha"
     ============================================================ */

  function renderGachaScreen(root) {
    const state = GameState.getState();
    const wrap = Utils.el("div", { class: "screen-inner gacha-screen" });
    wrap.appendChild(Utils.el("h2", {}, "ガチャ"));
    wrap.appendChild(Utils.el("p", {}, "学びの合間の、ちょっとした楽しみ。ゲームの進行そのものには影響しません。"));

    const panel = Utils.el("div", { class: "panel" }, [
      Utils.el("div", { class: "gacha-cost-row" }, [
        Utils.el("span", {}, "所持コンパス"),
        Utils.el("span", { class: "value" }, `🧭 ${state.user.compass}`),
      ]),
      Utils.el("div", { class: "gacha-cost-row" }, [
        Utils.el("span", {}, "1回のコスト"),
        Utils.el("span", { class: "value" }, `🧭 ${GACHA_COST}`),
      ]),
    ]);

    const resultBox = Utils.el("div", { class: "gacha-result-box" });

    panel.appendChild(
      Utils.el("button", {
        class: "btn btn-primary btn-block",
        onclick: () => runGachaPull(resultBox, panel),
      }, "ガチャを引く")
    );
    panel.appendChild(resultBox);
    wrap.appendChild(panel);

    wrap.appendChild(
      Utils.el("button", {
        class: "btn btn-secondary btn-block",
        onclick: () => Router.navigate("characters"),
      }, "🎴 手持ちのキャラクターを見る")
    );

    root.appendChild(wrap);
  }

  function runGachaPull(resultBox, panel) {
    App.playCutscene("assets/video/gacha.mp4", "運命の一枚……").then(() => {
      const result = pull();
      resultBox.innerHTML = "";
      if (!result.ok) {
        Utils.showToast(result.reason, "error");
        return;
      }
      if (!result.hit) {
        resultBox.appendChild(Utils.el("div", { class: "gacha-result-line gacha-miss" },
          `探索したが、何も見つからなかった……コンパス${MISS_REFUND}個を回収した（確率${result.probability.toFixed(1)}%）`));
      } else if (result.rewardType === "expansionTicket") {
        resultBox.appendChild(Utils.el("div", { class: "gacha-result-line gacha-hit pop-in" },
          "🔧 建築拡張権限を手に入れた！"));
      } else if (result.rewardType === "fragment") {
        const c = result.character;
        resultBox.appendChild(Utils.el("div", { class: "gacha-result-line gacha-hit pop-in" },
          `🧩 ${c.name} の欠片を手に入れた！（${c.fragmentCount} / ${CharacterSystem.MAX_FRAGMENTS}）`));
        if (result.justCompleted) {
          showCharacterCompleteOverlay(c);
          // 【Phase9】キャラクター完成は復習カテゴリの称号条件にも影響しうるため判定する。
          if (typeof TitleSystem !== "undefined") TitleSystem.checkAndAward({ trigger: "characterComplete" });
        }
      }
      // コンパス残高表示を更新
      const state = GameState.getState();
      panel.querySelector(".value").textContent = `🧭 ${state.user.compass}`;
    });
  }

  /** キャラクター完成時の全画面演出（仕様29章） */
  function showCharacterCompleteOverlay(character) {
    const overlay = Utils.el("div", { class: "character-complete-overlay pulse-once" });
    overlay.appendChild(Utils.iconOrImage(character.image, "character-complete-image"));
    overlay.appendChild(Utils.el("h2", {}, `${character.name} が仲間になった！`));
    overlay.appendChild(Utils.el("p", { class: "character-complete-dialogue" },
      `「${CharacterSystem.getDialogue(character, "onComplete")}」`));
    overlay.appendChild(Utils.el("button", {
      class: "btn btn-moss btn-block",
      onclick: () => overlay.remove(),
    }, "閉じる"));
    document.body.appendChild(overlay);
  }

  /* ============================================================
     画面："characters"（所持キャラクター一覧・建物への配置）
     ============================================================ */

  function renderCharactersScreen(root) {
    const state = GameState.getState();
    CharacterSystem.ensureDefaultCharacterDefs();
    const owned = CharacterSystem.getOwned();

    const wrap = Utils.el("div", { class: "screen-inner" });
    wrap.appendChild(Utils.el("h2", {}, "手持ちのキャラクター"));

    if (owned.length === 0) {
      wrap.appendChild(Utils.el("p", { class: "empty-state" }, "まだキャラクターがいません。ガチャで欠片を探しに行きましょう。"));
    }

    owned.forEach((c) => {
      const completed = !!c.obtainedDate;
      const card = Utils.el("div", { class: "panel character-card" }, [
        Utils.el("div", { class: "character-card-header" }, [
          Utils.iconOrImage(c.image, "character-card-image"),
          Utils.el("div", {}, [
            Utils.el("h3", {}, c.name),
            Utils.el("div", { class: "progress-meta" }, [
              Utils.el("span", {}, completed ? "完成済み" : `欠片 ${c.fragmentCount} / ${CharacterSystem.MAX_FRAGMENTS}`),
              Utils.el("span", {}, completed ? "" : `復元率 ${c.recoveryRate}%`),
            ]),
          ]),
        ]),
      ]);
      if (!completed) {
        card.appendChild(Utils.el("div", { class: "progress-track" }, [
          Utils.el("div", { class: "progress-fill", style: `width:${c.recoveryRate}%` }),
        ]));
      } else {
        card.appendChild(
          Utils.el("button", {
            class: "btn btn-secondary btn-block",
            onclick: () => openAssignBuildingPopup(c),
          }, c.assignedBuildingId ? "配置先を変更する" : "建物に配置する")
        );
      }
      wrap.appendChild(card);
    });

    root.appendChild(wrap);
  }

  function openAssignBuildingPopup(character) {
    const state = GameState.getState();
    const existing = document.getElementById("map-stage-popup");
    if (existing) existing.remove();

    const overlay = Utils.el("div", { id: "map-stage-popup", class: "map-popup-overlay" });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    const genre = state.genres.find((g) => g.id === character.genreId) || { name: "不明なジャンル" };
    const buildings = state.buildings.filter((b) => b.genreId === character.genreId);
    const panel = Utils.el("div", { class: "panel map-popup-panel" }, [
      Utils.el("h3", {}, `${character.name} の配置先`),
    ]);

    if (buildings.length === 0) {
      panel.appendChild(Utils.el("p", { class: "empty-state" }, "このジャンルにはまだ建築物がありません。"));
    } else {
      buildings.forEach((b) => {
        const capacity = BuildingSystem.LEVEL_CAPACITY[b.level];
        const isFull = b.assignedCharacterIds.length >= capacity && !b.assignedCharacterIds.includes(character.id);
        panel.appendChild(
          Utils.el("button", {
            class: "btn btn-secondary btn-block",
            disabled: isFull,
            onclick: () => {
              const ok = CharacterSystem.assignToBuilding(character.id, b.id, capacity);
              if (ok) {
                Utils.showToast("配置しました", "success");
                overlay.remove();
                Router.navigate("characters");
              }
            },
          }, `${BuildingSystem.defaultBuildingName(genre, b)}（${b.assignedCharacterIds.length}/${capacity}）${isFull ? "満員" : ""}`)
        );
      });
    }

    panel.appendChild(Utils.el("button", { class: "btn btn-secondary btn-block", onclick: () => overlay.remove() }, "閉じる"));
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  Router.registerScreen("gacha", renderGachaScreen);
  Router.registerScreen("characters", renderCharactersScreen);

  return { calcHitProbability, pull, GACHA_COST, MISS_REFUND };
})();
