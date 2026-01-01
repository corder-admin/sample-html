/**
 * 出力データ型定義（data.js形式）
 */

/** data.jsに出力するレコード形式 */
export interface OutputRecord {
  region: string;
  projectName: string;
  majorCode: string;
  minorCode: string; // 小工事項目コード
  item: string;
  spec: string;
  unit: string;
  qty: number;
  price: number;
  amount: number; // 実行予算金額
  vendor: string;
  orderDate: string;
  floors: number;
  unitRow: number;
  resUnits: number;
  constArea: number;
  totalArea: number;
}

/** 処理統計 */
export interface ProcessingStats {
  inputCount: number;
  outputCount: number;
  exclusions: Record<string, number>;
  processingTime: number;
}
