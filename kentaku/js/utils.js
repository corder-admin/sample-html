/**
 * =============================================================================
 * utils.js - ユーティリティ関数モジュール
 * =============================================================================
 *
 * 概要:
 *   アプリケーション全体で使用される汎用ユーティリティ関数を提供します。
 *   数値フォーマット、日付パース、週番号計算などの純粋関数を含みます。
 *
 * 分類: ユーティリティ層 (Utility Layer)
 *
 * =============================================================================
 */

// =============================================================================
// Constants
// =============================================================================

/** Milliseconds in one day (24 * 60 * 60 * 1000) */
const MILLISECONDS_PER_DAY = 86400000;

// =============================================================================
// Number Formatting
// =============================================================================

/**
 * Format number with locale string (comma-separated)
 * @param {number} value - Number to format
 * @returns {string} Formatted number string
 */
function formatNumber(value) {
  return value ? value.toLocaleString() : "0";
}

/**
 * Parse numeric string to float, removing commas
 * @param {string|number} value - String or number to parse
 * @returns {number} Parsed float value
 */
function parseNumber(value) {
  return parseFloat(String(value).replace(/,/g, "")) || 0;
}

// =============================================================================
// Date Parsing
// =============================================================================

/**
 * Parse YYYYMMDD string to Date object
 * @param {string} dateStr - Date string in YYYYMMDD format
 * @returns {Date|null} Parsed Date object or null if invalid
 */
function parseDateString(dateStr) {
  if (!dateStr || dateStr.length !== 8) {
    return null;
  }
  const year = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(4, 6), 10) - 1;
  const day = parseInt(dateStr.slice(6, 8), 10);

  const date = new Date(year, month, day);
  date.setHours(0, 0, 0, 0);

  // Validate the date is real (e.g., not Feb 30)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * Format date string from YYYYMMDD to YYYY-MM-DD
 * @param {string} dateStr - Date string in YYYYMMDD format
 * @returns {string} Formatted date string or empty string if invalid
 */
function formatDateHyphen(dateStr) {
  if (!dateStr || dateStr.length !== 8) {
    return "";
  }
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

// =============================================================================
// Week Calculations
// =============================================================================

/**
 * Get ISO week number from date string
 * @param {string} dateStr - Date string in YYYYMMDD format
 * @returns {string} Week number in YYYY-Wxx format or empty string if invalid
 */
function getWeekNumber(dateStr) {
  const date = parseDateString(dateStr);
  if (!date) {
    return "";
  }

  // Adjust to Thursday of the current week (ISO week definition)
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));

  // January 4th is always in week 1
  const week1 = new Date(date.getFullYear(), 0, 4);

  const weekNum =
    1 +
    Math.round(
      ((date.getTime() - week1.getTime()) / MILLISECONDS_PER_DAY -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7
    );

  return `${date.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/**
 * Get week start date (Monday) from date string
 * @param {string} dateStr - Date string in YYYYMMDD format
 * @returns {string} Week start date in YYYY/MM/DD format or empty string if invalid
 */
function getWeekStartDate(dateStr) {
  const date = parseDateString(dateStr);
  if (!date) {
    return "";
  }

  const dayOfWeek = date.getDay();
  // Calculate offset to Monday (Sunday = 0, so offset by -6; other days offset by 1 - dayOfWeek)
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  date.setDate(date.getDate() + offsetToMonday);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}/${month}/${day}`;
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Calculate price statistics from an array of prices
 * @param {number[]} prices - Array of price values
 * @returns {{min: number, max: number, avg: number}} Statistics object
 */
function calcPriceStats(prices) {
  if (!prices || prices.length === 0) {
    return { min: 0, max: 0, avg: 0 };
  }
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = Math.round(
    prices.reduce((sum, price) => sum + price, 0) / prices.length
  );
  return { min, max, avg };
}

// =============================================================================
// Range Checking
// =============================================================================

/**
 * Check if a value is within a specified range (inclusive)
 * @param {number} value - Value to check
 * @param {number|null} min - Minimum bound (null means no lower bound)
 * @param {number|null} max - Maximum bound (null means no upper bound)
 * @returns {boolean} True if value is within range
 */
function isInRange(value, min, max) {
  const lowerBound = min ?? -Infinity;
  const upperBound = max ?? Infinity;
  return value >= lowerBound && value <= upperBound;
}

// =============================================================================
// Grouping Utilities
// =============================================================================

/**
 * Group records by a specified field or key function
 * @param {Array} records - Records to group
 * @param {string|Function} keyFn - Field name or function to extract key
 * @returns {Object} Grouped records { key: records[] }
 */
function groupRecordsBy(records, keyFn) {
  const groups = {};
  records.forEach((r) => {
    const key = typeof keyFn === "function" ? keyFn(r) : r[keyFn];
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });
  return groups;
}

/**
 * Create building info composite key from record
 * @param {Object} record - Record with floors, unitRow, resUnits
 * @returns {string} Composite key like "2階/4戸並/8戸"
 */
function buildingInfoKey(record) {
  return `${record.floors}階/${record.unitRow}戸並/${record.resUnits}戸`;
}

/**
 * Generate distribution buckets for histogram
 * @param {number[]} values - Array of numeric values
 * @param {number} bucketCount - Number of buckets (default: 10)
 * @returns {{labels: string[], counts: number[]}} Distribution data
 */
function createDistribution(values, bucketCount = 10) {
  if (!values || values.length === 0) {
    return { labels: [], counts: [] };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const step = range / bucketCount || 1;

  const buckets = Array(bucketCount).fill(0);
  const labels = [];

  for (let i = 0; i < bucketCount; i++) {
    const low = min + step * i;
    labels.push(`¥${formatNumber(Math.round(low))}~`);
  }

  values.forEach((v) => {
    const idx =
      range === 0 ? 0 : Math.min(Math.floor((v - min) / step), bucketCount - 1);
    buckets[idx]++;
  });

  return { labels, counts: buckets };
}
