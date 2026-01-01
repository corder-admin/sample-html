/**
 * data.js出力
 */

import { writeFile } from "node:fs/promises";
import type { RejectedRecord } from "../types/clean.js";
import type { OutputRecord } from "../types/output.js";

/** data.jsのヘッダーコメント */
const DATA_JS_HEADER = `/**
 * =============================================================================
 * data.js - データ定義モジュール
 * =============================================================================
 *
 * 概要:
 *   業者見積データベースの生データ（rawRecords）を定義します。
 *   各レコードは建設プロジェクトの見積情報を含みます。
 *
 * 分類: データ層 (Data Layer)
 *
 * データ構造:
 *   rawRecords[] - 見積レコードの配列
 *     - region      : 支店名（厚木、横浜、高崎、春日部、つくば）
 *     - projectName : 工事名称
 *     - majorCode   : 大工事項目コード
 *     - item        : 品目名
 *     - spec        : 仕様
 *     - unit        : 単位（台、㎡、枚など）
 *     - qty         : 数量
 *     - price       : 単価（円）
 *     - vendor      : 業者名
 *     - orderDate   : 発注日（YYYYMMDD形式）
 *     - floors      : 地上階数
 *     - unitRow     : 戸並び
 *     - resUnits    : 居住用戸数
 *     - constArea   : 施工面積（㎡）
 *     - totalArea   : 延床面積（㎡）
 *
 * 自動生成: tsv-converter により生成
 * 生成日時: ${new Date().toISOString()}
 * =============================================================================
 */

`;

/**
 * レコードをdata.js形式のJavaScript文字列に変換
 */
function formatRecord(record: OutputRecord, indent: string): string {
  const lines = [
    `${indent}{`,
    `${indent}  region: ${JSON.stringify(record.region)},`,
    `${indent}  projectName: ${JSON.stringify(record.projectName)},`,
    `${indent}  majorCode: ${JSON.stringify(record.majorCode)},`,
    `${indent}  item: ${JSON.stringify(record.item)},`,
    `${indent}  spec: ${JSON.stringify(record.spec)},`,
    `${indent}  unit: ${JSON.stringify(record.unit)},`,
    `${indent}  qty: ${record.qty},`,
    `${indent}  price: ${record.price},`,
    `${indent}  vendor: ${JSON.stringify(record.vendor)},`,
    `${indent}  orderDate: ${JSON.stringify(record.orderDate)},`,
    `${indent}  floors: ${record.floors},`,
    `${indent}  unitRow: ${record.unitRow},`,
    `${indent}  resUnits: ${record.resUnits},`,
    `${indent}  constArea: ${record.constArea},`,
    `${indent}  totalArea: ${record.totalArea},`,
    `${indent}}`,
  ];
  return lines.join("\n");
}

/**
 * data.jsファイルを出力
 */
export async function writeDataJs(
  outputPath: string,
  records: OutputRecord[]
): Promise<void> {
  const recordStrings = records.map((r) => formatRecord(r, "  "));
  const content = `${DATA_JS_HEADER}const rawRecords = [\n${recordStrings.join(",\n")},\n];\n`;

  await writeFile(outputPath, content, "utf-8");
}

/**
 * 除外レコードをJSONファイルに出力
 */
export async function writeRejectedRecords(
  outputPath: string,
  rejected: RejectedRecord[]
): Promise<void> {
  const content = JSON.stringify(rejected, null, 2);
  await writeFile(outputPath, content, "utf-8");
}

/**
 * data.jsonファイルを出力
 * - JavaScriptのパース不要でfetch + JSON.parseで読み込み可能
 * - 初回アクセス時のパフォーマンス改善
 */
export async function writeDataJson(
  outputPath: string,
  records: OutputRecord[]
): Promise<void> {
  const content = JSON.stringify(records);
  await writeFile(outputPath, content, "utf-8");
}
