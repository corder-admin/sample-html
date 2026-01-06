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

/** Regular expression for YYYYMMDD date format validation */
const DATE_YYYYMMDD_REGEX = /^\d{8}$/;

/**
 * IQR outlier detection multiplier (Tukey's fence)
 * Standard statistical practice: Q1 - 1.5×IQR and Q3 + 1.5×IQR
 */
const IQR_OUTLIER_MULTIPLIER = 1.5;

// =============================================================================
// Number Formatting
// =============================================================================

/**
 * Format number with locale string (comma-separated)
 * @param {number} value - Number to format
 * @returns {string} Formatted number string
 */
function formatNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "0";
  }
  // Handle negative zero: Object.is(-0, value) returns true for -0
  if (value === 0) {
    return "0";
  }
  return value.toLocaleString();
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
  // Validate format: must be exactly 8 digits
  if (!dateStr || !DATE_YYYYMMDD_REGEX.test(dateStr)) {
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
 * Find minimum and maximum values in an array (single-pass O(n))
 * @param {number[]} values - Array of numeric values
 * @returns {{min: number, max: number}} Min and max values
 */
function findMinMax(values) {
  if (!values || values.length === 0) {
    return { min: 0, max: 0 };
  }

  let min = values[0];
  let max = values[0];

  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }

  return { min, max };
}

/**
 * Calculate price statistics from an array of prices
 * @param {number[]} prices - Array of price values
 * @returns {{min: number, max: number, avg: number}} Statistics object
 */
function calcPriceStats(prices) {
  if (!prices || prices.length === 0) {
    return { min: 0, max: 0, avg: 0 };
  }

  // Use extracted findMinMax for DRY compliance
  const { min, max } = findMinMax(prices);

  // Calculate sum in the same pass
  let sum = 0;
  for (let i = 0; i < prices.length; i++) {
    sum += prices[i];
  }

  return { min, max, avg: Math.round(sum / prices.length) };
}

/**
 * Calculate median from an array of numbers
 * @param {number[]} values - Array of numeric values
 * @returns {number} Median value
 */
function calcMedian(values) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Calculate moving average
 * @param {number[]} data - Array of values
 * @param {number} window - Window size
 * @returns {number[]} Moving average array (null for insufficient data points)
 */
function calcMovingAverage(data, window) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < window - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < window; j++) {
        sum += data[i - j];
      }
      result.push(Math.round(sum / window));
    }
  }
  return result;
}

/**
 * Group records by time unit (year, month, week, day)
 * @param {Array} records - Records to group
 * @param {string} unit - 'yearly' | 'monthly' | 'weekly' | 'daily'
 * @returns {Object} Grouped records { key: records[] }
 */
function groupByTimeUnit(records, unit) {
  const keyFn = {
    yearly: (r) => r.orderDate.slice(0, 4),
    monthly: (r) => r.orderMonth,
    weekly: (r) => r.orderWeekStart,
    daily: (r) => r.orderDateFormatted,
  }[unit];
  return groupRecordsBy(records, keyFn);
}

/**
 * Calculate boxplot statistics (quartiles, whiskers, outliers)
 * @param {number[]} values - Array of numeric values
 * @returns {{min: number, q1: number, median: number, q3: number, max: number, outliers: number[]}}
 */
function calcBoxplotStats(values) {
  if (!values || values.length === 0) {
    return { min: 0, q1: 0, median: 0, q3: 0, max: 0, outliers: [] };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  // 線形補間法による四分位数計算（NumPy, R, Pandas標準）
  const calcPercentile = (p) => {
    const pos = (n - 1) * p;
    const lower = Math.floor(pos);
    const upper = Math.ceil(pos);
    const weight = pos - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  };

  const q1 = calcPercentile(0.25);
  const median = calcPercentile(0.5);
  const q3 = calcPercentile(0.75);
  const iqr = q3 - q1;

  const lowerFence = q1 - IQR_OUTLIER_MULTIPLIER * iqr;
  const upperFence = q3 + IQR_OUTLIER_MULTIPLIER * iqr;

  const outliers = sorted.filter((v) => v < lowerFence || v > upperFence);
  const min = sorted.find((v) => v >= lowerFence) || sorted[0];
  const max =
    [...sorted].reverse().find((v) => v <= upperFence) || sorted[n - 1];

  return { min, q1, median, q3, max, outliers };
}

/**
 * Calculate Pearson correlation coefficient between two arrays
 * @param {number[]} x - First array of values
 * @param {number[]} y - Second array of values
 * @returns {number|null} Correlation coefficient (-1 to 1), or null if calculation fails
 */
function calcCorrelation(x, y) {
  if (!x || !y || x.length === 0 || y.length !== x.length) {
    return null;
  }

  const n = x.length;

  // Calculate means
  const meanX = x.reduce((sum, val) => sum + val, 0) / n;
  const meanY = y.reduce((sum, val) => sum + val, 0) / n;

  // Calculate numerator and denominators
  let numerator = 0;
  let sumSquaredX = 0;
  let sumSquaredY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    sumSquaredX += dx * dx;
    sumSquaredY += dy * dy;
  }

  // Avoid division by zero
  const denominator = Math.sqrt(sumSquaredX * sumSquaredY);
  if (denominator === 0) {
    return null;
  }

  return numerator / denominator;
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

  // Use extracted findMinMax for DRY compliance
  const { min, max } = findMinMax(values);

  const range = max - min;
  const step = range / bucketCount || 1;

  const buckets = Array(bucketCount).fill(0);
  const labels = [];

  for (let i = 0; i < bucketCount; i++) {
    const low = min + step * i;
    labels.push(`¥${formatNumber(Math.round(low))}~`);
  }

  // Bucket assignment pass
  for (let i = 0; i < values.length; i++) {
    const idx =
      range === 0
        ? 0
        : Math.min(Math.floor((values[i] - min) / step), bucketCount - 1);
    buckets[idx]++;
  }

  return { labels, counts: buckets };
}
