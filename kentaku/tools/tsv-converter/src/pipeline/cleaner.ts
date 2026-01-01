/**
 * データクレンジング
 */

import type { RawTsvRecord } from "../types/raw.js";
import type { CleanedRecord, RejectedRecord, ExclusionReason } from "../types/clean.js";
import {
  checkExclusion,
  normalizeWhitespace,
  parseNumber,
  parseInteger,
} from "../validators/rules.js";

/** クレンジング結果 */
export interface CleanResult {
  cleaned: CleanedRecord[];
  rejected: RejectedRecord[];
  stats: CleaningStats;
}

/** クレンジング統計 */
export interface CleaningStats {
  total: number;
  accepted: number;
  rejected: number;
  byReason: Record<ExclusionReason, number>;
}

/**
 * 生レコードをクレンジング
 */
export function cleanRecords(records: RawTsvRecord[]): CleanResult {
  const cleaned: CleanedRecord[] = [];
  const rejected: RejectedRecord[] = [];
  const byReason: Record<ExclusionReason, number> = {
    ZERO_QUANTITY: 0,
    NO_VENDOR: 0,
    INVALID_DATE: 0,
    ZERO_PRICE: 0,
    INVALID_DATA: 0,
  };

  for (let i = 0; i < records.length; i++) {
    const raw = records[i];
    const lineNumber = i + 2; // ヘッダー行 + 1-indexed

    // 除外判定
    const exclusion = checkExclusion(raw);
    if (exclusion.excluded && exclusion.reason) {
      byReason[exclusion.reason]++;
      rejected.push({
        lineNumber,
        reason: exclusion.reason,
        rawData: raw as unknown as Record<string, string>,
      });
      continue;
    }

    // データ変換
    try {
      const cleanedRecord = transformRecord(raw);
      cleaned.push(cleanedRecord);
    } catch {
      byReason.INVALID_DATA++;
      rejected.push({
        lineNumber,
        reason: "INVALID_DATA",
        rawData: raw as unknown as Record<string, string>,
      });
    }
  }

  return {
    cleaned,
    rejected,
    stats: {
      total: records.length,
      accepted: cleaned.length,
      rejected: rejected.length,
      byReason,
    },
  };
}

/**
 * 生レコードをクレンジング済みレコードに変換
 */
function transformRecord(raw: RawTsvRecord): CleanedRecord {
  return {
    region: normalizeWhitespace(raw.施工支店名),
    projectName: normalizeWhitespace(raw.工事名称),
    majorCode: raw["大工事項目ｺｰﾄﾞ"]?.trim() || "",
    item: normalizeWhitespace(raw.小工事項目名称),
    spec: normalizeWhitespace(raw.摘要),
    unit: normalizeWhitespace(raw.単位),
    qty: parseNumber(raw.実行数量),
    price: parseNumber(raw.実行単価),
    vendor: normalizeWhitespace(raw["業者名（漢字）"]),
    orderDate: raw.発注日?.trim() || "",
    floors: parseInteger(raw.地上階数),
    unitRow: parseInteger(raw.戸並び),
    resUnits: parseInteger(raw.居住用戸数),
    constArea: parseNumber(raw.施工面積),
    totalArea: parseNumber(raw.延床面積),
  };
}
