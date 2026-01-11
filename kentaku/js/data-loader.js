/**
 * =============================================================================
 * data-loader.js - データ読み込み管理モジュール
 * =============================================================================
 *
 * 概要:
 *   アプリケーション起動時のデータ読み込みを管理
 *   - data.json.gz (gzip圧縮) を読み込み、pako で展開
 *   - メモリキャッシュで同一セッション内の再読み込みを高速化
 *
 * 分類: アプリケーション層 (Application Layer)
 *
 * 依存関係:
 *   - pako          : gzip展開ライブラリ (CDN)
 *   - data.json.gz  : gzip圧縮されたJSONデータ
 *
 * =============================================================================
 */

const DataLoader = (function () {
  // 設定
  const CONFIG = {
    DATA_GZIP_PATH: "data/data.json.gz",
    DEBUG:
      location.hostname === "localhost" || location.hostname === "127.0.0.1",
  };

  // ==========================================================================
  // [開発用] データ削減フィルタ - 本番では ACTIVE_REGIONS を null に設定
  // 復元方法: ACTIVE_REGIONS = null; に変更するだけ
  // ==========================================================================
  // const ACTIVE_REGIONS = [
  //   "千葉",
  //   "さいたま",
  //   "高松",
  //   "名古屋",
  //   "岐阜",
  //   "大分",
  //   "長野",
  // ]; // 7地域 約17,000件 (26.6%)
  const ACTIVE_REGIONS = null; // ← 本番用: 全データ使用

  // [Performance] Set を事前生成して applyRegionFilter での繰り返し生成を回避
  const REGION_SET = ACTIVE_REGIONS ? new Set(ACTIVE_REGIONS) : null;

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
    if (!REGION_SET) {
      return records; // フィルタなし（本番モード）
    }
    const filtered = records.filter((r) => REGION_SET.has(r.region));
    log(
      `Region filter applied: ${records.length} → ${filtered.length} records`
    );
    return filtered;
  }

  /**
   * gzip圧縮されたデータを読み込み・展開
   * @returns {Promise<Array>} レコード配列
   */
  async function fetchData() {
    log("Fetching gzip data...");

    // [Performance] 時間計測はデバッグ時のみ実行
    const startTime = CONFIG.DEBUG ? performance.now() : 0;

    // pako が必要
    if (typeof pako === "undefined") {
      throw new Error("pako library is required for gzip decompression");
    }

    const response = await fetch(CONFIG.DATA_GZIP_PATH);
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.status}`);
    }

    const compressedData = await response.arrayBuffer();
    const compressedSize = compressedData.byteLength;

    // pako で gzip 展開
    const decompressStart = CONFIG.DEBUG ? performance.now() : 0;
    const decompressed = pako.inflate(new Uint8Array(compressedData), {
      to: "string",
    });
    const decompressTime = CONFIG.DEBUG
      ? performance.now() - decompressStart
      : 0;

    // JSON パース
    const parseStart = CONFIG.DEBUG ? performance.now() : 0;
    let records = JSON.parse(decompressed);
    const parseTime = CONFIG.DEBUG ? performance.now() - parseStart : 0;

    if (CONFIG.DEBUG) {
      const totalTime = performance.now() - startTime;
      log(
        `Gzip: ${(compressedSize / 1024).toFixed(1)}KB → ${
          records.length
        } records`
      );
      log(
        `Times: fetch=${(decompressStart - startTime).toFixed(
          0
        )}ms, decompress=${decompressTime.toFixed(
          0
        )}ms, parse=${parseTime.toFixed(0)}ms, total=${totalTime.toFixed(0)}ms`
      );
    }

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

    const startTime = CONFIG.DEBUG ? performance.now() : 0;

    // fetchでデータを取得
    cachedRecords = await fetchData();

    if (CONFIG.DEBUG) {
      log(`Total load time: ${(performance.now() - startTime).toFixed(0)}ms`);
    }
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
