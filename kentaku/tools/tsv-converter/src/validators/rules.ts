/**
 * クレンジングルール定義
 */

import type { RawTsvRecord } from "../types/raw.js";
import type { ExclusionReason } from "../types/clean.js";

/** 除外判定結果 */
export interface ExclusionResult {
  excluded: boolean;
  reason?: ExclusionReason;
}

/**
 * 除外ルール: 実行数量が0または空
 */
export function isZeroQuantity(record: RawTsvRecord): boolean {
  const qty = parseFloat(record.実行数量?.replace(/,/g, "") || "0");
  return qty === 0 || isNaN(qty);
}

/**
 * 除外ルール: 業者名がない
 */
export function hasNoVendor(record: RawTsvRecord): boolean {
  const vendor = record["業者名（漢字）"]?.trim();
  const vendorCode = record.業者基本コード?.trim();
  return !vendor || vendor === "" || vendorCode === "NULL" || vendorCode === "";
}

/**
 * 除外ルール: 発注日が無効
 */
export function hasInvalidDate(record: RawTsvRecord): boolean {
  const date = record.発注日?.trim();
  if (!date || date === "0") return true;
  return !/^\d{8}$/.test(date);
}

/**
 * 除外ルール: 実行単価が0
 */
export function isZeroPrice(record: RawTsvRecord): boolean {
  const price = parseFloat(record.実行単価?.replace(/,/g, "") || "0");
  return price === 0 || isNaN(price);
}

/**
 * すべての除外ルールを適用
 */
export function checkExclusion(record: RawTsvRecord): ExclusionResult {
  // 優先順位順に判定
  if (isZeroQuantity(record)) {
    return { excluded: true, reason: "ZERO_QUANTITY" };
  }
  if (hasNoVendor(record)) {
    return { excluded: true, reason: "NO_VENDOR" };
  }
  if (hasInvalidDate(record)) {
    return { excluded: true, reason: "INVALID_DATE" };
  }
  // 注: ZERO_PRICEはコメントアウト（0円の正当な発注もありうるため）
  // if (isZeroPrice(record)) {
  //   return { excluded: true, reason: "ZERO_PRICE" };
  // }

  return { excluded: false };
}

/**
 * 変換ルール: 全角・半角スペースをトリムして正規化
 */
export function normalizeWhitespace(value: string | undefined): string {
  if (!value) return "";
  // 全角・半角スペースを削除して両端をトリム
  return value.replace(/[\s\u3000]+/g, " ").trim();
}

/**
 * 変換ルール: カンマ区切り数値をパース
 */
export function parseNumber(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/,/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * 変換ルール: 整数としてパース
 */
export function parseInteger(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/,/g, "").trim();
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}
