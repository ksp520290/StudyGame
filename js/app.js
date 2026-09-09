/**
 * app.js
 * -----------------------------------------
 * アプリのエントリーポイント。
 */

const App = (() => {

  function boot() {
    Router.navigate("title");
  }

  function playCutscene(src, fallbackText) {
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
