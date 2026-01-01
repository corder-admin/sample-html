/**
 * 処理サマリーレポート
 */

import type { CleaningStats } from "../pipeline/cleaner.js";
import { EXCLUSION_LABELS, type ExclusionReason } from "../types/clean.js";

/** 処理結果サマリー */
export interface ProcessingSummary {
  inputFile: string;
  outputFile: string;
  inputCount: number;
  outputCount: number;
  rejectedCount: number;
  exclusionDetails: Record<ExclusionReason, number>;
  duplicateCount: number;
  processingTimeMs: number;
}

/**
 * サマリーをコンソールに表示
 */
export function printSummary(summary: ProcessingSummary): void {
  const line = "═".repeat(60);
  const thinLine = "─".repeat(60);

  console.log();
  console.log(`╔${line}╗`);
  console.log(`║${"TSV → data.js 変換レポート".padStart(40).padEnd(60)}║`);
  console.log(`╠${line}╣`);
  console.log(`║ 入力ファイル: ${summary.inputFile.slice(-43).padEnd(44)}║`);
  console.log(`║ 出力ファイル: ${summary.outputFile.slice(-43).padEnd(44)}║`);
  console.log(`╟${thinLine}╢`);
  console.log(
    `║ 入力レコード数:${summary.inputCount.toLocaleString().padStart(15)}${" ".repeat(28)}║`
  );
  console.log(`╟${thinLine}╢`);

  // 除外詳細
  for (const [reason, count] of Object.entries(summary.exclusionDetails)) {
    if (count > 0) {
      const label = EXCLUSION_LABELS[reason as ExclusionReason];
      const pct = ((count / summary.inputCount) * 100).toFixed(2);
      console.log(
        `║ 除外: ${label.padEnd(12)}${count.toLocaleString().padStart(10)} (${pct.padStart(6)}%)${" ".repeat(14)}║`
      );
    }
  }

  if (summary.duplicateCount > 0) {
    const pct = ((summary.duplicateCount / summary.inputCount) * 100).toFixed(
      2
    );
    console.log(
      `║ 除外: 重複レコード   ${summary.duplicateCount.toLocaleString().padStart(10)} (${pct.padStart(6)}%)${" ".repeat(14)}║`
    );
  }

  console.log(`╟${thinLine}╢`);
  const outputPct = ((summary.outputCount / summary.inputCount) * 100).toFixed(
    2
  );
  console.log(
    `║ 出力レコード数:${summary.outputCount.toLocaleString().padStart(15)} (${outputPct.padStart(6)}%)${" ".repeat(14)}║`
  );
  console.log(`╟${thinLine}╢`);
  console.log(
    `║ 処理時間:${(summary.processingTimeMs / 1000).toFixed(2).padStart(10)} 秒${" ".repeat(36)}║`
  );
  console.log(`╚${line}╝`);
  console.log();
}

/**
 * CleaningStatsからサマリーを生成
 */
export function createSummary(
  inputFile: string,
  outputFile: string,
  stats: CleaningStats,
  duplicateCount: number,
  outputCount: number,
  processingTimeMs: number
): ProcessingSummary {
  return {
    inputFile,
    outputFile,
    inputCount: stats.total,
    outputCount,
    rejectedCount: stats.rejected,
    exclusionDetails: stats.byReason,
    duplicateCount,
    processingTimeMs,
  };
}

/**
 * サマリーをJSON形式で出力
 */
export function summaryToJson(summary: ProcessingSummary): string {
  return JSON.stringify(summary, null, 2);
}
