/**
 * TSVファイル読み込み
 */

import { createReadStream } from "node:fs";
import { parse } from "csv-parse";
import type { RawTsvRecord } from "../types/raw.js";

/** 読み込み結果 */
export interface ReadResult {
  records: RawTsvRecord[];
  totalLines: number;
}

/**
 * TSVファイルをストリーム読み込み
 */
export async function readTsvFile(filePath: string): Promise<ReadResult> {
  const records: RawTsvRecord[] = [];
  let totalLines = 0;

  return new Promise((resolve, reject) => {
    const parser = parse({
      delimiter: "\t",
      columns: true, // ヘッダー行をキーとして使用
      skip_empty_lines: true,
      relax_column_count: true, // カラム数の不一致を許容
      trim: false, // トリムは後でクレンジングで行う
    });

    const stream = createReadStream(filePath, { encoding: "utf-8" });

    stream
      .pipe(parser)
      .on("data", (row: Record<string, string>) => {
        totalLines++;
        // 2つ目の摘要カラムを別名にマッピング
        const keys = Object.keys(row);
        const secondMemoIndex = keys.filter((k) => k === "摘要").length > 1
          ? keys.lastIndexOf("摘要")
          : -1;

        if (secondMemoIndex !== -1) {
          const values = Object.values(row);
          row["摘要_2"] = values[15] || ""; // 16番目のカラム
        } else {
          row["摘要_2"] = row["摘要"] || "";
        }

        records.push(row as unknown as RawTsvRecord);
      })
      .on("error", (error: Error) => {
        reject(new Error(`TSV読み込みエラー: ${error.message}`));
      })
      .on("end", () => {
        resolve({ records, totalLines });
      });
  });
}

/**
 * 進捗表示付きでTSVファイルを読み込み
 */
export async function readTsvFileWithProgress(
  filePath: string,
  onProgress?: (count: number) => void
): Promise<ReadResult> {
  const records: RawTsvRecord[] = [];
  let totalLines = 0;

  return new Promise((resolve, reject) => {
    const parser = parse({
      delimiter: "\t",
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: false,
    });

    const stream = createReadStream(filePath, { encoding: "utf-8" });

    stream
      .pipe(parser)
      .on("data", (row: Record<string, string>) => {
        totalLines++;
        row["摘要_2"] = "";
        records.push(row as unknown as RawTsvRecord);

        // 1万件ごとに進捗通知
        if (totalLines % 10000 === 0 && onProgress) {
          onProgress(totalLines);
        }
      })
      .on("error", (error: Error) => {
        reject(new Error(`TSV読み込みエラー: ${error.message}`));
      })
      .on("end", () => {
        resolve({ records, totalLines });
      });
  });
}
