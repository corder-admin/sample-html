/**
 * クレンジング後の中間データ型定義
 */

/** クレンジング済みレコード */
export interface CleanedRecord {
  region: string;
  projectName: string;
  majorCode: string;
  minorCode: string; // 小工事項目コード（集約キー）
  item: string;
  spec: string;
  unit: string;
  qty: number;
  price: number;
  amount: number; // 実行予算金額（集約用）
  vendor: string;
  orderDate: string;
  floors: number;
  unitRow: number;
  resUnits: number;
  constArea: number;
  totalArea: number;
}

/** 除外されたレコード（除外理由付き） */
export interface RejectedRecord {
  lineNumber: number;
  reason: ExclusionReason;
  rawData: Record<string, string>;
}

/** 除外理由 */
export type ExclusionReason =
  | "ZERO_QUANTITY"
  | "NO_VENDOR"
  | "INVALID_DATE"
  | "ZERO_PRICE"
  | "INVALID_DATA";

/** 除外理由の日本語ラベル */
export const EXCLUSION_LABELS: Record<ExclusionReason, string> = {
  ZERO_QUANTITY: "実行数量が0",
  NO_VENDOR: "業者名なし",
  INVALID_DATE: "発注日が無効",
  ZERO_PRICE: "実行単価が0",
  INVALID_DATA: "データ形式エラー",
};
