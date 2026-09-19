/**
 * characterVoiceSystem.js
 * -----------------------------------------
 * 【追加要望対応】問題画面下部にキャラクターを表示し、1問正解するごとに声かけ
 * （セリフ）を表示する機能。セリフ本体はすべてdata/serihu.jsonの事前登録データから
 * 読み込む（仕様32章「事前登録されたセリフを使用。AI生成は使用しない」に準拠）。
 *
 * 【仕様に明記が無く、このセッションで判断した点（要レビュー。HANDOFF.md参照）】
 *   - serihu.jsonのキーは「ジャンル名」を基本とするが、表記ゆれ（画像ファイル名・
 *     英語表記など）を吸収できるよう ALIASES で対応表を持たせている。
 *   - 該当するジャンルのセリフが見つからない場合は、汎用セリフ（"default"キー）に
 *     フォールバックする。serihu.jsonの取得自体に失敗した場合も、アプリの動作を
 *     止めないよう組み込みの汎用セリフを使う。
 */

const CharacterVoiceSystem = (() => {
  let dialogueData = null; // { "ジャンル名": ["せりふ1","せりふ2","せりふ3"], ..., "default": [...] }
  let loadPromise = null;

  const FALLBACK_LINES = [
    "正解！その調子で続けていこう。",
    "いいね、着実に力がついてきているよ。",
    "よくできました。次の問題も一緒に頑張ろう。",
  ];

  // ジャンル名の表記ゆれ（画像ファイル名・英語表記など）を吸収するための対応表。
  // 左側がserihu.json内のキー、右側がそのジャンルを指しうる別表記。
  const ALIASES = {
    "英語": ["english"],
    "倫理": ["ethical", "ethics"],
    "情報": ["information", "it"],
    "哲学": ["phirosophy", "philosophy"],
    "読書": ["readingbook", "reading", "国語"],
    "世界史": ["worldhistory", "world history"],
    "数学": ["math", "mathematics"],
    "プログラミング": ["program", "programming"],
  };

  /** data/serihu.jsonを一度だけ読み込む（複数回呼ばれても同じPromiseを返す） */
  function ensureLoaded() {
    if (dialogueData) return Promise.resolve(dialogueData);
    if (!loadPromise) {
      loadPromise = fetch("data/serihu.json")
        .then((res) => {
          if (!res.ok) throw new Error("serihu.jsonの取得に失敗: " + res.status);
          return res.json();
        })
        .then((json) => {
          dialogueData = (json && typeof json === "object") ? json : {};
          return dialogueData;
        })
        .catch((err) => {
          console.warn("[characterVoiceSystem] serihu.jsonの読み込みに失敗しました。汎用セリフのみ使用します。", err);
          dialogueData = {};
          return dialogueData;
        });
    }
    return loadPromise;
  }

  /** ファイル名やURLから拡張子・パスを除いた「タイトル部分」だけを取り出す */
  function extractTitle(pathLike) {
    if (!pathLike) return "";
    const m = String(pathLike).match(/([^\/\\]+?)(\.[a-zA-Z0-9]+)?$/);
    return m ? m[1] : String(pathLike);
  }

  /** ジャンル情報（name/title/backgroundImage）から、serihu.json内の一致するキーを推定する */
  function resolveKey(genre) {
    if (!genre || !dialogueData) return null;
    const candidates = [genre.name, genre.title, extractTitle(genre.backgroundImage)].filter(Boolean);

    for (const cand of candidates) {
      if (dialogueData[cand] && Array.isArray(dialogueData[cand]) && dialogueData[cand].length > 0) return cand;
    }
    for (const [key, aliasList] of Object.entries(ALIASES)) {
      if (!dialogueData[key] || dialogueData[key].length === 0) continue;
      const hit = candidates.some((c) => aliasList.some((a) => a.toLowerCase() === String(c).toLowerCase()));
      if (hit) return key;
    }
    return null;
  }

  /**
   * 1問正解するごとに呼ぶ。ランダムな1行を返す。
   * ensureLoaded()が完了する前・該当ジャンルが見つからない場合は汎用セリフを返す。
   */
  function pickLine(genre) {
    const key = resolveKey(genre);
    let pool = key ? dialogueData[key] : null;
    if (!pool || pool.length === 0) pool = (dialogueData && dialogueData.default) || FALLBACK_LINES;
    return pool[Utils.randInt(0, pool.length - 1)];
  }

  return { ensureLoaded, pickLine };
})();
