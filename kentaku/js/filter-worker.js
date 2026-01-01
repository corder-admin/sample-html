/**
 * =============================================================================
 * filter-worker.js - フィルタ処理用 Web Worker
 * =============================================================================
 *
 * 概要:
 *   メインスレッドをブロックせずにフィルタ処理を実行するためのWeb Worker。
 *   Comlinkを使用してメインスレッドと通信します。
 *
 * 分類: ワーカー層 (Worker Layer)
 *
 * 依存関係:
 *   - Comlink (CDN経由でimportScripts)
 *
 * =============================================================================
 */

// Comlink をインポート
importScripts("https://unpkg.com/comlink@4.4.1/dist/umd/comlink.min.js");

/**
 * Check if a value is within range (inclusive)
 * @param {number} value - Value to check
 * @param {number|null} min - Minimum value (null = no limit)
 * @param {number|null} max - Maximum value (null = no limit)
 * @returns {boolean} True if in range
 */
function isInRange(value, min, max) {
  if (min !== null && value < min) return false;
  if (max !== null && value > max) return false;
  return true;
}

/**
 * Check if a record matches all filter criteria
 * @param {Object} record - Record to check
 * @param {Object} criteria - Filter criteria
 * @returns {boolean} True if record matches all criteria
 */
function recordMatchesFilters(record, criteria) {
  const { projectKw, regions, majorCodes, vendor, dateFrom, dateTo, ranges } =
    criteria;

  if (projectKw && !record.projectName.toLowerCase().includes(projectKw))
    return false;
  if (regions.length && !regions.includes(record.region)) return false;
  if (majorCodes.length && !majorCodes.includes(record.majorCode)) return false;
  if (vendor && !record.vendor.toLowerCase().includes(vendor)) return false;
  if (dateFrom && record.orderDate < dateFrom) return false;
  if (dateTo && record.orderDate > dateTo) return false;
  if (!isInRange(record.floors, ranges.floorMin, ranges.floorMax)) return false;
  if (!isInRange(record.unitRow, ranges.unitRowMin, ranges.unitRowMax))
    return false;
  if (!isInRange(record.resUnits, ranges.resUnitMin, ranges.resUnitMax))
    return false;
  if (!isInRange(record.constArea, ranges.constAreaMin, ranges.constAreaMax))
    return false;
  if (!isInRange(record.totalArea, ranges.totalAreaMin, ranges.totalAreaMax))
    return false;

  return true;
}

/**
 * Worker が提供するフィルタ処理関数群
 */
const filterWorker = {
  /**
   * アイテムグループに対してフィルタを適用
   * @param {Array} itemGroups - アイテムグループの配列
   * @param {Object} filters - フィルタ条件
   * @returns {Array} フィルタ済みグループの配列
   */
  applyFilters(itemGroups, filters) {
    const f = filters;
    const itemKw = f.item.toLowerCase();

    // Build filter criteria object
    const criteria = {
      projectKw: f.project.toLowerCase(),
      regions: f.regions,
      majorCodes: f.majorCodes,
      vendor: f.vendor.toLowerCase(),
      dateFrom: f.dateFrom.replace(/-/g, ""),
      dateTo: f.dateTo.replace(/-/g, ""),
      ranges: {
        floorMin: f.floorMin,
        floorMax: f.floorMax,
        unitRowMin: f.unitRowMin,
        unitRowMax: f.unitRowMax,
        resUnitMin: f.resUnitMin,
        resUnitMax: f.resUnitMax,
        constAreaMin: f.constAreaMin,
        constAreaMax: f.constAreaMax,
        totalAreaMin: f.totalAreaMin,
        totalAreaMax: f.totalAreaMax,
      },
    };

    const result = [];

    for (const g of itemGroups) {
      // Inline stats computation: avoid intermediate array allocation
      let min = Infinity;
      let max = -Infinity;
      const matchingRecords = [];

      for (const r of g.records) {
        if (recordMatchesFilters(r, criteria)) {
          matchingRecords.push(r);
          if (r.price < min) min = r.price;
          if (r.price > max) max = r.price;
        }
      }

      // Check item keyword filter
      if (
        itemKw &&
        !g.item.toLowerCase().includes(itemKw) &&
        !g.spec.toLowerCase().includes(itemKw)
      ) {
        continue;
      }

      if (matchingRecords.length === 0) {
        continue;
      }

      result.push({
        item: g.item,
        spec: g.spec,
        unit: g.unit,
        recordCount: g.recordCount,
        minPrice: matchingRecords.length > 0 ? min : 0,
        maxPrice: matchingRecords.length > 0 ? max : 0,
        avgPrice: g.avgPrice,
        filteredRecords: matchingRecords,
        vendorSummary: null, // Lazy computed
      });
    }

    // Sort by record count (descending)
    result.sort((a, b) => b.filteredRecords.length - a.filteredRecords.length);

    return result;
  },

  /**
   * ヘルスチェック（Workerが正常に動作しているか確認）
   * @returns {Object} ステータス情報
   */
  ping() {
    return { status: "ok", timestamp: Date.now() };
  },
};

// Comlink で関数をエクスポート
Comlink.expose(filterWorker);
