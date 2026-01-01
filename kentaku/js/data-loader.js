/**
 * =============================================================================
 * data-loader.js - データ読み込み管理モジュール
 * =============================================================================
 *
 * 概要:
 *   アプリケーション起動時のデータ読み込みを管理
 *   - 初回: data.js からIndexedDBに投入
 *   - 2回目以降: IndexedDBから直接読み込み
 *   - バージョン管理による差分更新対応
 *
 * 分類: アプリケーション層 (Application Layer)
 *
 * 依存関係:
 *   - db.js       : IndexedDB操作
 *   - data.js     : rawRecords（フォールバック/初期データ）
 *
 * =============================================================================
 */

const DataLoader = (function () {
  const META_KEYS = {
    DATA_VERSION: "dataVersion",
    RECORD_COUNT: "recordCount",
    LAST_UPDATED: "lastUpdated",
  };

  /**
   * データバージョンを計算（レコードのハッシュ）
   * @param {Array} records - レコード配列
   * @returns {string} バージョン文字列
   */
  function calculateVersion(records) {
    const count = records.length;
    const latestDate = records.reduce(
      (max, r) => (r.orderDate > max ? r.orderDate : max),
      "00000000"
    );
    return `v${count}_${latestDate}`;
  }

  /**
   * IndexedDBにデータが存在し、最新かどうかを確認
   * @returns {Promise<{needsUpdate: boolean, reason: string}>}
   */
  async function checkDataStatus() {
    try {
      const [storedVersion, storedCount] = await Promise.all([
        VendorQuoteDB.getMeta(META_KEYS.DATA_VERSION),
        VendorQuoteDB.count(),
      ]);

      // rawRecords が存在しない場合（将来のAPI化対応）
      if (typeof rawRecords === "undefined") {
        if (storedCount > 0) {
          return { needsUpdate: false, reason: "using_cached" };
        }
        throw new Error("No data source available");
      }

      const currentVersion = calculateVersion(rawRecords);

      // IndexedDBが空の場合
      if (storedCount === 0) {
        return { needsUpdate: true, reason: "empty_db" };
      }

      // バージョンが異なる場合
      if (storedVersion !== currentVersion) {
        return { needsUpdate: true, reason: "version_mismatch" };
      }

      return { needsUpdate: false, reason: "up_to_date" };
    } catch (error) {
      console.warn("DataLoader: Check failed, will reinitialize", error);
      return { needsUpdate: true, reason: "check_failed" };
    }
  }

  /**
   * rawRecordsをIndexedDBに投入
   * @returns {Promise<void>}
   */
  async function populateFromRawRecords() {
    if (typeof rawRecords === "undefined" || !rawRecords.length) {
      throw new Error("rawRecords is not available");
    }

    console.log(`DataLoader: Populating ${rawRecords.length} records...`);

    // 既存データをクリア
    await VendorQuoteDB.clearRecords();

    // データ投入
    await VendorQuoteDB.bulkAdd(rawRecords);

    // メタデータ更新
    const version = calculateVersion(rawRecords);
    await Promise.all([
      VendorQuoteDB.setMeta(META_KEYS.DATA_VERSION, version),
      VendorQuoteDB.setMeta(META_KEYS.RECORD_COUNT, rawRecords.length),
      VendorQuoteDB.setMeta(META_KEYS.LAST_UPDATED, new Date().toISOString()),
    ]);

    console.log(`DataLoader: Population complete. Version: ${version}`);
  }

  /**
   * データを読み込み（メインエントリーポイント）
   * @returns {Promise<Array>} レコード配列
   */
  async function loadData() {
    const startTime = performance.now();

    try {
      // IndexedDB対応チェック
      if (!window.indexedDB) {
        console.warn("DataLoader: IndexedDB not supported, using rawRecords");
        return rawRecords;
      }

      // DBを開く
      await VendorQuoteDB.open();

      // データ状態チェック
      const status = await checkDataStatus();
      console.log(`DataLoader: Status check - ${status.reason}`);

      // 必要に応じてデータ投入
      if (status.needsUpdate) {
        await populateFromRawRecords();
      }

      // IndexedDBからデータ取得
      const records = await VendorQuoteDB.getAll();

      const elapsed = (performance.now() - startTime).toFixed(2);
      console.log(
        `DataLoader: Loaded ${records.length} records in ${elapsed}ms`
      );

      return records;
    } catch (error) {
      console.error("DataLoader: Failed to load from IndexedDB", error);
      // フォールバック: rawRecordsを直接使用
      return typeof rawRecords !== "undefined" ? rawRecords : [];
    }
  }

  /**
   * 強制的にデータを再投入
   * @returns {Promise<void>}
   */
  async function forceRefresh() {
    await populateFromRawRecords();
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
    loadData,
    forceRefresh,
    getStats,
    checkDataStatus,
  };
})();
