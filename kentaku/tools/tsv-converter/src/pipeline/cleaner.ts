/**
 * データクレンジング
 */

import type {
  CleanedRecord,
  ExclusionReason,
  RejectedRecord,
} from "../types/clean.js";
import type { RawTsvRecord } from "../types/raw.js";
import {
  checkExclusion,
  normalizeWhitespace,
  parseInteger,
  parseNumber,
} from "../validators/rules.js";

/** クレンジング統計 */
export interface CleaningStats {
  total: number;
  accepted: number;
  rejected: number;
  byReason: Record<ExclusionReason, number>;
}

/** クレンジング結果 */
export interface CleanResult {
  cleaned: CleanedRecord[];
  rejected: RejectedRecord[];
  stats: CleaningStats;
}

/** TSVヘッダー行を考慮した行番号オフセット */
const LINE_NUMBER_OFFSET = 2; // ヘッダー行 + 1-indexed

/**
 * 除外理由別のカウンターを初期化
 */
function initializeReasonCounts(): Record<ExclusionReason, number> {
  return {
    ZERO_QUANTITY: 0,
    NO_VENDOR: 0,
    INVALID_DATE: 0,
    ZERO_PRICE: 0,
    INVALID_DATA: 0,
  };
}

/**
 * 除外レコードを記録
 */
function recordRejection(
  rejected: RejectedRecord[],
  byReason: Record<ExclusionReason, number>,
  lineNumber: number,
  reason: ExclusionReason,
  rawData: RawTsvRecord
): void {
  byReason[reason]++;
  rejected.push({
    lineNumber,
    reason,
    rawData: rawData as unknown as Record<string, string>,
  });
}

/**
 * TSVレコード配列をクレンジング
 */
export function cleanRecords(records: RawTsvRecord[]): CleanResult {
  const cleaned: CleanedRecord[] = [];
  const rejected: RejectedRecord[] = [];
  const byReason = initializeReasonCounts();

  for (let i = 0; i < records.length; i++) {
    const raw = records[i];
    const lineNumber = i + LINE_NUMBER_OFFSET;

    // 除外判定
    const exclusion = checkExclusion(raw);
    if (exclusion.excluded && exclusion.reason) {
      recordRejection(rejected, byReason, lineNumber, exclusion.reason, raw);
      continue;
    }

    // データ変換
    try {
      const cleanedRecord = transformRecord(raw);
      cleaned.push(cleanedRecord);
    } catch {
      recordRejection(rejected, byReason, lineNumber, "INVALID_DATA", raw);
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
    region: normalizeWhitespace(raw.契約支店名),
    projectName: normalizeWhitespace(raw.工事名称),
    majorCode: raw["大工事項目ｺｰﾄﾞ"]?.trim() || "",
    minorCode: raw["小工事項目ｺｰﾄﾞ"]?.trim() || "",
    item: normalizeWhitespace(raw.小工事項目名称),
    spec: normalizeWhitespace(raw.摘要),
    unit: normalizeWhitespace(raw.単位),
    qty: parseNumber(raw.実行数量),
    price: parseNumber(raw.実行単価),
    amount: parseNumber(raw.実行予算金額),
    vendor: normalizeWhitespace(raw["業者名（漢字）"]),
    orderDate: raw.発注日?.trim() || "",
    floors: parseInteger(raw.地上階数),
    unitRow: parseInteger(raw.戸並び),
    resUnits: parseInteger(raw.居住用戸数),
    constArea: parseNumber(raw.施工面積),
    totalArea: parseNumber(raw.延床面積),
  };
}
