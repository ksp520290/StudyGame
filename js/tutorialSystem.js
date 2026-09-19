/**
 * tutorialSystem.js
 * -----------------------------------------
 * 【追加要望対応】操作体験型チュートリアル。
 *
 * これまでのスライド形式（絵文字＋説明文のみを次々表示する形式）を、実際の画面・
 * 実際のボタンを使って操作しながら理解できる形式に変更した。
 *
 * 各ステップは次の流れで進む：
 *   1. 実際の画面上にある操作対象のボタン付近を光る枠でハイライトし、何をすれば
 *      よいかを説明する吹き出しを表示する。
 *   2. ユーザーが実際にその操作（画面遷移・ポップアップ表示・実際の解答など）を
 *      行うと、それを検知して自動的に次のステップへ進む。
 * ハイライトの枠は装飾のみ（pointer-events:none）で、実際のクリックは常に本来の
 * ボタン・画面にそのまま届く（チュートリアル用の透明なオーバーレイでクリックを
 * 奪うことはしない）。
 *
 * 起動元は2箇所：
 *   - 待ち受け（タイトル）画面の「チュートリアル」ボタン（未ログイン時）
 *   - 設定画面いちばん下の「チュートリアル」ボタン（ログイン後、いつでも再受講用）
 * 未ログイン状態から起動された場合は、実際の画面を使った説明にするため、
 * 「この端末の保存データで続ける」と同じ処理で先にログインしてから開始する。
 *
 * 【仕様に明記が無く、このセッションで判断した点（要レビュー。HANDOFF.md参照）】
 *   - 地図（fogStageSelect / areaMap）はSVGでパン・ズームできるため、内部の図形を
 *     ピクセル単位で正確にハイライトするのが難しい場面がある。その場合は
 *     getBoundingClientRect()が取得できた範囲だけハイライトし、取得できない場合は
 *     ハイライト無しの説明のみで進行する（進行自体は画面遷移の検知で行うため、
 *     ハイライトの有無に関わらず操作は成立する）。
 *   - ジャンルが1つも登録されていない状態でチュートリアルが開始された場合、
 *     地図をタップする体験ができないため、その旨を説明する案内文に切り替えて
 *     最終ステップへスキップする。
 */

const TutorialSystem = (() => {
  let active = false;
  let stepIndex = 0;
  let ringEl = null;
  let bubbleEl = null;
  let mutationObserver = null;
  let pollTimer = null;
  let resizeHandler = null;

  /**
   * ステップ定義。selector/textは値でも関数でも良い（stateに応じて出し分ける場合は関数を使う）。
   * isSatisfied()がtrueを返すと自動的に次のステップへ進む。manual:trueのステップは
   * 「次へ」ボタンで手動で進む（isSatisfiedを持たない＝ユーザー操作で自動検知できない
   * 説明だけのステップ）。
   */
  function stepDefs() {
    const state = (typeof GameState !== "undefined") ? GameState.getState() : null;
    const hasGenres = !!(state && state.genres && state.genres.length > 0);

    return [
      {
        selector: '.nav-btn[data-screen="explore"]',
        text: "ここが「探索」ボタンです。新しい学習や復習は、ここから始まります。実際に押してみましょう。",
        isSatisfied: () => Router.getCurrentScreen() === "explore",
      },
      {
        selector: ".explore-list .explore-btn",
        text: "「未知の霧」を押すと、新しい問題に挑戦して土地の霧を晴らせます。押してみましょう。",
        isSatisfied: () => Router.getCurrentScreen() === "fogStageSelect",
      },
      hasGenres ? {
        selector: ".map-area-group",
        text: "地図に浮かぶ土地（ジャンル）をタップして選んでみましょう。",
        isSatisfied: () => Router.getCurrentScreen() === "questionSetSelect",
      } : {
        text: "ジャンルがまだ登録されていないようです。設定画面の「ジャンル追加」から追加すると、" +
          "ここに土地が現れます。続きは、実際にジャンルを追加してから試してみてください。",
        manual: true,
      },
      {
        selector: ".area-list-card",
        text: "「道」を1つタップして選んでみましょう。",
        isSatisfied: () => Router.getCurrentScreen() === "areaMap",
      },
      {
        selector: ".map-stage-group",
        text: "地図上のステージの図形をタップしてみましょう。挑戦できるレベルが表示されます。",
        isSatisfied: () => !!document.getElementById("map-stage-popup"),
      },
      {
        selector: "#map-stage-popup .stage-level-buttons button:first-child",
        text: "「○ Lv1」を押すと、実際に問題が始まります。押してみましょう。",
        isSatisfied: () => Router.getCurrentScreen() === "quiz",
      },
      {
        selector: ".quiz-item",
        text: "実際に1問答えてみましょう。正解でも不正解でも大丈夫、間違えてもやり直せます。",
        isSatisfied: () => {
          const s = (typeof QuizSystem !== "undefined") ? QuizSystem.getSession() : null;
          return !!(s && s.userAnswers && s.userAnswers.length > 0);
        },
      },
      {
        text: "問題に答えるとその場で正誤が分かり、ステージをクリアするとコンパスや設計図の欠片が" +
          "もらえます。ここから先は自由に進めてOKです。困ったときは、設定画面いちばん下の" +
          "「チュートリアル」ボタンから、いつでもこのチュートリアルをやり直せます。",
        manual: true,
      },
    ];
  }

  function resolveVal(v) {
    return typeof v === "function" ? v() : v;
  }

  function cleanupDom() {
    if (ringEl) { ringEl.remove(); ringEl = null; }
    if (bubbleEl) { bubbleEl.remove(); bubbleEl = null; }
  }

  function stopWatchers() {
    if (mutationObserver) { mutationObserver.disconnect(); mutationObserver = null; }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (resizeHandler) {
      window.removeEventListener("resize", resizeHandler);
      window.removeEventListener("orientationchange", resizeHandler);
      resizeHandler = null;
    }
  }

  function finish() {
    active = false;
    stopWatchers();
    cleanupDom();
  }

  /** 現在のステップの対象要素にあわせて、ハイライトの枠を移動・表示/非表示する */
  function positionHighlight() {
    if (!active || !ringEl) return;
    const steps = stepDefs();
    const step = steps[stepIndex];
    const selector = step ? resolveVal(step.selector) : null;
    const target = selector ? document.querySelector(selector) : null;
    if (!target) {
      ringEl.style.opacity = "0";
      return;
    }
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      ringEl.style.opacity = "0";
      return;
    }
    const pad = 6;
    ringEl.style.opacity = "1";
    ringEl.style.left = `${Math.max(0, rect.left - pad)}px`;
    ringEl.style.top = `${Math.max(0, rect.top - pad)}px`;
    ringEl.style.width = `${rect.width + pad * 2}px`;
    ringEl.style.height = `${rect.height + pad * 2}px`;
  }

  /** 現在のステップの完了条件を満たしていれば、次のステップへ進める */
  function checkAdvance() {
    if (!active) return;
    const steps = stepDefs();
    const step = steps[stepIndex];
    if (!step || step.manual || !step.isSatisfied) return;
    let done = false;
    try { done = !!step.isSatisfied(); } catch (err) { done = false; }
    if (done) goToStep(stepIndex + 1);
  }

  function goToStep(index) {
    const steps = stepDefs();
    if (index >= steps.length) { finish(); return; }
    stepIndex = index;
    render();
  }

  function render() {
    const steps = stepDefs();
    const step = steps[stepIndex];
    if (!step) { finish(); return; }

    if (!ringEl) {
      ringEl = Utils.el("div", { class: "tutorial-highlight-ring" });
      document.body.appendChild(ringEl);
    }
    if (!bubbleEl) {
      bubbleEl = Utils.el("div", { class: "tutorial-bubble" });
      document.body.appendChild(bubbleEl);
    }

    bubbleEl.innerHTML = "";
    bubbleEl.appendChild(Utils.el("div", { class: "tutorial-step-count" }, `ステップ ${stepIndex + 1} / ${steps.length}`));
    bubbleEl.appendChild(Utils.el("div", { class: "tutorial-bubble-text" }, resolveVal(step.text)));

    const isLast = stepIndex === steps.length - 1;
    const actions = Utils.el("div", { class: "tutorial-bubble-actions" });
    if (isLast) {
      actions.appendChild(Utils.el("button", { class: "btn btn-moss btn-block", onclick: finish }, "とじる"));
    } else if (step.manual) {
      actions.appendChild(Utils.el("button", { class: "btn btn-secondary", onclick: finish }, "スキップ"));
      actions.appendChild(Utils.el("button", { class: "btn btn-moss", onclick: () => goToStep(stepIndex + 1) }, "次へ"));
    } else {
      actions.appendChild(Utils.el("button", { class: "btn btn-secondary btn-block", onclick: finish }, "スキップ"));
    }
    bubbleEl.appendChild(actions);

    positionHighlight();
  }

  function attachWatchers() {
    stopWatchers();
    // 画面はinnerHTMLの総入れ替えで再描画されるため、DOMの変化を監視して
    // ハイライト位置の再計算・完了条件の再判定を行う。ポーリングも併用し、
    // クラス付与のみの変化などMutationObserverで拾いきれないケースに備える。
    mutationObserver = new MutationObserver(() => {
      checkAdvance();
      positionHighlight();
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    pollTimer = setInterval(() => { checkAdvance(); positionHighlight(); }, 500);
    resizeHandler = () => positionHighlight();
    window.addEventListener("resize", resizeHandler);
    window.addEventListener("orientationchange", resizeHandler);
  }

  async function start() {
    if (active) return;
    active = true;
    stepIndex = 0;

    try {
      if (typeof Router !== "undefined" && Router.getCurrentScreen() === "title") {
        // 実際の画面・実際のボタンを使ったチュートリアルにするため、未ログイン時は
        // 「この端末の保存データで続ける」と同じ手順で先にログインしてから開始する。
        await GameState.init();
        if (typeof App !== "undefined" && App.playCutscene) await App.playCutscene("open", "扉が開く…");
        Router.navigate("home");
      } else if (typeof Router !== "undefined" && Router.getCurrentScreen() !== "home") {
        Router.navigate("home");
      }
    } catch (err) {
      console.error("[tutorialSystem] ログイン処理に失敗しました", err);
    }

    render();
    attachWatchers();
  }

  return { start };
})();
