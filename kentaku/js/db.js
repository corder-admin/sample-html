/**
 * =============================================================================
 * db.js - IndexedDB操作モジュール
 * =============================================================================
 *
 * 概要:
 *   Dexie.jsを使用したIndexedDBのCRUD操作を抽象化したモジュール
 * 分類: データアクセス層 (Data Access Layer)
 *
 * 依存関係: Dexie.js (CDN)
 *
 * =============================================================================
 */

const VendorQuoteDB = (function () {
  const STORES = {
    RECORDS: "records",
    META: "meta",
  };

  // Dexieインスタンス生成
  const db = new Dexie("VendorQuoteDB");

  // スキーマ定義（インデックス）
  // ++id: 自動インクリメント主キー
  // [item+spec]: 複合インデックス
  db.version(1).stores({
    records: "++id, region, vendor, item, majorCode, orderDate, [item+spec]",
    meta: "key",
  });

  /**
   * レコードを一括追加
   * @param {Array} records - 追加するレコード配列
   * @returns {Promise<void>}
   */
  async function bulkAdd(records) {
    return db.records.bulkAdd(records);
  }

  /**
   * 全レコードを取得
   * @returns {Promise<Array>}
   */
  async function getAll() {
    return db.records.toArray();
  }

  /**
   * レコード件数を取得
   * @returns {Promise<number>}
   */
  async function count() {
    return db.records.count();
  }

  /**
   * メタデータを取得
   * @param {string} key - メタデータキー
   * @returns {Promise<any>}
   */
  async function getMeta(key) {
    const row = await db.meta.get(key);
    return row?.value ?? null;
  }

  /**
   * メタデータを設定
   * @param {string} key - メタデータキー
   * @param {any} value - 値
   * @returns {Promise<void>}
   */
  async function setMeta(key, value) {
    return db.meta.put({ key, value });
  }

  /**
   * 全レコードを削除（再投入用）
   * @returns {Promise<void>}
   */
  async function clearRecords() {
    return db.records.clear();
  }

  /**
   * インデックスを使った検索
   * @param {string} indexName - インデックス名
   * @param {any} query - 検索条件
   * @returns {Promise<Array>}
   */
  async function searchByIndex(indexName, query) {
    return db.records.where(indexName).equals(query).toArray();
  }

  // Public API（既存のAPIシグネチャを維持）
  return {
    open: async () => db, // 互換性のため
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
