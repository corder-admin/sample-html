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
      ? `- **フィルター条件**: ${filterInfo.join(", ")}`
      : "";

  const analysisPointsList = chartInfo.analysisPoints
    .map((point, i) => `${i + 1}. ${point}`)
    .join("\n");

  return `
あなたは建設資材購買の専門アナリストです。以下のチャート画像と統計情報を分析し、購買担当者向けのレポートを作成してください。

## 分析対象
- **品目名**: ${group?.item || "不明"}
- **単位**: ${group?.unit || "不明"}
- **データ件数**: ${kpi.count}件
${filterLine}

## 現在の統計サマリー
- 最小単価: ¥${formatNumber(kpi.minPrice)}
- 平均単価: ¥${formatNumber(kpi.avgPrice)}
- 中央値: ¥${formatNumber(kpi.medianPrice)}
- 最大単価: ¥${formatNumber(kpi.maxPrice)}

## 表示中のチャート
- **分析タイプ**: ${chartInfo.tabName}
- **チャート内容**: ${chartInfo.description}

## このチャートから読み取るべき分析ポイント
${analysisPointsList}

## 出力形式
以下の形式でMarkdownレポートを出力してください：

### 統計的知見（5項目）
上記の分析ポイントに基づき、チャートから読み取れる統計的な知見を5つ、具体的な数値を含めて記述してください。

### 価格交渉アクションプラン
購買担当者が単価交渉を行う際に活用できる具体的なアクションプランを提案してください。以下の観点を含めてください：
- 推奨ターゲット単価と根拠
- 交渉時に提示すべき比較データ
- 注意すべき業者・支店
- 価格安定性に関する考察

### 要注意ポイント
外れ値、異常な価格変動、リスク要因などを指摘してください。
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
