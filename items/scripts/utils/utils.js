/**
 * ユーティリティ関数
 */

import { companyColors } from "../../data/constants.js";

// ========================================
// データフォーマット関数
// ========================================

/**
 * 数値をカンマ区切りの文字列に変換
 * @param {number} n - フォーマットする数値
 * @returns {string} カンマ区切りの文字列（数値がnullの場合は"0"）
 */
export const fmt = (n) => (n ? n.toLocaleString() : "0");

/**
 * 日付を"YYYY-MM"形式から表示用に変換
 * @param {string} dateStr - "YYYY-MM"形式の日付文字列
 * @returns {object} { year: string, month: string }
 */
export const formatDate = (dateStr) => {
  const [year, month] = dateStr.split("-");
  return { year, month: parseInt(month) + "月" };
};

// ========================================
// 協力会社関連関数
// ========================================

/**
 * 協力会社名を正規化（"株式会社 "を除去）
 * @param {string} company - 協力会社名
 * @returns {string} 正規化された会社名
 */
export const normalizeCompanyName = (company) => {
  return company.replace("株式会社 ", "");
};

/**
 * 協力会社名に対応する色を取得
 * @param {string} company - 協力会社名
 * @returns {string} カラーコード（デフォルトは#6c757d）
 */
export const getCompanyColor = (company) => {
  const name = normalizeCompanyName(company);
  return companyColors[name] || "#6c757d";
};
