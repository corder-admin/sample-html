/**
 * レコードバリデーション
 */

import { z } from "zod";
import type { CleanedRecord } from "../types/clean.js";

/** クレンジング済みレコードのスキーマ */
export const CleanedRecordSchema = z.object({
  region: z.string().min(1, "支店名は必須です"),
  projectName: z.string().min(1, "工事名称は必須です"),
  majorCode: z.string().regex(/^\d{3}$/, "大工事コードは3桁数字"),
  item: z.string().min(1, "品目名は必須です"),
  spec: z.string(),
  unit: z.string().min(1, "単位は必須です"),
  qty: z.number().positive("数量は正の数"),
  price: z.number().nonnegative("単価は0以上"),
  vendor: z.string().min(1, "業者名は必須です"),
  orderDate: z.string().regex(/^\d{8}$/, "発注日はYYYYMMDD形式"),
  floors: z.number().int().nonnegative(),
  unitRow: z.number().int().nonnegative(),
  resUnits: z.number().int().nonnegative(),
  constArea: z.number().nonnegative(),
  totalArea: z.number().nonnegative(),
});

/**
 * レコードをバリデート
 */
export function validateRecord(
  record: CleanedRecord
): z.SafeParseReturnType<CleanedRecord, CleanedRecord> {
  return CleanedRecordSchema.safeParse(record);
}

/**
 * バリデーションエラーを整形
 */
export function formatValidationErrors(
  result: z.SafeParseReturnType<CleanedRecord, CleanedRecord>
): string[] {
  if (result.success) return [];
  return result.error.errors.map(
    (e) => `${e.path.join(".")}: ${e.message}`
  );
}
