/**
 * bgmSystem.js
 * -----------------------------------------
 * 【追加要望対応】画面ごとにBGMを流す。
 *   ホーム画面 → home.mp3
 *   探索画面 → explore.mp3
 *   設定画面 → settings.mp3
 *   ステージ画面（地図上のステージ選択）と、問題を解いている間（新規学習・復習）は
 *   一貫して stage.mp3
 *
 * 音声ファイルは assets/audio/ 配下に置く想定（home.mp3 / explore.mp3 / settings.mp3 /
 * stage.mp3）。ファイルが存在しない場合は再生エラーを静かに無視し、アプリの動作は止めない
 * （動画演出のフォールバック方針と同様）。
 *
 * 明示的に対応が指定されていない画面（日記・読書記録・ガチャ・称号など）では、
 * 直前まで流れていたBGMをそのまま流し続ける（毎回止めたり切り替えたりすると
 * かえって煩わしいため）。待受画面（title）だけは明示的に無音にする。
 */

const BgmSystem = (() => {
  const SCREEN_TRACK = {
    home: "home",
    explore: "explore",
    settings: "settings",
    areaMap: "stage",
    quiz: "stage",
    reviewPlay: "stage",
    starReviewPlay: "stage",
  };
  const SILENT_SCREENS = new Set(["title"]);

  let audioEl = null;
  let currentTrack = null;

  function ensureAudioEl() {
    if (audioEl) return audioEl;
    audioEl = document.createElement("audio");
    audioEl.loop = true;
    audioEl.volume = 0.5;
    audioEl.style.display = "none";
    document.body.appendChild(audioEl);
    return audioEl;
  }

  // 【追加要望対応】ファイルサイズの都合でmp3の代わりにm4a（同名・別拡張子）として
  // 置かれている場合があるため、mp3が読み込めなければ自動的にm4aへフォールバックする。
  const TRACK_EXTENSIONS = ["mp3", "m4a"];

  function playTrack(trackName) {
    if (currentTrack === trackName) return; // 同じ曲がすでに流れている場合は何もしない
    const el = ensureAudioEl();
    currentTrack = trackName;
    let extIndex = 0;

    const attemptPlay = () => {
      el.src = `assets/audio/${trackName}.${TRACK_EXTENSIONS[extIndex]}`;
      const playPromise = el.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          // ブラウザの自動再生制限でブロックされた場合、次のユーザー操作（タップ/クリック）で再試行する。
          // ファイル自体が存在しない場合もここに来るが、アプリの動作には影響させない。
          const retry = () => {
            el.play().catch(() => {});
            document.removeEventListener("click", retry);
          };
          document.addEventListener("click", retry, { once: true });
        });
      }
    };

    el.onerror = () => {
      extIndex += 1;
      if (extIndex < TRACK_EXTENSIONS.length && currentTrack === trackName) attemptPlay();
    };

    attemptPlay();
  }

  function stop() {
    if (audioEl) audioEl.pause();
    currentTrack = null;
  }

  /** router.jsのnavigate()から画面名を渡して呼ぶ */
  function onScreenChange(screenName) {
    const track = SCREEN_TRACK[screenName];
    if (track) { playTrack(track); return; }
    if (SILENT_SCREENS.has(screenName)) { stop(); return; }
    // それ以外の画面は現在のBGMを維持する（何もしない）
  }

  return { onScreenChange };
})();
