/**
 * ユーティリティ関数
 */

// ========================================
// データフォーマット関数
// ========================================

/**
 * 数値をカンマ区切りの文字列に変換
 * @param {number|null|undefined} value - フォーマットする数値
 * @returns {string} カンマ区切りの文字列（無効な値の場合は"0"）
 */
export const formatNumber = (value) => {
  if (value == null || Number.isNaN(value)) {
    return "0";
  }
  return Number(value).toLocaleString();
};

/** @deprecated formatNumber を使用してください */
export const fmt = formatNumber;

/**
 * 日付を"YYYY-MM"形式から表示用に変換
 * @param {string} dateStr - "YYYY-MM"形式の日付文字列
 * @returns {{ year: string, month: string }} 年と月を含むオブジェクト
 */
export const formatDate = (dateStr) => {
  if (!dateStr || typeof dateStr !== "string") {
    return { year: "", month: "" };
  }
  const parts = dateStr.split("-");
  if (parts.length < 2) {
    return { year: dateStr, month: "" };
  }
  const [year, month] = parts;
  return { year, month: parseInt(month, 10) + "月" };
};

// ========================================
// 協力会社関連関数
// ========================================

/**
 * 協力会社名を正規化（"株式会社"と前後の空白を除去）
 * @param {string} company - 協力会社名
 * @returns {string} 正規化された会社名
 */
export const normalizeCompanyName = (company) => {
  if (!company || typeof company !== "string") {
    return "";
  }
  return company.replace(/株式会社\s*/g, "").trim();
};

// ========================================
// 統計計算関数
// ========================================

/**
 * 数値配列の統計情報を計算
 * @param {number[]} values - 数値の配列
 * @returns {{ min: number, max: number, avg: number, sum: number }} 統計情報
 */
export const calculateArrayStats = (values) => {
  if (!values || values.length === 0) {
    return { min: 0, max: 0, avg: 0, sum: 0 };
  }
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: Math.round(sum / values.length),
    sum,
  };
};
