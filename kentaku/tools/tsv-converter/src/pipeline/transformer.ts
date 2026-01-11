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
    minorCode: record.minorCode,
    item: record.item,
    spec: record.spec,
    unit: record.unit,
    qty: record.qty,
    price: record.price,
    amount: record.amount,
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
 * 集約結果の統計情報
 */
export interface AggregationStats {
  beforeCount: number;
  afterCount: number;
  aggregatedGroups: number;
}

/**
 * グループ化キーを生成
 */
function createAggregationKey(record: CleanedRecord): string {
  return `${record.region}|${record.projectName}|${record.vendor}|${record.orderDate}|${record.minorCode}`;
}

/**
 * 複数レコードを1つに集約
 */
function aggregateGroup(group: CleanedRecord[]): CleanedRecord {
  const base = group[0];
  const totalQty = group.reduce((sum, r) => sum + r.qty, 0);
  const totalAmount = group.reduce((sum, r) => sum + r.amount, 0);
  const recalculatedPrice =
    totalQty > 0 ? Math.round(totalAmount / totalQty) : 0;

  // 摘要（spec）は結合（重複除去）
  const specs = [...new Set(group.map((r) => r.spec).filter(Boolean))];

  return {
    ...base,
    qty: totalQty,
    amount: totalAmount,
    price: recalculatedPrice,
    spec: specs.join("／"),
  };
}

/**
 * 同一キー（契約支店+工事名+業者+発注日+小工事項目コード）のレコードを集約
 * - 実行数量（qty）と実行予算金額（amount）を合算
 * - 実行単価（price）を再計算（amount / qty）
 */
export function aggregateByMinorCode(records: CleanedRecord[]): {
  aggregated: CleanedRecord[];
  stats: AggregationStats;
} {
  // グループ化キー: region + projectName + vendor + orderDate + minorCode
  const groups = new Map<string, CleanedRecord[]>();

  for (const record of records) {
    const key = createAggregationKey(record);
    const group = groups.get(key);
    if (group) {
      group.push(record);
    } else {
      groups.set(key, [record]);
    }
  }

  const aggregated: CleanedRecord[] = [];
  let aggregatedGroups = 0;

  for (const group of groups.values()) {
    if (group.length === 1) {
      // 単一レコードはそのまま
      aggregated.push(group[0]);
    } else {
      // 複数レコードを集約
      aggregatedGroups++;
      aggregated.push(aggregateGroup(group));
    }
  }

  return {
    aggregated,
    stats: {
      beforeCount: records.length,
      afterCount: aggregated.length,
      aggregatedGroups,
    },
  };
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
 * （同一の工事名称・品目・業者・発注日・数量・単価の組み合わせ）
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
