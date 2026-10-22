// 車禍資料快取：存在瀏覽器 IndexedDB，第二次打開就不用重抓上萬筆。任何錯誤都靜默退回「不快取」。
(function (root) {
  const DB_NAME = "hotspot-cache";
  const STORE = "tables";
  const g = typeof globalThis !== "undefined" ? globalThis : root;

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!g.indexedDB) return reject(new Error("瀏覽器不支援 IndexedDB"));
      const req = g.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function get(key) {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const req = db.transaction(STORE).objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return null;
    }
  }

  async function put(key, value) {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      if (typeof console !== "undefined" && g.indexedDB) console.warn("車禍資料快取寫入失敗：", e);
    }
  }

  const isFresh = (entry, count) => !!entry && Array.isArray(entry.rows) && entry.count === count;

  const api = { get, put, isFresh };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HotCache = api;
})(this);
