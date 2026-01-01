/**
 * =============================================================================
 * db.js - IndexedDB操作モジュール
 * =============================================================================
 *
 * 概要:
 *   IndexedDBのCRUD操作を抽象化したモジュール
 *
 * 分類: データアクセス層 (Data Access Layer)
 *
 * 依存関係: なし（スタンドアロン）
 *
 * =============================================================================
 */

const VendorQuoteDB = (function () {
  const DB_NAME = "VendorQuoteDB";
  const DB_VERSION = 1;
  const STORES = {
    RECORDS: "records",
    META: "meta",
  };

  let dbInstance = null;

  /**
   * IndexedDBを開く（シングルトン）
   * @returns {Promise<IDBDatabase>}
   */
  async function open() {
    if (dbInstance) return dbInstance;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        dbInstance = request.result;
        resolve(dbInstance);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // records ストア作成
        if (!db.objectStoreNames.contains(STORES.RECORDS)) {
          const recordStore = db.createObjectStore(STORES.RECORDS, {
            keyPath: "id",
            autoIncrement: true,
          });
          // インデックス作成
          recordStore.createIndex("region", "region", { unique: false });
          recordStore.createIndex("vendor", "vendor", { unique: false });
          recordStore.createIndex("item", "item", { unique: false });
          recordStore.createIndex("majorCode", "majorCode", { unique: false });
          recordStore.createIndex("orderDate", "orderDate", { unique: false });
          recordStore.createIndex("item_spec", ["item", "spec"], {
            unique: false,
          });
        }

        // meta ストア作成
        if (!db.objectStoreNames.contains(STORES.META)) {
          db.createObjectStore(STORES.META, { keyPath: "key" });
        }
      };
    });
  }

  /**
   * レコードを一括追加
   * @param {Array} records - 追加するレコード配列
   * @returns {Promise<void>}
   */
  async function bulkAdd(records) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.RECORDS, "readwrite");
      const store = tx.objectStore(STORES.RECORDS);

      records.forEach((record) => store.add(record));

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * 全レコードを取得
   * @returns {Promise<Array>}
   */
  async function getAll() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.RECORDS, "readonly");
      const store = tx.objectStore(STORES.RECORDS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * レコード件数を取得
   * @returns {Promise<number>}
   */
  async function count() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.RECORDS, "readonly");
      const store = tx.objectStore(STORES.RECORDS);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * メタデータを取得
   * @param {string} key - メタデータキー
   * @returns {Promise<any>}
   */
  async function getMeta(key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.META, "readonly");
      const store = tx.objectStore(STORES.META);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result?.value ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * メタデータを設定
   * @param {string} key - メタデータキー
   * @param {any} value - 値
   * @returns {Promise<void>}
   */
  async function setMeta(key, value) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.META, "readwrite");
      const store = tx.objectStore(STORES.META);
      const request = store.put({ key, value });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 全レコードを削除（再投入用）
   * @returns {Promise<void>}
   */
  async function clearRecords() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.RECORDS, "readwrite");
      const store = tx.objectStore(STORES.RECORDS);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * インデックスを使った検索
   * @param {string} indexName - インデックス名
   * @param {IDBKeyRange|any} query - 検索条件
   * @returns {Promise<Array>}
   */
  async function searchByIndex(indexName, query) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.RECORDS, "readonly");
      const store = tx.objectStore(STORES.RECORDS);
      const index = store.index(indexName);
      const request = index.getAll(query);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Public API
  return {
    open,
    bulkAdd,
    getAll,
    count,
    getMeta,
    setMeta,
    clearRecords,
    searchByIndex,
    STORES,
  };
})();
