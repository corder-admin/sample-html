#!/usr/bin/env node
/**
 * TSV → data.js 変換ツール
 *
 * 使い方:
 *   npm run convert -- <入力TSVファイル> [出力先]
 *
 * 例:
 *   npm run convert -- ~/Downloads/data.tsv
 *   npm run convert -- ~/Downloads/data.tsv ./output
 */

import { resolve, dirname, basename } from "node:path";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

import { readTsvFileWithProgress } from "./pipeline/reader.js";
import { cleanRecords } from "./pipeline/cleaner.js";
import {
  transformToOutput,
  deduplicateRecords,
  sortByOrderDate,
} from "./pipeline/transformer.js";
import { writeDataJs, writeRejectedRecords } from "./pipeline/writer.js";
import { createSummary, printSummary } from "./reports/summary.js";

/** デフォルトの出力先 */
const DEFAULT_OUTPUT_DIR = "../../js";

/**
 * メイン処理
 */
async function main(): Promise<void> {
  const startTime = Date.now();

  // 引数解析
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("エラー: 入力ファイルを指定してください");
    console.error(
      "使い方: npm run convert -- <入力TSVファイル> [出力先ディレクトリ]"
    );
    process.exit(1);
  }

  const inputFile = resolve(args[0]);
  const outputDir = resolve(
    args[1] ||
      resolve(dirname(new URL(import.meta.url).pathname), DEFAULT_OUTPUT_DIR)
  );

  // 入力ファイル存在確認
  if (!existsSync(inputFile)) {
    console.error(`エラー: ファイルが見つかりません: ${inputFile}`);
    process.exit(1);
  }

  // 出力ディレクトリ作成
  await mkdir(outputDir, { recursive: true });

  const outputFile = resolve(outputDir, "data.js");
  const rejectedFile = resolve(outputDir, "rejected_records.json");

  console.log("TSV → data.js 変換を開始します...");
  console.log(`入力: ${inputFile}`);
  console.log(`出力: ${outputFile}`);
  console.log();

  // Step 1: TSV読み込み
  console.log("📖 TSVファイルを読み込み中...");
  const { records } = await readTsvFileWithProgress(inputFile, (count) => {
    process.stdout.write(`\r  ${count.toLocaleString()} 件読み込み中...`);
  });
  console.log(`\r  ${records.length.toLocaleString()} 件読み込み完了`);

  // Step 2: クレンジング
  console.log("🧹 データクレンジング中...");
  const { cleaned, rejected, stats } = cleanRecords(records);
  console.log(`  ${cleaned.length.toLocaleString()} 件がクレンジング通過`);
  console.log(`  ${rejected.length.toLocaleString()} 件を除外`);

  // Step 3: 変換
  console.log("🔄 データ変換中...");
  const outputRecords = transformToOutput(cleaned);

  // Step 4: 重複除去
  const { unique, duplicateCount } = deduplicateRecords(outputRecords);
  if (duplicateCount > 0) {
    console.log(`  ${duplicateCount.toLocaleString()} 件の重複を除去`);
  }

  // Step 5: ソート
  const sorted = sortByOrderDate(unique, false); // 古い順
  console.log(`  ${sorted.length.toLocaleString()} 件を出力します`);

  // Step 6: 出力
  console.log("💾 ファイル出力中...");
  await writeDataJs(outputFile, sorted);
  console.log(`  data.js を出力しました`);

  if (rejected.length > 0) {
    await writeRejectedRecords(rejectedFile, rejected);
    console.log(`  rejected_records.json を出力しました`);
  }

  // サマリー表示
  const processingTimeMs = Date.now() - startTime;
  const summary = createSummary(
    basename(inputFile),
    basename(outputFile),
    stats,
    duplicateCount,
    sorted.length,
    processingTimeMs
  );
  printSummary(summary);

  console.log("✅ 変換完了!");
}

// 実行
main().catch((error) => {
  console.error("エラーが発生しました:", error);
  process.exit(1);
});
