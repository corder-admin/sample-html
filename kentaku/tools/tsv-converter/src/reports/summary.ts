/**
 * 処理サマリーレポート
 */

import type { CleaningStats } from "../pipeline/cleaner.js";
import type { AggregationStats } from "../pipeline/transformer.js";
import { EXCLUSION_LABELS, type ExclusionReason } from "../types/clean.js";

/** 処理結果サマリー */
export interface ProcessingSummary {
  inputFile: string;
  outputFile: string;
  inputCount: number;
  outputCount: number;
  rejectedCount: number;
  exclusionDetails: Record<ExclusionReason, number>;
  aggregation: AggregationStats;
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

  // 集約情報
  if (summary.aggregation.aggregatedGroups > 0) {
    console.log(`╟${thinLine}╢`);
    console.log(
      `║ 集約: 工事細目統合   ${summary.aggregation.aggregatedGroups.toLocaleString().padStart(10)} グループ${" ".repeat(17)}║`
    );
    console.log(
      `║       キー: 工事名 + 業者 + 発注日 + 小工事項目コード${" ".repeat(7)}║`
    );
    const reducedCount =
      summary.aggregation.beforeCount - summary.aggregation.afterCount;
    console.log(
      `║       統合前 → 統合後 ${summary.aggregation.beforeCount.toLocaleString().padStart(8)} → ${summary.aggregation.afterCount.toLocaleString().padStart(8)} (${reducedCount.toLocaleString()}件削減)${" ".repeat(3)}║`
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
  aggregation: AggregationStats,
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
    aggregation,
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

/**
 * サマリーをMarkdown形式で出力
 */
export function summaryToMarkdown(summary: ProcessingSummary): string {
  const lines: string[] = [];
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);

  lines.push("# TSV → data.js 変換レポート");
  lines.push("");
  lines.push(`生成日時: ${timestamp}`);
  lines.push("");

  // ファイル情報
  lines.push("## ファイル情報");
  lines.push("");
  lines.push("| 項目 | 値 |");
  lines.push("|------|-----|");
  lines.push(`| 入力ファイル | \`${summary.inputFile}\` |`);
  lines.push(`| 出力ファイル | \`${summary.outputFile}\` |`);
  lines.push(
    `| 処理時間 | ${(summary.processingTimeMs / 1000).toFixed(2)} 秒 |`
  );
  lines.push("");

  // 処理結果サマリー
  lines.push("## 処理結果サマリー");
  lines.push("");
  lines.push("| 項目 | 件数 | 割合 |");
  lines.push("|------|-----:|-----:|");
  lines.push(
    `| 入力レコード数 | ${summary.inputCount.toLocaleString()} | 100.00% |`
  );

  const outputPct = ((summary.outputCount / summary.inputCount) * 100).toFixed(
    2
  );
  lines.push(
    `| **出力レコード数** | **${summary.outputCount.toLocaleString()}** | **${outputPct}%** |`
  );
  lines.push("");

  // 除外詳細
  const hasExclusions =
    Object.values(summary.exclusionDetails).some((c) => c > 0) ||
    summary.duplicateCount > 0;

  if (hasExclusions) {
    lines.push("## 除外レコード詳細");
    lines.push("");
    lines.push("| 除外理由 | 件数 | 割合 |");
    lines.push("|----------|-----:|-----:|");

    for (const [reason, count] of Object.entries(summary.exclusionDetails)) {
      if (count > 0) {
        const label = EXCLUSION_LABELS[reason as ExclusionReason];
        const pct = ((count / summary.inputCount) * 100).toFixed(2);
        lines.push(`| ${label} | ${count.toLocaleString()} | ${pct}% |`);
      }
    }

    if (summary.duplicateCount > 0) {
      const pct = ((summary.duplicateCount / summary.inputCount) * 100).toFixed(
        2
      );
      lines.push(
        `| 重複レコード | ${summary.duplicateCount.toLocaleString()} | ${pct}% |`
      );
    }
    lines.push("");
  }

  // 集約情報
  if (summary.aggregation.aggregatedGroups > 0) {
    lines.push("## 工事細目集約");
    lines.push("");
    lines.push("同一キーを持つレコードを集約し、数量・金額を合算しました。");
    lines.push("");
    lines.push("### 集約キー");
    lines.push("");
    lines.push("```");
    lines.push("工事名 + 業者 + 発注日 + 小工事項目コード");
    lines.push("```");
    lines.push("");
    lines.push("### 集約結果");
    lines.push("");
    lines.push("| 項目 | 値 |");
    lines.push("|------|-----|");
    lines.push(
      `| 集約グループ数 | ${summary.aggregation.aggregatedGroups.toLocaleString()} |`
    );
    lines.push(
      `| 統合前レコード数 | ${summary.aggregation.beforeCount.toLocaleString()} |`
    );
    lines.push(
      `| 統合後レコード数 | ${summary.aggregation.afterCount.toLocaleString()} |`
    );
    const reducedCount =
      summary.aggregation.beforeCount - summary.aggregation.afterCount;
    lines.push(`| 削減レコード数 | ${reducedCount.toLocaleString()} |`);
    lines.push("");
    lines.push("### 集約処理内容");
    lines.push("");
    lines.push("- **実行数量**: 合算");
    lines.push("- **実行予算金額**: 合算");
    lines.push("- **実行単価**: 再計算（実行予算金額 ÷ 実行数量）");
    lines.push("- **摘要**: 結合（重複除去、`／`区切り）");
    lines.push("");
  }

  return lines.join("\n");
}
