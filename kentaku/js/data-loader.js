/**
 * =============================================================================
 * data-loader.js - データ読み込み管理モジュール
 * =============================================================================
 *
 * 概要:
 *   アプリケーション起動時のデータ読み込みを管理
 *   - 初回: data.json を fetch で非同期読み込み → IndexedDBに投入
 *   - 2回目以降: IndexedDBから直接読み込み
 *   - バージョン管理による差分更新対応
 *
 * 分類: アプリケーション層 (Application Layer)
 *
 * 依存関係:
 *   - db.js       : IndexedDB操作
 *   - data.json   : JSON形式のレコードデータ
 *
 * =============================================================================
 */

const DataLoader = (function () {
  const META_KEYS = {
    DATA_VERSION: "dataVersion",
    RECORD_COUNT: "recordCount",
    LAST_UPDATED: "lastUpdated",
  };

  // 設定
  const CONFIG = {
    DATA_JSON_PATH: "data/data.json",
    DEBUG:
      location.hostname === "localhost" || location.hostname === "127.0.0.1",
  };

  // キャッシュ
  let cachedRecords = null;

  /**
   * デバッグログ（本番環境では出力しない）
   */
  function log(...args) {
    if (CONFIG.DEBUG) console.log("DataLoader:", ...args);
  }

  /**
   * データバージョンを計算
   * @param {Array} records - レコード配列
   * @returns {string} バージョン文字列
   */
  function calculateVersion(records) {
    const count = records.length;
    let latestDate = "00000000";
    for (let i = 0; i < count; i++) {
      const date = records[i].orderDate;
      if (date > latestDate) latestDate = date;
    }
    return `v${count}_${latestDate}`;
  }

  /**
   * data.jsonをfetchで読み込み
   * @returns {Promise<Array>} レコード配列
   */
  async function fetchDataJson() {
    log("Fetching data.json...");
    const startTime = performance.now();

    const response = await fetch(CONFIG.DATA_JSON_PATH);
    if (!response.ok) {
      throw new Error(`Failed to fetch data.json: ${response.status}`);
    }

    const records = await response.json();
    log(
      `Fetched ${records.length} records in ${(
        performance.now() - startTime
      ).toFixed(0)}ms`
    );

    return records;
  }

  /**
   * IndexedDBにデータを投入
   * @param {Array} records - レコード配列
   * @returns {Promise<void>}
   */
  async function populateIndexedDB(records) {
    log(`Populating IndexedDB with ${records.length} records...`);
    const startTime = performance.now();

    await VendorQuoteDB.clearRecords();
    await VendorQuoteDB.bulkAdd(records);

    const version = calculateVersion(records);

    await Promise.all([
      VendorQuoteDB.setMeta(META_KEYS.DATA_VERSION, version),
      VendorQuoteDB.setMeta(META_KEYS.RECORD_COUNT, records.length),
      VendorQuoteDB.setMeta(META_KEYS.LAST_UPDATED, new Date().toISOString()),
    ]);

    log(
      `IndexedDB populated in ${(performance.now() - startTime).toFixed(0)}ms`
    );
  }

  /**
   * データを読み込む（メインAPI）
   * - IndexedDBにデータがあればそこから読み込み
   * - なければdata.jsonをfetchして投入
   * @returns {Promise<Array>} レコード配列
   */
  async function loadData() {
    // キャッシュがあれば返す
    if (cachedRecords) {
      log("Returning cached records");
      return cachedRecords;
    }

    const startTime = performance.now();

    // IndexedDBの状態を確認
    const storedCount = await VendorQuoteDB.count();

    if (storedCount > 0) {
      // IndexedDBからデータを取得
      log(`Loading ${storedCount} records from IndexedDB...`);
      cachedRecords = await VendorQuoteDB.getAll();
      log(
        `Loaded from IndexedDB in ${(performance.now() - startTime).toFixed(
          0
        )}ms`
      );
      return cachedRecords;
    }

    // 初回: data.jsonを取得してIndexedDBに投入
    log("Initial load: fetching data.json...");
    const records = await fetchDataJson();

    // キャッシュに保持（UIは先に表示可能）
    cachedRecords = records;

    // バックグラウンドでIndexedDBに投入（次回以降のために）
    populateIndexedDB(records).catch((error) => {
      console.warn("Failed to populate IndexedDB:", error);
    });

    log(`Total load time: ${(performance.now() - startTime).toFixed(0)}ms`);
    return cachedRecords;
  }

  /**
   * 強制的にdata.jsonから再読み込み
   * @returns {Promise<Array>}
   */
  async function forceRefresh() {
    cachedRecords = null;
    await VendorQuoteDB.clearRecords();
    return loadData();
  }

  /**
   * データベース統計情報を取得
   * @returns {Promise<Object>}
   */
  async function getStats() {
    const [count, version, lastUpdated] = await Promise.all([
      VendorQuoteDB.count(),
      VendorQuoteDB.getMeta(META_KEYS.DATA_VERSION),
      VendorQuoteDB.getMeta(META_KEYS.LAST_UPDATED),
    ]);
    return { count, version, lastUpdated };
  }

  // Public API
  return {
    loadData, // メインのデータ読み込み
    forceRefresh, // 強制再読み込み
    getStats, // 統計情報取得
  };
})();
