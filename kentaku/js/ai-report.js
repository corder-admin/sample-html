/**
 * =============================================================================
 * AI Report Generation Module
 * =============================================================================
 *
 * AIレポート生成の全機能を提供するモジュール
 * - チャート説明の生成
 * - プロンプトテンプレート
 * - レポート生成オーケストレーション
 *
 * 依存: gemini-api.js, utils.js (formatNumber)
 *
 * =============================================================================
 */

// =============================================================================
// Error Messages
// =============================================================================

const AI_REPORT_ERRORS = {
  NO_API_KEY:
    "APIキーが設定されていません。右上の「API設定」から設定してください。",
  CHART_CAPTURE_FAILED: "チャート画像のキャプチャに失敗しました",
  GENERATION_FAILED: "レポート生成中にエラーが発生しました",
};

// =============================================================================
// Chart Configuration (Data-Driven)
// =============================================================================

/**
 * Chart tab configurations
 * Each tab defines its labels and analysis points
 */
const CHART_CONFIGS = {
  timeseries: {
    tabName: "時系列分析",
    labels: {
      timeUnit: {
        yearly: "年次",
        monthly: "月次",
        weekly: "週次",
        daily: "日次",
      },
      chartType: {
        line: "折れ線",
        area: "面グラフ",
        bar: "棒グラフ",
        table: "テーブル",
      },
    },
    descriptionTemplate: (settings, labels) =>
      `価格の時系列推移チャート（${labels.timeUnit[settings.timeUnit]}、${
        labels.chartType[settings.chartType]
      }表示）`,
    analysisPoints: [
      "時間経過に伴う価格トレンド（上昇・下降・横ばい）",
      "季節性や周期的なパターン",
      "平均値と中央値の乖離（外れ値の影響度）",
      "価格変動のボラティリティ（最大値・最小値の幅）",
      "直近の価格動向と今後の予測",
    ],
  },

  comparison: {
    tabName: "比較分析",
    labels: {
      groupBy: {
        region: "支店別",
        vendor: "業者別",
        majorCode: "大工事項目コード別",
        building: "建物別",
      },
      metric: {
        avg: "平均",
        median: "中央値",
      },
      chartType: {
        bar: "棒グラフ",
        boxplot: "箱ひげ図",
        radar: "レーダーチャート",
        table: "テーブル",
      },
    },
    descriptionTemplate: (settings, labels) =>
      `${labels.groupBy[settings.groupBy]}の${
        labels.metric[settings.metric]
      }価格比較（${labels.chartType[settings.chartType]}表示）`,
    analysisPoints: [
      "グループ間の価格差異と順位",
      "最も高い/安いグループの特定",
      "グループ間の価格ばらつき",
      "交渉材料として活用できる比較データ",
      "異常に高い/安いグループの原因考察",
    ],
  },

  trend: {
    tabName: "傾向分析",
    labels: {
      xAxis: {
        resUnits: "総戸数",
        floors: "地上階数",
        totalArea: "延床面積",
        constArea: "施工面積",
      },
      chartType: {
        scatter: "散布図",
        bubble: "バブルチャート",
        heatmap: "ヒートマップ",
        table: "テーブル",
      },
    },
    descriptionTemplate: (settings, labels) =>
      `${labels.xAxis[settings.xAxis]}と単価の相関分析（${
        labels.chartType[settings.chartType]
      }表示）`,
    analysisPoints: [
      "建物規模と単価の相関関係の強さ",
      "規模による価格スケールメリットの有無",
      "外れ値となっている案件の特定",
      "規模別の適正価格レンジ",
      "相関が弱い場合の他要因の考察",
    ],
  },
};

// =============================================================================
// Chart Description Generator
// =============================================================================

/**
 * Get chart description based on current tab and settings
 * @param {string} tab - Active tab name (timeseries, comparison, trend)
 * @param {Object} tabSettings - Settings for the current tab
 * @returns {Object} Chart description with tabName, description, and analysisPoints
 */
function getChartDescription(tab, tabSettings) {
  const config = CHART_CONFIGS[tab];

  if (!config) {
    return {
      tabName: "不明",
      description: "チャート情報なし",
      analysisPoints: [],
    };
  }

  return {
    tabName: config.tabName,
    description: config.descriptionTemplate(tabSettings, config.labels),
    analysisPoints: config.analysisPoints,
  };
}

// =============================================================================
// Filter Formatter
// =============================================================================

/**
 * Format filter information for prompt
 * @param {Object} filters - Filter settings
 * @returns {string[]} Array of filter description strings
 */
function formatFilterInfo(filters) {
  const filterInfo = [];

  if (filters.dateFrom || filters.dateTo) {
    const from = filters.dateFrom || "開始日なし";
    const to = filters.dateTo || "終了日なし";
    filterInfo.push(`期間: ${from} ～ ${to}`);
  }

  if (filters.regions?.length > 0) {
    filterInfo.push(`支店: ${filters.regions.join(", ")}`);
  }

  if (filters.vendors?.length > 0) {
    filterInfo.push(`業者: ${filters.vendors.join(", ")}`);
  }

  return filterInfo;
}

// =============================================================================
// Prompt Template
// =============================================================================

/**
 * Generate procurement analysis prompt for Gemini API
 * @param {Object} params - Parameters for prompt generation
 * @param {Object} params.group - Current group data (item, unit)
 * @param {Object} params.kpi - KPI summary
 * @param {Object} params.filters - Common filters
 * @param {Object} params.chartInfo - Chart description
 * @returns {string} Generated prompt
 */
function generateProcurementPrompt({ group, kpi, filters, chartInfo }) {
  const filterInfo = formatFilterInfo(filters);
  const filterLine =
    filterInfo.length > 0
      ? `- **適用フィルター**: ${filterInfo.join(", ")}`
      : "- **適用フィルター**: なし（全データ対象）";

  const analysisPointsList = chartInfo.analysisPoints
    .map((point, i) => `   ${i + 1}. ${point}`)
    .join("\n");

  // Calculate price spread for context
  const priceSpread = kpi.maxPrice - kpi.minPrice;
  const priceSpreadPercent =
    kpi.avgPrice > 0 ? ((priceSpread / kpi.avgPrice) * 100).toFixed(1) : 0;
  const avgMedianGap =
    kpi.avgPrice > 0
      ? (((kpi.avgPrice - kpi.medianPrice) / kpi.avgPrice) * 100).toFixed(1)
      : 0;

  return `# 建設資材購買分析レポート生成

## §1 あなたの役割

あなたは建設業界で15年以上の経験を持つ購買分析の専門家です。
**添付されたチャート画像を詳細に読み取り**、データに基づく論理的な分析と実務で即座に活用できる具体的な提言を行います。

### §1.1 チャート読み取りの基本姿勢
- ALWAYS: チャート画像の視覚的パターン（傾き、クラスター、外れ値）を言語化する
- ALWAYS: 軸ラベル、凡例、データポイントを正確に読み取る
- ALWAYS: 視覚的に顕著な特徴を最初に報告する
- NEVER: チャートに表示されていないデータを推測で補完しない
- NEVER: 統計データのみに依存し、チャートの視覚情報を無視しない

### §1.2 分析の優先順位
1. **チャートから直接読み取れる事実**（最優先）
2. **統計データとの照合・検証**
3. **因果関係の推論**（明確に推測と明記）
4. **アクション提案**

---

## §2 分析対象データ

### §2.1 基本情報
| 項目 | 値 |
|------|-----|
| 品目名 | ${group?.item || "不明"} |
| 単位 | ${group?.unit || "不明"} |
| データ件数 | ${kpi.count}件 |
${filterLine}

### §2.2 価格統計（税抜単価）
| 指標 | 金額 | チャートでの確認ポイント |
|------|------|------------------------|
| 最小値 | ¥${formatNumber(kpi.minPrice)} | 最下端のデータポイント位置 |
| 平均値 | ¥${formatNumber(kpi.avgPrice)} | データの重心・中心傾向 |
| 中央値 | ¥${formatNumber(kpi.medianPrice)} | データ分布の中央位置 |
| 最大値 | ¥${formatNumber(kpi.maxPrice)} | 最上端のデータポイント位置 |

### §2.3 価格分布の特徴
- **価格レンジ**: ¥${formatNumber(
    priceSpread
  )}（平均の${priceSpreadPercent}%相当）
- **平均-中央値乖離**: ${avgMedianGap}%（${
    Number(avgMedianGap) > 5
      ? "外れ値の影響あり→チャートで高値側の外れ値を確認"
      : Number(avgMedianGap) < -5
      ? "低価格側に偏り→チャートで低値クラスターを確認"
      : "比較的対称的な分布→チャートで正規分布に近い形状を確認"
  }）

---

## §3 チャート分析タスク

### §3.1 チャート種別
- **分析カテゴリ**: ${chartInfo.tabName}
- **表示内容**: ${chartInfo.description}

### §3.2 チャート読み取りステップ

**Step 1: 全体パターンの把握**
- チャート全体から最も顕著なパターンや傾向を特定
- データの分布形状（偏り、クラスター、トレンド方向）を確認

**Step 2: 着目点の詳細確認**
${analysisPointsList}

**Step 3: 外れ値・異常値の検出**
- 明らかに他と離れたデータポイントを特定
- その位置（X軸・Y軸の値）を読み取る

**Step 4: 統計データとの照合**
- §2.2の統計値がチャート上で妥当か視覚的に確認
- 矛盾があれば指摘

---

## §4 出力フォーマット

### 📊 チャート分析サマリー

> チャート画像から読み取れる最も重要な発見を1〜2文で要約。
> 「チャートを見ると...」「グラフ上で...が確認できる」のように、チャートの特徴に基づく表現を使用。

### 📈 統計的分析（5項目）

以下の形式で5つの分析を記述。**各分析は必ずチャートの特徴を起点とする**：

**分析1: [チャートから発見したパターン名]**
- **事実**: チャートから読み取れる客観的事実（位置、傾向、パターンを含む）
- **解釈**: この事実が意味すること（§2の統計データと照合）
- **ポイント**: 購買判断への影響

**分析2〜5**: 同様の形式で記述

### 💼 価格交渉ガイド

#### 推奨ターゲット単価
- **目標単価**: ¥[金額]
- **チャート的な根拠**: 「チャート上で[位置/ゾーン]に[件数/割合]のデータが集中」
- **統計的な根拠**: 中央値¥${formatNumber(kpi.medianPrice)}を基準に[+/-X%]
- **達成可能性**: [高/中/低]（チャート上の分布密度から判断）

#### 交渉の進め方
| 優先順位 | アクション | チャートからの根拠 |
|---------|----------|------------------|
| 1 | [具体的アクション] | [チャート上の該当データを引用] |
| 2 | [具体的アクション] | [チャート上の該当データを引用] |
| 3 | [具体的アクション] | [チャート上の該当データを引用] |

### ⚠️ リスク・注意事項

| 発見場所 | 内容 | 対応策 |
|---------|------|--------|
| チャート[位置] | [視覚的に検出した異常] | [確認/是正アクション] |
| 統計データ | [数値的なリスク] | [対策] |

---

## §5 品質チェックリスト

出力前に以下を確認：
- [ ] 各分析項目がチャートの視覚情報（位置、色、形状、密度）を引用している
- [ ] 「高い/低い」には比較基準と差分値を明記
- [ ] 推測は「〜と推測される」「〜の可能性がある」と明記
- [ ] §2の統計データとチャート視覚情報が矛盾していないか確認済み
- [ ] 交渉ガイドの数値がチャート・統計の両方から導出されている
`;
}

// =============================================================================
// Chart Capture
// =============================================================================

/**
 * Capture chart as base64 image
 * @param {Object} chartInstance - Chart.js instance
 * @param {number} delay - Delay in ms before capture (default: 100)
 * @returns {Promise<string|null>} Base64 image string or null
 */
async function captureChart(chartInstance, delay = 100) {
  await new Promise((resolve) => setTimeout(resolve, delay));
  return chartInstance?.toBase64Image("image/png", 1) || null;
}

// =============================================================================
// Report Generation Orchestrator
// =============================================================================

/**
 * Generate AI report
 * @param {Object} params - Parameters for report generation
 * @param {Object} params.chartInstance - Chart.js instance
 * @param {Object} params.detailModal - Detail modal state
 * @param {Function} params.onStart - Callback when generation starts
 * @param {Function} params.onSuccess - Callback on success with response
 * @param {Function} params.onError - Callback on error with error message
 * @param {Function} params.onComplete - Callback when generation completes
 */
async function generateAiReport({
  chartInstance,
  detailModal,
  onStart,
  onSuccess,
  onError,
  onComplete,
}) {
  // Validate API key
  if (!getGeminiApiKey()) {
    onError(AI_REPORT_ERRORS.NO_API_KEY);
    return;
  }

  onStart();

  try {
    // Capture chart image
    const chartImage = await captureChart(chartInstance);
    if (!chartImage) {
      throw new Error(AI_REPORT_ERRORS.CHART_CAPTURE_FAILED);
    }

    // Build chart description
    const { activeTab } = detailModal;
    const chartInfo = getChartDescription(activeTab, detailModal[activeTab]);

    // Generate prompt
    const prompt = generateProcurementPrompt({
      group: detailModal.currentGroup,
      kpi: detailModal.kpiSummary,
      filters: detailModal.commonFilters,
      chartInfo,
    });

    // Call Gemini API
    const response = await callGeminiVisionApi([chartImage], prompt);
    onSuccess(response);
  } catch (error) {
    console.error("AI Report generation failed:", error);
    onError(error.message || AI_REPORT_ERRORS.GENERATION_FAILED);
  } finally {
    onComplete();
  }
}
