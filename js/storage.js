/**
 * storage.js
 * -----------------------------------------
 * 常時保存レイヤー。IndexedDBを最優先、使用不可ならLocalStorageに自動フォールバック。
 */

const StorageEngine = (() => {
  const DB_NAME = "gakushu_game_db";
  const DB_VERSION = 1;
  const STORE_NAME = "gamedata";
  const LS_PREFIX = "gakushu_game::";

  let db = null;
  let mode = null;
  let ready = null;

  function indexedDbAvailable() {
    return "indexedDB" in window && window.indexedDB != null;
  }

  function openIndexedDb() {
    return new Promise((resolve) => {
      if (!indexedDbAvailable()) { mode = "localstorage"; resolve(); return; }
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (event) => {
          const database = event.target.result;
          if (!database.objectStoreNames.contains(STORE_NAME)) {
            database.createObjectStore(STORE_NAME, { keyPath: "key" });
          }
        };
        req.onsuccess = (event) => {
          db = event.target.result;
          mode = "indexeddb";
          db.onversionchange = () => db.close();
          resolve();
        };
        req.onerror = () => {
          console.warn("[storage] IndexedDBを開けなかったためLocalStorageを使用します", req.error);
          mode = "localstorage"; resolve();
        };
        req.onblocked = () => {
          console.warn("[storage] IndexedDBがブロックされたためLocalStorageを使用します");
          mode = "localstorage"; resolve();
        };
      } catch (err) {
        console.warn("[storage] IndexedDB初期化中にエラー", err);
        mode = "localstorage"; resolve();
      }
    });
  }

  function init() {
    if (!ready) ready = openIndexedDb();
    return ready;
  }

  function idbTransaction(storeMode) {
    const tx = db.transaction(STORE_NAME, storeMode);
    return tx.objectStore(STORE_NAME);
  }

  async function set(key, value) {
    await init();
    if (mode === "indexeddb") {
      return new Promise((resolve) => {
        try {
          const store = idbTransaction("readwrite");
          const req = store.put({ key, value });
          req.onsuccess = () => resolve(true);
          req.onerror = () => {
            console.warn("[storage] IndexedDB書き込み失敗、LocalStorageへフォールバック", req.error);
            resolve(setLocalStorage(key, value));
          };
        } catch (err) { resolve(setLocalStorage(key, value)); }
      });
    }
    return setLocalStorage(key, value);
  }

  function setLocalStorage(key, value) {
    try {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error("[storage] LocalStorage書き込み失敗", err);
      if (typeof Utils !== "undefined") {
        Utils.showToast("保存容量が不足しています。バックアップ後に不要データを整理してください。", "error");
      }
      return false;
    }
  }

  async function get(key) {
    await init();
    if (mode === "indexeddb") {
      return new Promise((resolve) => {
        try {
          const store = idbTransaction("readonly");
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
          req.onerror = () => resolve(getLocalStorage(key));
        } catch (err) { resolve(getLocalStorage(key)); }
      });
    }
    return getLocalStorage(key);
  }

  function getLocalStorage(key) {
    try {
      const raw = localStorage.getItem(LS_PREFIX + key);
      return raw == null ? undefined : JSON.parse(raw);
    } catch (err) {
      console.error("[storage] LocalStorage読み込み失敗（データ破損の可能性）", err);
      return undefined;
    }
  }

  async function getAll() {
    await init();
    if (mode === "indexeddb") {
      return new Promise((resolve) => {
        try {
          const store = idbTransaction("readonly");
          const req = store.getAll();
          req.onsuccess = () => {
            const result = {};
            (req.result || []).forEach((row) => { result[row.key] = row.value; });
            resolve(result);
          };
          req.onerror = () => resolve(getAllLocalStorage());
        } catch (err) { resolve(getAllLocalStorage()); }
      });
    }
    return getAllLocalStorage();
  }

  function getAllLocalStorage() {
    const result = {};
    for (let i = 0; i < localStorage.length; i++) {
      const fullKey = localStorage.key(i);
      if (fullKey && fullKey.startsWith(LS_PREFIX)) {
        const key = fullKey.slice(LS_PREFIX.length);
        result[key] = getLocalStorage(key);
      }
    }
    return result;
  }

  async function remove(key) {
    await init();
    if (mode === "indexeddb") {
      return new Promise((resolve) => {
        try {
          const store = idbTransaction("readwrite");
          const req = store.delete(key);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch (err) { resolve(false); }
      });
    }
    localStorage.removeItem(LS_PREFIX + key);
    return true;
  }

  function getMode() { return mode; }

  return { init, set, get, getAll, remove, getMode };
})();
