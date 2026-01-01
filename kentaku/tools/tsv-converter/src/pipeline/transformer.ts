/**
 * データ変換（追加の正規化・加工）
 */

import type { CleanedRecord } from "../types/clean.js";
import type { OutputRecord } from "../types/output.js";

/**
 * クレンジング済みレコードを出力形式に変換
 * （現在は1:1マッピングだが、将来の拡張に備えて分離）
 */
export function transformToOutput(records: CleanedRecord[]): OutputRecord[] {
  return records.map((record) => ({
    region: record.region,
    projectName: record.projectName,
    majorCode: record.majorCode,
    item: record.item,
    spec: record.spec,
    unit: record.unit,
    qty: record.qty,
    price: record.price,
    vendor: record.vendor,
    orderDate: record.orderDate,
    floors: record.floors,
    unitRow: record.unitRow,
    resUnits: record.resUnits,
    constArea: record.constArea,
    totalArea: record.totalArea,
  }));
}

/**
 * レコードを発注日でソート（新しい順）
 */
export function sortByOrderDate(
  records: OutputRecord[],
  descending = true
): OutputRecord[] {
  return [...records].sort((a, b) => {
    const dateA = a.orderDate;
    const dateB = b.orderDate;
    return descending ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
  });
}

/**
 * 重複レコードを除去
 * （同一の工事名称・品目・業者・発注日の組み合わせ）
 */
export function deduplicateRecords(records: OutputRecord[]): {
  unique: OutputRecord[];
  duplicateCount: number;
} {
  const seen = new Set<string>();
  const unique: OutputRecord[] = [];
  let duplicateCount = 0;

  for (const record of records) {
    const key = `${record.projectName}|${record.item}|${record.vendor}|${record.orderDate}|${record.qty}|${record.price}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(record);
    } else {
      duplicateCount++;
    }
  }

  return { unique, duplicateCount };
}
