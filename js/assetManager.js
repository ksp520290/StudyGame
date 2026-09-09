/**
 * assetManager.js
 * -----------------------------------------
 * 【追加要望対応】設定画面の各種画像アップロード（ジャンル/問題セットの背景画像、
 * キャラクター/建築物の画像）を一元的に処理するモジュール。
 *
 * 方針（要望6章対応）：
 *   このアプリは外部バックエンドを持たない静的サイトなので、画像を「保存」する先は
 *   2通りある。
 *     ① GitHub連携が設定済み（設定画面でowner/repo/token等を入力済み）の場合：
 *        ブラウザから直接 GitHub Contents API を叩き、リポジトリの
 *        assets/img/ 配下に画像ファイルをPUTする（＝要望1章「自動でGitHubの
 *        assetsディレクトリ内のimgディレクトリに保存する仕組み」）。
 *        成功すればそのファイルの raw.githubusercontent.com URLを画像として使う。
 *     ② GitHub連携が未設定、またはアップロードに失敗した場合：
 *        画像をDataURL（Base64）に変換し、そのままgameStateに保存する。
 *        これはIndexedDB/LocalStorageへの自動保存、およびバックアップJSON出力
 *        （ImportExport.exportBackup）に自動的に含まれるため、GitHubに頼らず
 *        端末内・バックアップJSON経由でも画像を引き継げる（要望6章の
 *        「assetsフォルダ内のimg/videoフォルダを参照し、エリアとの紐づけを
 *        JSONファイル及びIndexedDBへのバックアップでつなげる」に対応）。
 *
 *   どちらの経路でも戻り値の image は文字列（URLまたはdataURL）であり、
 *   <img src="..."> にもSVGの <image href="..."> にもそのまま使える。
 *
 *   GitHub Personal Access Tokenは state.user.settings.github に保存され、
 *   ブラウザのIndexedDB/LocalStorageにのみ残る（Anthropic等の外部には送信されない。
 *   通信先は常にユーザー自身が指定したapi.github.comのみ）。
 */

const AssetManager = (() => {
  function getGithubConfig() {
    const state = GameState.getState();
    const settings = state.user && state.user.settings;
    return (settings && settings.github) || { owner: "", repo: "", branch: "main", token: "" };
  }

  function setGithubConfig({ owner, repo, branch, token }) {
    GameState.update((s) => {
      if (!s.user.settings) s.user.settings = {};
      s.user.settings.github = {
        owner: (owner || "").trim(),
        repo: (repo || "").trim(),
        branch: (branch || "").trim() || "main",
        token: (token || "").trim(),
      };
    });
  }

  function isGithubConfigured() {
    const c = getGithubConfig();
    return !!(c.owner && c.repo && c.token);
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("読み込みに失敗しました"));
      reader.readAsDataURL(file);
    });
  }

  function base64BodyOf(dataUrl) {
    const idx = dataUrl.indexOf(",");
    return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
  }

  function sanitizeFileName(name) {
    return String(name || "image.png").replace(/[^a-zA-Z0-9_.-]/g, "_");
  }

  /**
   * 画像ファイルをアップロードする。
   * @param {File} file
   * @param {string} folderHint 用途を表す短い文字列（ファイル名の接頭辞に使う。例："genre" "character"）
   * @returns {Promise<{image:string, usedGithub:boolean}>}
   */
  async function uploadImage(file, folderHint = "misc") {
    const dataUrl = await fileToDataURL(file);

    if (!isGithubConfigured()) {
      return { image: dataUrl, usedGithub: false };
    }

    const config = getGithubConfig();
    try {
      const filename = `${folderHint}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_${sanitizeFileName(file.name)}`;
      const path = `assets/img/${filename}`;
      const apiUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`;

      const res = await fetch(apiUrl, {
        method: "PUT",
        headers: {
          "Authorization": `token ${config.token}`,
          "Content-Type": "application/json",
          "Accept": "application/vnd.github+json",
        },
        body: JSON.stringify({
          message: `assets: add ${filename}`,
          content: base64BodyOf(dataUrl),
          branch: config.branch || "main",
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error("[assetManager] GitHubへの画像保存に失敗しました", res.status, errText);
        Utils.showToast("GitHubへの自動保存に失敗したため、ブラウザ内保存のみで続行します", "error");
        return { image: dataUrl, usedGithub: false };
      }

      const json = await res.json();
      const url = (json.content && json.content.download_url) || dataUrl;
      Utils.showToast("画像をGitHubのassets/imgに保存しました", "success");
      return { image: url, usedGithub: true, path };
    } catch (err) {
      console.error("[assetManager] GitHubアップロード中に例外が発生しました", err);
      Utils.showToast("GitHubへの自動保存に失敗したため、ブラウザ内保存のみで続行します", "error");
      return { image: dataUrl, usedGithub: false };
    }
  }

  /** 値が画像として表示可能な文字列か（dataURL or http URL）。絵文字プレースホルダーと区別するため */
  function isImageValue(value) {
    return typeof value === "string" && (value.startsWith("data:image") || /^https?:\/\//.test(value));
  }

  return {
    getGithubConfig, setGithubConfig, isGithubConfigured,
    uploadImage, fileToDataURL, isImageValue,
  };
})();
