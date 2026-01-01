/**
 * =============================================================================
 * data-loader.js - データ読み込み管理モジュール
 * =============================================================================
 *
 * 概要:
 *   アプリケーション起動時のデータ読み込みを管理
 *   - data.json を fetch で非同期読み込み
 *   - メモリキャッシュで同一セッション内の再読み込みを高速化
 *
 * 分類: アプリケーション層 (Application Layer)
 *
 * 依存関係:
 *   - data.json   : JSON形式のレコードデータ
 *
 * =============================================================================
 */

const DataLoader = (function () {
  // 設定
  const CONFIG = {
    DATA_JSON_PATH: "data/data.json",
    DEBUG:
      location.hostname === "localhost" || location.hostname === "127.0.0.1",
  };

  // ==========================================================================
  // [開発用] データ削減フィルタ - 本番では ACTIVE_REGIONS を null に設定
  // 復元方法: ACTIVE_REGIONS = null; に変更するだけ
  // ==========================================================================
  const ACTIVE_REGIONS = [
    "千葉",
    "さいたま",
    "高松",
    "名古屋",
    "岐阜",
    "大分",
    "長野",
  ]; // 7地域 約17,000件 (26.6%)
  // const ACTIVE_REGIONS = null; // ← 本番用: 全データ使用

  // メモリキャッシュ
  let cachedRecords = null;

  /**
   * デバッグログ（本番環境では出力しない）
   */
  function log(...args) {
    if (CONFIG.DEBUG) console.log("DataLoader:", ...args);
  }

  /**
   * 地域フィルタを適用
   * @param {Array} records - 元のレコード配列
   * @returns {Array} フィルタ後のレコード配列
   */
  function applyRegionFilter(records) {
    if (!ACTIVE_REGIONS) {
      return records; // フィルタなし（本番モード）
    }
    const regionSet = new Set(ACTIVE_REGIONS);
    const filtered = records.filter((r) => regionSet.has(r.region));
    log(
      `Region filter applied: ${records.length} → ${filtered.length} records`
    );
    return filtered;
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

    let records = await response.json();
    log(
      `Fetched ${records.length} records in ${(
        performance.now() - startTime
      ).toFixed(0)}ms`
    );

    // 地域フィルタを適用
    records = applyRegionFilter(records);

    return records;
  }

  /**
   * データを読み込む（メインAPI）
   * @returns {Promise<Array>} レコード配列
   */
  async function loadData() {
    // メモリキャッシュがあれば返す
    if (cachedRecords) {
      log("Returning cached records");
      return cachedRecords;
    }

    const startTime = performance.now();

    // fetchでデータを取得
    cachedRecords = await fetchDataJson();

    log(`Total load time: ${(performance.now() - startTime).toFixed(0)}ms`);
    return cachedRecords;
  }

  /**
   * 強制的に再読み込み
   * @returns {Promise<Array>}
   */
  async function forceRefresh() {
    cachedRecords = null;
    return loadData();
  }

  /**
   * 統計情報を取得
   * @returns {Promise<Object>}
   */
  async function getStats() {
    return {
      count: cachedRecords?.length ?? 0,
      cached: cachedRecords !== null,
    };
  }

  // Public API
  return {
    loadData, // メインのデータ読み込み
    forceRefresh, // 強制再読み込み
    getStats, // 統計情報取得
  };
})();