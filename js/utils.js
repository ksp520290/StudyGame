/**
 * utils.js
 * -----------------------------------------
 * プロジェクト全体で使う汎用ヘルパー関数群。
 * 特定の機能（学習・地図・報酬など）に依存しない純粋関数のみを置く。
 */

const Utils = (() => {

  function generateId(prefix = "id") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function todayStr(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function addDays(dateStr, days) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + days);
    return todayStr(d);
  }

  function diffDays(aStr, bStr) {
    const a = new Date(aStr + "T00:00:00");
    const b = new Date(bStr + "T00:00:00");
    return Math.round((a - b) / (1000 * 60 * 60 * 24));
  }

  function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "html") node.innerHTML = value;
      else if (key.startsWith("on") && typeof value === "function") {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) {
        node.setAttribute(key, "");
      } else {
        node.setAttribute(key, value);
      }
    }
    (Array.isArray(children) ? children : [children]).forEach((child) => {
      if (child == null) return;
      if (typeof child === "string") node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    });
    return node;
  }

  function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const tpl = document.getElementById("tpl-toast");
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelector(".toast-message").textContent = message;
    if (type === "error") node.classList.add("toast-error");
    if (type === "success") node.classList.add("toast-success");
    container.appendChild(node);
    setTimeout(() => node.remove(), 3300);
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /** 正誤問題(true/false)の値を「正答」「誤答」表記に変換する。それ以外の値はそのまま返す */
  function formatAnswerValue(value) {
    if (value === true) return "正答";
    if (value === false) return "誤答";
    if (value == null || value === "") return "（未回答）";
    return String(value);
  }

  /**
   * 「正答一覧（answer-review-row）」の各行をクリックしたときに表示する詳細ポップアップ。
   * 追加要望対応：
   *   - タイトルに問題文を表示
   *   - 誤答の場合は「自分の回答」と「正答」を並べて表示
   *   - その下に補足情報（問題データのnoteフィールド）を表示
   *   - 右上に「補足追加」ボタンを設置し、その場で補足情報を入力・保存できる
   *     （questionIdが渡された場合のみ。GameState上の問題データ本体を直接更新する）
   */
  function showAnswerDetailPopup({ questionId, prompt, isCorrect, userAnswer, correctAnswer, note }) {
    const existingId = "answer-detail-popup";
    const prev = document.getElementById(existingId);
    if (prev) prev.remove();

    let currentNote = note;

    const overlay = el("div", { id: existingId, class: "map-popup-overlay" });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    const panel = el("div", { class: "panel map-popup-panel answer-detail-panel" });

    const noteBox = el("div", { class: "answer-detail-note" }, currentNote && currentNote.trim() ? currentNote : "補足情報はありません");

    const headerRow = el("div", { class: "answer-detail-header" }, [
      el("div", { class: "answer-detail-question" }, prompt || "問題"),
    ]);
    if (questionId) {
      headerRow.appendChild(el("button", {
        class: "btn btn-secondary answer-detail-note-add-btn",
        onclick: () => {
          const input = window.prompt("補足情報を入力してください", currentNote || "");
          if (input == null) return; // キャンセル
          currentNote = input;
          noteBox.textContent = currentNote.trim() ? currentNote : "補足情報はありません";
          GameState.update((s) => {
            const q = GameState.findQuestionById(questionId);
            if (q) q.note = currentNote;
          });
          Utils.showToast("補足情報を保存しました", "success");
        },
      }, "補足追加"));
    }
    panel.appendChild(headerRow);

    if (isCorrect === false) {
      panel.appendChild(el("div", { class: "answer-detail-compare" }, [
        el("div", { class: "user-answer" }, [
          el("div", { class: "label" }, "あなたの回答"),
          el("div", { class: "value" }, formatAnswerValue(userAnswer)),
        ]),
        el("div", { class: "correct-answer" }, [
          el("div", { class: "label" }, "正答"),
          el("div", { class: "value" }, formatAnswerValue(correctAnswer)),
        ]),
      ]));
    } else {
      panel.appendChild(el("div", { class: "answer-detail-compare" }, [
        el("div", { class: "correct-answer" }, [
          el("div", { class: "label" }, "正答"),
          el("div", { class: "value" }, formatAnswerValue(correctAnswer)),
        ]),
      ]));
    }

    panel.appendChild(noteBox);
    panel.appendChild(el("button", { class: "btn btn-secondary btn-block", onclick: () => overlay.remove() }, "閉じる"));

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  /**
   * 【追加要望対応】キャラクター/建築物の絵文字プレースホルダーと、
   * アップロード済み画像（dataURL/URL）のどちらでも同じ場所に表示できるようにするヘルパー。
   * AssetManager.isImageValue() で判定し、画像なら<img>、そうでなければ絵文字テキストのspanを返す。
   */
  function iconOrImage(value, className) {
    const isImage = typeof AssetManager !== "undefined" && AssetManager.isImageValue(value);
    if (isImage) {
      return el("img", { class: className + " as-image", src: value, alt: "" });
    }
    return el("span", { class: className }, value || "🧑");
  }

  return {
    generateId, todayStr, addDays, diffDays, shuffle, randInt,
    el, showToast, deepClone, clamp, formatAnswerValue, showAnswerDetailPopup,
    iconOrImage,
  };
})();
