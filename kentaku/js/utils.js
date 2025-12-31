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

/**
 * Format number with locale string
 * @param {number} n - Number to format
 * @returns {string} Formatted number string
 */
const fmt = (n) => (n ? n.toLocaleString() : "0");

/**
 * Parse date string from YYYYMMDD to YYYY-MM-DD
 * @param {string} d - Date string in YYYYMMDD format
 * @returns {string} Formatted date string
 */
const parseDate = (d) =>
  d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : "";

/**
 * Parse numeric string to float
 * @param {string|number} s - String or number to parse
 * @returns {number} Parsed float value
 */
const parseNum = (s) => parseFloat(String(s).replace(/,/g, "")) || 0;

/**
 * Get ISO week number from date string
 * @param {string} dateStr - Date string in YYYYMMDD format
 * @returns {string} Week number in YYYY-Wxx format
 */
function getWeekNumber(dateStr) {
  const d = new Date(
    dateStr.slice(0, 4),
    parseInt(dateStr.slice(4, 6)) - 1,
    dateStr.slice(6, 8)
  );
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7
    );
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/**
 * Get week start date (Monday) from date string
 * @param {string} dateStr - Date string in YYYYMMDD format
 * @returns {string} Week start date in YYYY/MM/DD format
 */
function getWeekStartDate(dateStr) {
  const d = new Date(
    dateStr.slice(0, 4),
    parseInt(dateStr.slice(4, 6)) - 1,
    dateStr.slice(6, 8)
  );
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}/${String(d.getDate()).padStart(2, "0")}`;
}
