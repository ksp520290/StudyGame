/**
 * tutorialSystem.js
 * -----------------------------------------
 * 【追加要望対応】遊び方チュートリアルモード。
 *
 * 待ち受け画面の「チュートリアル」ボタンを押した場合にのみ起動する（自動起動はしない）。
 * 仕様71章「長い説明文は禁止。実際に操作しながら理解させる」との整合を取るため、
 * 1画面1メッセージの短いスライド形式にし、要点のみを簡潔に伝える構成にしている。
 * ログイン前（待ち受け画面）から呼び出されるため、GameStateやRouterの初期化状態に
 * 依存しない、独立したオーバーレイ（document.bodyへ直接追加）として実装した。
 */

const TutorialSystem = (() => {
  const SLIDES = [
    {
      icon: "🌫️",
      title: "霧晴れの開拓譚へようこそ",
      body: "このゲームは、学びを続けるほど自分だけの世界が育っていく学習アプリです。まずは全体の流れを簡単に見てみましょう。",
    },
    {
      icon: "📖",
      title: "未知の霧（新規学習）",
      body: "問題を解くと、土地にかかった霧が少しずつ晴れていきます。新しいステージが見えるようになり、世界が広がっていきます。",
    },
    {
      icon: "🔁",
      title: "知の探究（復習）",
      body: "少し日を置いてから同じ内容を復習すると、記憶が定着しやすくなります。復習を終えるたびに「設計図の欠片」が手に入ることがあります。",
    },
    {
      icon: "🏛️",
      title: "建築・キャラクター",
      body: "集めた欠片で建物が完成したり、仲間のキャラクターが仲間になったりします。能力には影響しませんが、自分の世界への愛着が育っていきます。",
    },
    {
      icon: "🧭",
      title: "コンパスとガチャ",
      body: "クエストを終えると🧭コンパスがもらえます。コンパスを貯めてガチャを引くと、欠片や建築の手がかりが手に入ります。",
    },
    {
      icon: "🏠",
      title: "ホーム画面をチェック",
      body: "ホーム画面には「今日のおすすめ行動」が表示されます。迷ったら、まずはそれをやってみましょう。毎日少しずつで大丈夫です。",
    },
  ];

  function start() {
    let index = 0;
    const overlay = Utils.el("div", { class: "map-popup-overlay tutorial-overlay" });
    const panel = Utils.el("div", { class: "panel map-popup-panel tutorial-panel" });

    function close() {
      overlay.remove();
    }

    function render() {
      panel.innerHTML = "";
      const slide = SLIDES[index];

      panel.appendChild(Utils.el("div", { class: "tutorial-icon" }, slide.icon));
      panel.appendChild(Utils.el("h2", { class: "tutorial-title" }, slide.title));
      panel.appendChild(Utils.el("p", { class: "tutorial-body" }, slide.body));

      const dots = Utils.el("div", { class: "tutorial-dots" },
        SLIDES.map((_, i) => Utils.el("span", { class: "tutorial-dot" + (i === index ? " is-active" : "") })));
      panel.appendChild(dots);

      const isLast = index === SLIDES.length - 1;
      const navRow = Utils.el("div", { class: "quiz-choice-row" }, [
        Utils.el("button", {
          class: "btn btn-secondary",
          disabled: index === 0 ? "true" : null,
          style: index === 0 ? "visibility:hidden;" : "",
          onclick: () => { index = Math.max(0, index - 1); render(); },
        }, "← 戻る"),
        Utils.el("button", {
          class: "btn btn-primary",
          onclick: () => {
            if (isLast) { close(); return; }
            index = Math.min(SLIDES.length - 1, index + 1);
            render();
          },
        }, isLast ? "とじる" : "次へ →"),
      ]);
      panel.appendChild(navRow);

      if (!isLast) {
        panel.appendChild(Utils.el("button", {
          class: "btn btn-secondary btn-block tutorial-skip-btn",
          onclick: close,
        }, "スキップ"));
      }
    }

    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    render();
  }

  return { start };
})();
