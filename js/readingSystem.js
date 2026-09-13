/**
 * readingSystem.js
 * -----------------------------------------
 * Phase8：読書記録システム（仕様62章）。学習ゲームの主目的からは外れる
 * 任意機能のため、日記のように何かを強制したりガチャ解放条件にはしない
 * （仕様60章「読書していない日でも日記可能。日記は読書を強制しない」に準拠）。
 *
 * 1冊 = 1 book レコード：
 *   { id, title, author, publisher, tags:[], rereadFlag,
 *     bookSummary,                         // 本の要約（目安150文字）
 *     chapters: [{ id, name, summary }],   // 章要約（目安30文字）
 *     quotes: [{ id, text, note }],        // 引用
 *     ladder: [{ id, kind:"abstract"|"concrete", text }], // 抽象⇄具体（横方向に無限追加）
 *     criticalQuestions: [{ id, question, answer }],      // 批判的読書テンプレート
 *     createdAt, updatedAt }
 *
 * 【仕様に明記が無く判断した点】
 *   - 章要約30文字・本要約150文字は「目安」として文字数カウンターを表示するのみで、
 *     入力を強制的にブロックしない（認知負荷を減らす方針を優先。仕様書冒頭の
 *     判断優先順位②に基づく）。
 *   - 批判的読書テンプレートの初期質問6個はcriticalQuestionsに自動で種として
 *     入る。ユーザーは自由に追加・削除できる（仕様62章「自由追加可能」）。
 */

const ReadingSystem = (() => {
  const DEFAULT_CRITICAL_QUESTIONS = ["本当に？", "前提は？", "例外は？", "根拠は？", "他の説明は？", "反証は？"];
  const CHAPTER_SUMMARY_TARGET = 30;
  const BOOK_SUMMARY_TARGET = 150;

  /**
   * 【追加要望対応】読書記録の「章ごとの要約」「抽象」「抽象⇄具体」「批判的読書テンプレート」を
   * アコーディオン（開閉式、<details>）表示にするための共通ヘルパー。
   * router.js内のsettingsAccordion()と同じ見た目（css/style.css .settings-accordion）を再利用する。
   */
  function readingAccordion(title, children, opts = {}) {
    const summary = Utils.el("summary", {}, title);
    const details = Utils.el("details", { class: "settings-accordion" }, [summary, ...children]);
    if (opts.open) details.setAttribute("open", "");
    return details;
  }

  function getAll() {
    return GameState.getState().books || [];
  }

  function getById(id) {
    return getAll().find((b) => b.id === id) || null;
  }

  function createBook({ title, author, publisher }) {
    const id = Utils.generateId("book");
    GameState.update((state) => {
      state.books.push({
        id,
        title: title.trim().slice(0, 100) || "無題の本",
        author: (author || "").trim().slice(0, 60),
        publisher: (publisher || "").trim().slice(0, 60),
        tags: [],
        rereadFlag: false,
        bookSummary: "",
        chapters: [],
        quotes: [],
        ladder: [],
        criticalQuestions: DEFAULT_CRITICAL_QUESTIONS.map((q) => ({ id: Utils.generateId("cq"), question: q, answer: "" })),
        createdAt: Utils.todayStr(),
        updatedAt: Utils.todayStr(),
      });
    });
    return id;
  }

  function updateBook(id, patch) {
    GameState.update((state) => {
      const b = state.books.find((x) => x.id === id);
      if (!b) return;
      Object.assign(b, patch);
      b.updatedAt = Utils.todayStr();
    });
  }

  function deleteBook(id) {
    GameState.update((state) => {
      state.books = state.books.filter((b) => b.id !== id);
    });
  }

  function addChapter(bookId, name) {
    GameState.update((state) => {
      const b = state.books.find((x) => x.id === bookId);
      if (!b) return;
      b.chapters.push({ id: Utils.generateId("chap"), name: name.trim().slice(0, 60) || `第${b.chapters.length + 1}章`, summary: "" });
      b.updatedAt = Utils.todayStr();
    });
  }

  function updateChapterSummary(bookId, chapterId, summary) {
    GameState.update((state) => {
      const b = state.books.find((x) => x.id === bookId);
      const c = b?.chapters.find((x) => x.id === chapterId);
      if (c) c.summary = summary.slice(0, 200);
    });
  }

  function addQuote(bookId, text, note) {
    GameState.update((state) => {
      const b = state.books.find((x) => x.id === bookId);
      if (!b) return;
      b.quotes.push({ id: Utils.generateId("quote"), text: text.trim().slice(0, 300), note: (note || "").trim().slice(0, 300) });
    });
  }

  /** 抽象⇄具体の鎖に1項目追加する。種類は交互を推奨するがUI側でボタンを分けるのみで強制はしない */
  function addLadderItem(bookId, kind, text) {
    GameState.update((state) => {
      const b = state.books.find((x) => x.id === bookId);
      if (!b) return;
      b.ladder.push({ id: Utils.generateId("ladder"), kind, text: text.trim().slice(0, 200) });
    });
  }

  function addCriticalQuestion(bookId, question) {
    GameState.update((state) => {
      const b = state.books.find((x) => x.id === bookId);
      if (!b) return;
      b.criticalQuestions.push({ id: Utils.generateId("cq"), question: question.trim().slice(0, 100), answer: "" });
    });
  }

  function updateCriticalAnswer(bookId, questionId, answer) {
    GameState.update((state) => {
      const b = state.books.find((x) => x.id === bookId);
      const q = b?.criticalQuestions.find((x) => x.id === questionId);
      if (q) q.answer = answer.slice(0, 400);
    });
  }

  function setTags(bookId, tagsText) {
    const tags = tagsText.split(/[,、\s]+/).map((t) => t.trim()).filter(Boolean).slice(0, 20);
    updateBook(bookId, { tags });
  }

  /** 検索（仕様62章：タグ・期間・除外・キーワード） */
  function search({ keyword = "", tag = "", excludeKeyword = "", fromDate = "", toDate = "" } = {}) {
    return getAll().filter((b) => {
      if (tag && !b.tags.includes(tag)) return false;
      if (fromDate && b.updatedAt < fromDate) return false;
      if (toDate && b.updatedAt > toDate) return false;
      const haystack = [b.title, b.author, b.bookSummary, ...(b.quotes || []).map((q) => q.text)].join(" ");
      if (keyword && !haystack.includes(keyword)) return false;
      if (excludeKeyword && haystack.includes(excludeKeyword)) return false;
      return true;
    });
  }

  function getAllTags() {
    const set = new Set();
    getAll().forEach((b) => b.tags.forEach((t) => set.add(t)));
    return [...set];
  }

  /* ============================================================
     画面："books"（一覧・検索）
     ============================================================ */

  function renderBooksScreen(root) {
    const wrap = Utils.el("div", { class: "screen-inner" });
    wrap.appendChild(Utils.el("h2", {}, "読書記録"));

    const state = { keyword: "", tag: "", excludeKeyword: "" };
    const resultsBox = Utils.el("div", { class: "books-list" });

    const searchPanel = Utils.el("div", { class: "panel" });
    const kwInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "キーワード検索" });
    const excludeInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "除外キーワード" });
    const tagSelect = Utils.el("select", { class: "review-typing-input" }, [
      Utils.el("option", { value: "" }, "すべてのタグ"),
      ...getAllTags().map((t) => Utils.el("option", { value: t }, t)),
    ]);
    const runSearch = () => {
      const results = search({ keyword: kwInput.value.trim(), tag: tagSelect.value, excludeKeyword: excludeInput.value.trim() });
      renderResults(results);
    };
    [kwInput, excludeInput].forEach((inp) => inp.addEventListener("input", runSearch));
    tagSelect.addEventListener("change", runSearch);
    searchPanel.appendChild(Utils.el("h3", {}, "検索"));
    searchPanel.appendChild(kwInput);
    searchPanel.appendChild(excludeInput);
    searchPanel.appendChild(tagSelect);
    wrap.appendChild(searchPanel);

    wrap.appendChild(Utils.el("button", {
      class: "btn btn-primary btn-block",
      onclick: () => Router.navigate("bookDetail", { bookId: null }),
    }, "＋ 新しい本を追加"));

    wrap.appendChild(resultsBox);

    function renderResults(list) {
      resultsBox.innerHTML = "";
      if (list.length === 0) {
        resultsBox.appendChild(Utils.el("p", { class: "empty-state" }, "本がありません。"));
        return;
      }
      list.forEach((b) => {
        resultsBox.appendChild(
          Utils.el("button", { class: "panel book-list-row", onclick: () => Router.navigate("bookDetail", { bookId: b.id }) }, [
            Utils.el("h3", {}, b.title + (b.rereadFlag ? " 🔁" : "")),
            Utils.el("p", {}, b.author || "著者未設定"),
            Utils.el("div", { class: "progress-meta" }, [
              Utils.el("span", {}, b.tags.length ? `#${b.tags.join(" #")}` : "タグなし"),
              Utils.el("span", {}, `更新: ${b.updatedAt}`),
            ]),
          ])
        );
      });
    }

    renderResults(getAll());
    root.appendChild(wrap);
  }

  /* ============================================================
     画面："bookDetail"（詳細・編集）
     ============================================================ */

  function renderBookDetailScreen(root, params = {}) {
    let bookId = params.bookId;
    if (!bookId) {
      bookId = createBook({ title: "無題の本", author: "", publisher: "" });
    }
    const book = getById(bookId);
    if (!book) { root.appendChild(Utils.el("p", { class: "empty-state" }, "本が見つかりません")); return; }

    const wrap = Utils.el("div", { class: "screen-inner" });
    wrap.appendChild(Utils.el("h2", {}, "読書記録の編集"));

    // --- 基本情報 ---
    const basicPanel = Utils.el("div", { class: "panel" });
    const titleInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "タイトル" });
    titleInput.value = book.title;
    const authorInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "著者" });
    authorInput.value = book.author;
    const publisherInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "出版社" });
    publisherInput.value = book.publisher;
    const tagInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "タグ（カンマ区切り）" });
    tagInput.value = book.tags.join(", ");
    const rereadLabel = Utils.el("label", { class: "settings-row" }, [
      "再読フラグ",
      Utils.el("input", { type: "checkbox", checked: book.rereadFlag || undefined }),
    ]);
    rereadLabel.querySelector("input").addEventListener("change", (e) => updateBook(bookId, { rereadFlag: e.target.checked }));

    [titleInput, authorInput, publisherInput].forEach((inp) => {
      inp.addEventListener("change", () => updateBook(bookId, { title: titleInput.value, author: authorInput.value, publisher: publisherInput.value }));
    });
    tagInput.addEventListener("change", () => setTags(bookId, tagInput.value));

    basicPanel.appendChild(titleInput);
    basicPanel.appendChild(authorInput);
    basicPanel.appendChild(publisherInput);
    basicPanel.appendChild(tagInput);
    basicPanel.appendChild(rereadLabel);

    wrap.appendChild(basicPanel);

    // --- 引用 ---
    wrap.appendChild(renderQuotesSection(book));

    // 【追加要望対応】「章ごとの要約」「抽象」「抽象⇄具体」「批判的読書テンプレート」を
    // アコーディオン（開閉式）表示にした。既存の各render関数はそのままパネル中身として使う。
    wrap.appendChild(readingAccordion("章ごとの要約", [renderChaptersSection(book)]));
    wrap.appendChild(readingAccordion("抽象", [renderAbstractSummarySection(book)]));
    wrap.appendChild(readingAccordion("抽象⇄具体", [renderLadderSection(book)]));
    wrap.appendChild(readingAccordion("批判的読書テンプレート", [renderCriticalSection(book)]));

    wrap.appendChild(Utils.el("button", {
      class: "btn btn-secondary btn-block",
      onclick: () => {
        if (confirm(`「${book.title}」を削除しますか？`)) {
          deleteBook(bookId);
          Router.navigate("books");
        }
      },
    }, "この本を削除する"));

    wrap.appendChild(Utils.el("button", { class: "btn btn-moss btn-block", onclick: () => Router.navigate("books") }, "一覧に戻る"));

    root.appendChild(wrap);

    function renderAbstractSummarySection(b) {
      const panel = Utils.el("div", { class: "panel" });
      const summaryInput = Utils.el("textarea", { class: "review-textarea", placeholder: `本の要約（目安${BOOK_SUMMARY_TARGET}文字）` });
      summaryInput.value = b.bookSummary;
      const summaryCounter = Utils.el("div", { class: "char-counter" }, `${b.bookSummary.length} / ${BOOK_SUMMARY_TARGET}（目安）`);
      summaryInput.addEventListener("input", () => { summaryCounter.textContent = `${summaryInput.value.length} / ${BOOK_SUMMARY_TARGET}（目安）`; });
      summaryInput.addEventListener("change", () => updateBook(bookId, { bookSummary: summaryInput.value }));
      panel.appendChild(Utils.el("label", { class: "diary-field-label" }, "本の要約"));
      panel.appendChild(summaryInput);
      panel.appendChild(summaryCounter);
      return panel;
    }

    function renderChaptersSection(b) {
      const panel = Utils.el("div", { class: "panel" });
      b.chapters.forEach((c) => {
        const row = Utils.el("div", { class: "chapter-row" });
        row.appendChild(Utils.el("div", { class: "diary-field-label" }, c.name));
        const input = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: `章の要約（目安${CHAPTER_SUMMARY_TARGET}文字）` });
        input.value = c.summary;
        input.addEventListener("change", () => updateChapterSummary(bookId, c.id, input.value));
        row.appendChild(input);
        panel.appendChild(row);
      });
      const nameInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "新しい章の名前" });
      panel.appendChild(nameInput);
      panel.appendChild(Utils.el("button", {
        class: "btn btn-secondary btn-block",
        onclick: () => { addChapter(bookId, nameInput.value || `第${b.chapters.length + 1}章`); Router.navigate("bookDetail", { bookId }); },
      }, "＋ 章を追加"));
      return panel;
    }

    function renderQuotesSection(b) {
      const panel = Utils.el("div", { class: "panel" }, [Utils.el("h3", {}, "引用")]);
      b.quotes.forEach((q) => {
        panel.appendChild(Utils.el("div", { class: "quote-row" }, [
          Utils.el("p", { class: "quote-text" }, `「${q.text}」`),
          q.note ? Utils.el("p", { class: "quote-note" }, q.note) : null,
        ]));
      });
      const textInput = Utils.el("textarea", { class: "review-textarea", placeholder: "引用文" });
      const noteInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "メモ（任意）" });
      panel.appendChild(textInput);
      panel.appendChild(noteInput);
      panel.appendChild(Utils.el("button", {
        class: "btn btn-secondary btn-block",
        onclick: () => {
          if (!textInput.value.trim()) return;
          addQuote(bookId, textInput.value, noteInput.value);
          Router.navigate("bookDetail", { bookId });
        },
      }, "＋ 引用を追加"));
      return panel;
    }

    function renderLadderSection(b) {
      const panel = Utils.el("div", { class: "panel" }, [
        Utils.el("p", {}, "抽象的な考えと、その具体例を交互に並べて思考を広げます。"),
      ]);
      const chain = Utils.el("div", { class: "ladder-chain" });
      b.ladder.forEach((item) => {
        chain.appendChild(Utils.el("div", { class: "ladder-item ladder-" + item.kind }, [
          Utils.el("span", { class: "ladder-kind-badge" }, item.kind === "abstract" ? "抽象" : "具体"),
          Utils.el("span", {}, item.text),
        ]));
      });
      panel.appendChild(chain);
      const ladderInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "内容を入力してから、抽象 or 具体を選んで追加" });
      panel.appendChild(ladderInput);
      const btnRow = Utils.el("div", { class: "quiz-choice-row" }, [
        Utils.el("button", { class: "btn btn-secondary", onclick: () => addLadderAndRefresh("abstract") }, "＋ 抽象として追加"),
        Utils.el("button", { class: "btn btn-secondary", onclick: () => addLadderAndRefresh("concrete") }, "＋ 具体として追加"),
      ]);
      panel.appendChild(btnRow);
      function addLadderAndRefresh(kind) {
        if (!ladderInput.value.trim()) return;
        addLadderItem(bookId, kind, ladderInput.value);
        Router.navigate("bookDetail", { bookId });
      }
      return panel;
    }

    function renderCriticalSection(b) {
      const panel = Utils.el("div", { class: "panel" });
      b.criticalQuestions.forEach((q) => {
        const row = Utils.el("div", { class: "critical-question-row" });
        row.appendChild(Utils.el("div", { class: "diary-field-label" }, q.question));
        const answerInput = Utils.el("textarea", { class: "review-textarea", placeholder: "考えたことを書く" });
        answerInput.value = q.answer;
        answerInput.addEventListener("change", () => updateCriticalAnswer(bookId, q.id, answerInput.value));
        row.appendChild(answerInput);
        panel.appendChild(row);
      });
      const newQInput = Utils.el("input", { type: "text", class: "review-typing-input", placeholder: "自分の問いを追加する" });
      panel.appendChild(newQInput);
      panel.appendChild(Utils.el("button", {
        class: "btn btn-secondary btn-block",
        onclick: () => {
          if (!newQInput.value.trim()) return;
          addCriticalQuestion(bookId, newQInput.value);
          Router.navigate("bookDetail", { bookId });
        },
      }, "＋ 問いを追加"));
      return panel;
    }
  }

  Router.registerScreen("books", renderBooksScreen);
  Router.registerScreen("bookDetail", renderBookDetailScreen);

  return {
    getAll, getById, createBook, updateBook, deleteBook,
    addChapter, updateChapterSummary, addQuote, addLadderItem,
    addCriticalQuestion, updateCriticalAnswer, setTags, search, getAllTags,
    DEFAULT_CRITICAL_QUESTIONS,
  };
})();
