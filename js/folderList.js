/**
 * folderList.js
 * -----------------------------------------
 * 【追加要望対応】音読ディクテーション一覧・読書記録一覧で共通に使う「フォルダ（見た目上の
 * グループ分け）」機能。
 *
 *   ・フォルダ = { id, name, open } を state[foldersKey] に保存する。
 *   ・各アイテム（教材・本）は folderId（null/未設定 = フォルダ外）を持つ。フォルダは
 *     見た目上のグループ分けだけで、アイテム自体の内容・動作には一切影響しない。
 *   ・フォルダはアコーディオン（<details>）で開閉できる。開閉状態も保存する。
 *   ・移動方法：
 *       PC     … アイテムをマウスでドラッグしてフォルダの上にドロップ
 *       スマホ … アイテムを長押し（約0.45秒）してからドラッグしてフォルダの上で離す
 *     フォルダ外へ出すときは、フォルダ以外の場所（一覧の余白やフォルダ外のアイテムの上）に
 *     ドロップする。
 *   ・ポインターイベントだけで実装（マウス・タッチ・ペン共通）。外部ライブラリ不使用。
 *
 * フォルダを削除してもアイテムは削除されず、フォルダ外へ戻るだけ（損失回避の方針）。
 */

const FolderList = (() => {
  const LONG_PRESS_MS = 450;      // タッチ操作でドラッグを始めるまでの長押し時間
  const TOUCH_CANCEL_MOVE_PX = 10; // 長押し成立前にこれ以上動いたらスクロールとみなす
  const MOUSE_START_MOVE_PX = 6;  // マウスでドラッグを始める移動量
  const EDGE_SCROLL_ZONE_PX = 64; // 画面端の自動スクロール範囲
  const EDGE_SCROLL_SPEED_PX = 12;

  /* ============================================================
     データ操作
     ============================================================ */

  function getFolders(foldersKey) {
    return GameState.getState()[foldersKey] || [];
  }

  function createFolder(foldersKey, name) {
    const id = Utils.generateId("folder");
    GameState.update((state) => {
      if (!state[foldersKey]) state[foldersKey] = [];
      state[foldersKey].push({
        id,
        name: (name || "").trim().slice(0, 60) || "新しいフォルダ",
        open: true,
      });
    });
    return id;
  }

  function renameFolder(foldersKey, folderId, name) {
    const trimmed = (name || "").trim().slice(0, 60);
    if (!trimmed) return;
    GameState.update((state) => {
      const f = (state[foldersKey] || []).find((x) => x.id === folderId);
      if (f) f.name = trimmed;
    });
  }

  function setFolderOpen(foldersKey, folderId, open) {
    const f = getFolders(foldersKey).find((x) => x.id === folderId);
    if (!f || !!f.open === !!open) return;
    GameState.update((state) => {
      const target = (state[foldersKey] || []).find((x) => x.id === folderId);
      if (target) target.open = !!open;
    });
  }

  /** フォルダだけを削除する。中のアイテムは削除せず、フォルダ外へ戻す。 */
  function deleteFolder(foldersKey, itemsKey, folderId) {
    GameState.update((state) => {
      state[foldersKey] = (state[foldersKey] || []).filter((f) => f.id !== folderId);
      (state[itemsKey] || []).forEach((item) => {
        if (item.folderId === folderId) item.folderId = null;
      });
    });
  }

  function moveItem(itemsKey, itemId, folderId) {
    GameState.update((state) => {
      const item = (state[itemsKey] || []).find((x) => x.id === itemId);
      if (item) item.folderId = folderId || null;
    });
  }

  /* ============================================================
     UI部品
     ============================================================ */

  /** 「フォルダを追加」ボタン。onCreated はフォルダ作成後（再描画用）に呼ばれる。 */
  function createAddFolderButton(foldersKey, onCreated) {
    return Utils.el("button", {
      class: "btn btn-secondary btn-block folder-add-btn",
      onclick: () => {
        const name = window.prompt("フォルダの名前を入力してください", "新しいフォルダ");
        if (name === null) return;
        createFolder(foldersKey, name);
        Utils.showToast("フォルダを追加しました", "success");
        if (onCreated) onCreated();
      },
    }, "📁 フォルダを追加");
  }

  /**
   * フォルダ付き一覧を描画する。
   * @param {HTMLElement} container 描画先（中身は一旦空にする）
   * @param {object} opts
   *   foldersKey / itemsKey : state上のキー
   *   items                 : 表示するアイテム配列（検索などで絞り込み済みのもの）
   *   renderItem(item)      : アイテム1件のDOM要素を返す（ドラッグ対象になる）
   *   onChange()            : 移動・フォルダ編集後に再描画するためのコールバック
   *   filtering             : true の間は、該当アイテムの無いフォルダを隠し、該当フォルダを開いて表示する
   *   emptyMessage          : フォルダ外にも何も無いときの文言
   */
  function render(container, opts) {
    const { foldersKey, itemsKey, items, renderItem, onChange, filtering = false, emptyMessage = "" } = opts;
    container.innerHTML = "";

    const wrap = Utils.el("div", { class: "folder-list-wrap", "data-drop-folder": "" });
    const folders = getFolders(foldersKey);
    const folderIds = new Set(folders.map((f) => f.id));

    const byFolder = new Map();
    const rootItems = [];
    items.forEach((item) => {
      if (item.folderId && folderIds.has(item.folderId)) {
        if (!byFolder.has(item.folderId)) byFolder.set(item.folderId, []);
        byFolder.get(item.folderId).push(item);
      } else {
        rootItems.push(item);
      }
    });

    const makeDraggable = (el, item) => {
      attachDrag(el, { itemId: item.id, itemsKey, wrap, onChange });
      return el;
    };

    folders.forEach((folder) => {
      const inFolder = byFolder.get(folder.id) || [];
      if (filtering && inFolder.length === 0) return;

      const details = Utils.el("details", {
        class: "settings-accordion folder-accordion",
        "data-drop-folder": folder.id,
      });
      if (filtering || folder.open) details.setAttribute("open", "");
      details.addEventListener("toggle", () => {
        if (!filtering) setFolderOpen(foldersKey, folder.id, details.open);
      });

      details.appendChild(Utils.el("summary", {}, `📁 ${folder.name}（${inFolder.length}）`));

      const controls = Utils.el("div", { class: "folder-controls" }, [
        Utils.el("button", {
          class: "btn btn-secondary",
          onclick: () => {
            const name = window.prompt("フォルダの新しい名前", folder.name);
            if (name === null || !name.trim()) return;
            renameFolder(foldersKey, folder.id, name);
            if (onChange) onChange();
          },
        }, "名前を変更"),
        Utils.el("button", {
          class: "btn btn-secondary",
          onclick: () => {
            if (!window.confirm(`フォルダ「${folder.name}」を削除しますか？中身は削除されず、フォルダの外に戻ります。`)) return;
            deleteFolder(foldersKey, itemsKey, folder.id);
            if (onChange) onChange();
          },
        }, "フォルダを削除"),
      ]);
      details.appendChild(controls);

      const list = Utils.el("div", { class: "folder-items" });
      inFolder.forEach((item) => list.appendChild(makeDraggable(renderItem(item), item)));
      if (inFolder.length === 0) {
        list.appendChild(Utils.el("p", { class: "empty-state folder-empty-hint" }, "ここにドラッグ（スマホは長押ししてからドラッグ）して入れます。"));
      }
      details.appendChild(list);
      wrap.appendChild(details);
    });

    const rootList = Utils.el("div", { class: "folder-items folder-root-items" });
    rootItems.forEach((item) => rootList.appendChild(makeDraggable(renderItem(item), item)));
    wrap.appendChild(rootList);

    if (rootItems.length === 0 && byFolder.size === 0 && emptyMessage) {
      wrap.appendChild(Utils.el("p", { class: "empty-state" }, emptyMessage));
    }
    container.appendChild(wrap);
  }

  /* ============================================================
     ドラッグ処理（マウスはそのままドラッグ、タッチは長押し後にドラッグ）
     ============================================================ */

  let pending = null; // 押下中（まだドラッグ開始前）
  let drag = null;    // ドラッグ中
  let listenersReady = false;
  let rafId = null;

  function ensureDocumentListeners() {
    if (listenersReady) return;
    listenersReady = true;
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerCancel);
    // ドラッグ中は、タッチによる画面スクロールを止める（非passiveで登録が必要）
    document.addEventListener("touchmove", (e) => {
      if (drag && e.cancelable) e.preventDefault();
    }, { passive: false });
  }

  function attachDrag(el, ctx) {
    ensureDocumentListeners();
    el.classList.add("folder-draggable");
    el.addEventListener("pointerdown", (e) => {
      if (drag || pending) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const st = {
        el, ctx,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        startX: e.clientX, startY: e.clientY,
        x: e.clientX, y: e.clientY,
        offsetX: 0, offsetY: 0,
        timer: null, clone: null, target: null,
      };
      pending = st;
      if (e.pointerType !== "mouse") {
        st.timer = setTimeout(() => { if (pending === st) activate(st); }, LONG_PRESS_MS);
      }
    });
    // 長押しで出るコンテキストメニュー（スマホ）を、ドラッグ準備中・ドラッグ中は抑止する
    el.addEventListener("contextmenu", (e) => { if (pending || drag) e.preventDefault(); });
  }

  function activate(st) {
    if (st.timer) { clearTimeout(st.timer); st.timer = null; }
    pending = null;
    drag = st;

    const rect = st.el.getBoundingClientRect();
    st.offsetX = st.x - rect.left;
    st.offsetY = st.y - rect.top;

    const clone = st.el.cloneNode(true);
    clone.classList.add("folder-drag-clone");
    clone.style.width = `${rect.width}px`;
    clone.style.left = `${rect.left}px`;
    clone.style.top = `${rect.top}px`;
    document.body.appendChild(clone);
    st.clone = clone;

    st.el.classList.add("is-drag-source");
    st.ctx.wrap.classList.add("is-dragging-active");
    document.body.classList.add("folder-dragging");
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { /* 非対応環境は無視 */ } }

    rafId = requestAnimationFrame(tick);
  }

  function findDropTarget(st) {
    if (st.clone) st.clone.style.visibility = "hidden";
    const hit = document.elementFromPoint(st.x, st.y);
    if (st.clone) st.clone.style.visibility = "";
    if (!hit) return null;
    const target = hit.closest("[data-drop-folder]");
    // 別の一覧（別画面の要素など）へは落とさない
    if (!target || !st.ctx.wrap.contains(target) && target !== st.ctx.wrap) return null;
    return target;
  }

  function updateTarget(st) {
    const target = findDropTarget(st);
    if (target === st.target) return;
    if (st.target) st.target.classList.remove("is-drop-target");
    st.target = target;
    if (target) target.classList.add("is-drop-target");
  }

  function tick() {
    if (!drag) return;
    const st = drag;
    // 画面の上下端に近いとき自動スクロール（長い一覧でも端まで運べるように）
    const scroller = document.getElementById("screen-container");
    if (scroller) {
      const r = scroller.getBoundingClientRect();
      if (st.y < r.top + EDGE_SCROLL_ZONE_PX) scroller.scrollTop -= EDGE_SCROLL_SPEED_PX;
      else if (st.y > r.bottom - EDGE_SCROLL_ZONE_PX) scroller.scrollTop += EDGE_SCROLL_SPEED_PX;
    }
    updateTarget(st);
    rafId = requestAnimationFrame(tick);
  }

  function onPointerMove(e) {
    const st = drag || pending;
    if (!st || e.pointerId !== st.pointerId) return;
    st.x = e.clientX;
    st.y = e.clientY;

    if (drag) {
      st.clone.style.left = `${st.x - st.offsetX}px`;
      st.clone.style.top = `${st.y - st.offsetY}px`;
      return;
    }
    const dist = Math.hypot(st.x - st.startX, st.y - st.startY);
    if (st.pointerType === "mouse") {
      if (dist > MOUSE_START_MOVE_PX) activate(st);
    } else if (dist > TOUCH_CANCEL_MOVE_PX) {
      // 長押しが成立する前に指が動いた＝通常のスクロール操作なのでドラッグは開始しない
      clearTimeout(st.timer);
      pending = null;
    }
  }

  function endDrag(commit) {
    const st = drag;
    if (!st) return;
    drag = null;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

    const target = commit ? (st.target || findDropTarget(st)) : null;
    if (st.target) st.target.classList.remove("is-drop-target");
    if (st.clone) st.clone.remove();
    st.el.classList.remove("is-drag-source");
    st.ctx.wrap.classList.remove("is-dragging-active");
    document.body.classList.remove("folder-dragging");

    // ドラッグ操作の直後に発生する「クリック」（教材・本を開いてしまう動作）を1回だけ無効化する
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    document.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => document.removeEventListener("click", swallow, { capture: true }), 400);

    if (!target) return;
    const folderId = target.getAttribute("data-drop-folder") || null;
    const current = (GameState.getState()[st.ctx.itemsKey] || []).find((x) => x.id === st.ctx.itemId);
    if (!current || (current.folderId || null) === folderId) return;
    moveItem(st.ctx.itemsKey, st.ctx.itemId, folderId);
    if (st.ctx.onChange) st.ctx.onChange();
  }

  function onPointerUp(e) {
    if (pending && e.pointerId === pending.pointerId) {
      if (pending.timer) clearTimeout(pending.timer);
      pending = null; // 通常のタップ／クリックとして扱う
      return;
    }
    if (drag && e.pointerId === drag.pointerId) endDrag(true);
  }

  function onPointerCancel(e) {
    if (pending && e.pointerId === pending.pointerId) {
      if (pending.timer) clearTimeout(pending.timer);
      pending = null;
      return;
    }
    if (drag && e.pointerId === drag.pointerId) endDrag(false);
  }

  return {
    render, createAddFolderButton,
    createFolder, renameFolder, deleteFolder, setFolderOpen, moveItem, getFolders,
  };
})();
