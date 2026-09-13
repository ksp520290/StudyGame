/**
 * app.js
 * -----------------------------------------
 * アプリのエントリーポイント。
 */

const App = (() => {

  /**
   * 【追加要望対応】ログインは1日1回でよく、日付が変わるまでは次回以降アプリを開いても
   * タイトル画面（ログイン操作）を省略してそのままホーム画面へ進む。
   * 「今日ログイン済みか」はGameState.hasLoggedInToday()でstate本体を書き換えずに確認し、
   * 済んでいればGameState.init()（保存データの読み込み。ログイン日記録は日付が同じなので
   * 何も変化しない）だけ行ってホームへ、そうでなければ従来通りタイトル画面へ進む。
   * 毎回の再訪問で扉の演出（open.mp4）を見せると煩わしいため、この自動続行では省略する。
   */
  async function boot() {
    let alreadyLoggedInToday = false;
    try {
      alreadyLoggedInToday = await GameState.hasLoggedInToday();
    } catch (err) {
      console.error("[app] 本日のログイン状態確認に失敗しました", err);
    }

    if (alreadyLoggedInToday) {
      await GameState.init();
      Router.navigate("home");
    } else {
      Router.navigate("title");
    }
  }

  /**
   * 【追加要望対応】縦長（ポートレート）画面では "_mobile" 付きの動画（例：open_mobile.mp4）、
   * 横長（ランドスケープ）画面では通常の動画（例：open.mp4）を再生する。
   * 判定は再生開始時の1回のみ行い、以後 resize イベントなどでは切り替えない
   * （再生中に画面の向きが変わっても、流れている映像はそのまま最後まで再生する）。
   */
  function isPortrait() {
    return window.innerHeight >= window.innerWidth;
  }

  function resolveCutsceneSrc(baseName) {
    const suffix = isPortrait() ? "_mobile" : "";
    return `assets/video/${baseName}${suffix}.mp4`;
  }

  /**
   * @param {string} baseName "open" | "gacha" など、assets/video/配下の動画のベース名
   *   （拡張子・向き接尾辞なし。実ファイル名は resolveCutsceneSrc() が決定する）
   * @param {string} fallbackText 動画が無い/再生失敗時のフォールバック表示文言
   */
  function playCutscene(baseName, fallbackText) {
    const src = resolveCutsceneSrc(baseName);
    return new Promise((resolve) => {
      const overlay = document.getElementById("video-overlay");
      const video = document.getElementById("cutscene-video");
      const fallback = document.getElementById("cutscene-fallback");

      overlay.classList.remove("hidden");
      fallback.classList.add("hidden");
      video.classList.remove("hidden");

      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        overlay.classList.add("hidden");
        video.pause();
        video.removeAttribute("src");
        video.load();
        resolve();
      };

      const showFallback = () => {
        video.classList.add("hidden");
        fallback.classList.remove("hidden");
        fallback.textContent = fallbackText || "……";
        setTimeout(finish, 1200);
      };

      overlay.onclick = finish;
      video.onerror = showFallback;
      video.onended = finish;

      try {
        video.src = src;
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => showFallback());
        }
        setTimeout(() => {
          if (!resolved && video.readyState === 0) showFallback();
        }, 1500);
      } catch (err) {
        showFallback();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", boot);

  return { playCutscene };
})();
