/**
 * TSVファイル読み込み
 */

import { parse } from "csv-parse";
import { createReadStream } from "node:fs";
import type { RawTsvRecord } from "../types/raw.js";
import { TSV_COLUMNS } from "../types/raw.js";

/** 読み込み結果 */
export interface ReadResult {
  records: RawTsvRecord[];
  totalLines: number;
}

/** Parser設定オプション */
interface ParserOptions {
  delimiter: string;
  columns: string[] | boolean;
  skip_empty_lines: boolean;
  relax_column_count: boolean;
  trim: boolean;
}

/**
 * 共通のparser設定を生成
 */
function createParserOptions(): ParserOptions {
  return {
    delimiter: "\t",
    columns: TSV_COLUMNS, // types/raw.tsで定義された列名を使用
    skip_empty_lines: true,
    relax_column_count: true, // カラム数の不一致を許容
    trim: false, // トリムは後でクレンジングで行う
  };
}

/**
 * TSVファイルをストリーム読み込み
 *
 * @param filePath - TSVファイルのパス
 * @param onProgress - 進捗コールバック（オプション）
 * @returns 読み込み結果
 */
async function readTsvFileCore(
  filePath: string,
  onProgress?: (count: number) => void
): Promise<ReadResult> {
  const records: RawTsvRecord[] = [];
  let totalLines = 0;

  return new Promise((resolve, reject) => {
    const parser = parse(createParserOptions());
    const stream = createReadStream(filePath, { encoding: "utf-8" });

    stream
      .pipe(parser)
      .on("data", (row: Record<string, string>) => {
        totalLines++;

        records.push(row as unknown as RawTsvRecord);

        // 進捗通知（オプション、1万件ごと）
        if (onProgress && totalLines % 10000 === 0) {
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

/**
 * TSVファイルをストリーム読み込み
 */
export async function readTsvFile(filePath: string): Promise<ReadResult> {
  return readTsvFileCore(filePath);
}

/**
 * 進捗表示付きでTSVファイルを読み込み
 */
export async function readTsvFileWithProgress(
  filePath: string,
  onProgress?: (count: number) => void
): Promise<ReadResult> {
  return readTsvFileCore(filePath, onProgress);
}
