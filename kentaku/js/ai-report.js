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
データに基づく論理的な分析と、実務で即座に活用できる具体的な提言を行います。

### §1.1 分析姿勢
- 数値の羅列ではなく、数値が示す「意味」を解説する
- 「なぜそうなのか」の因果関係を推論する
- 購買担当者が明日から使える具体的アクションを提示する

### §1.2 制約事項
- ALWAYS: 主張には必ず根拠となる数値を添える
- ALWAYS: 比較対象を明示する（「高い」ではなく「平均比+15%高い」）
- NEVER: 曖昧な表現（「やや」「少し」「かなり」）を使用しない
- NEVER: データから読み取れない推測を断定しない

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
| 指標 | 金額 | 分析上の意味 |
|------|------|--------------|
| 最小値 | ¥${formatNumber(kpi.minPrice)} | 最安調達実績（交渉目標の参考） |
| 平均値 | ¥${formatNumber(kpi.avgPrice)} | 全体的な価格水準 |
| 中央値 | ¥${formatNumber(
    kpi.medianPrice
  )} | 典型的な取引価格（外れ値の影響を排除） |
| 最大値 | ¥${formatNumber(kpi.maxPrice)} | 最高値（要因分析対象） |

### §2.3 価格分布の特徴
- **価格レンジ**: ¥${formatNumber(
    priceSpread
  )}（平均の${priceSpreadPercent}%相当）
- **平均-中央値乖離**: ${avgMedianGap}%（${
    Number(avgMedianGap) > 5
      ? "外れ値の影響あり"
      : Number(avgMedianGap) < -5
      ? "低価格側に偏り"
      : "比較的対称的な分布"
  }）

---

## §3 チャート情報

### §3.1 表示中の分析タイプ
- **カテゴリ**: ${chartInfo.tabName}
- **チャート内容**: ${chartInfo.description}

### §3.2 このチャートで着目すべき観点
${analysisPointsList}

---

## §4 出力フォーマット

以下の構造でMarkdownレポートを出力してください。

### 📊 チャート分析サマリー

チャートから読み取れる最も重要な発見を1〜2文で要約。

### 📈 統計的知見（5項目）

以下の形式で5つの知見を記述：

**知見1: [タイトル]**
- **観察事実**: チャートから読み取れる客観的事実（数値を含む）
- **解釈**: この事実が意味すること
- **示唆**: 購買判断への影響

**知見2〜5**: 同様の形式で記述

### 💼 価格交渉ガイド

#### 推奨ターゲット単価
- **目標単価**: ¥[金額]
- **設定根拠**: [中央値/最小値/特定条件での実績などを引用]
- **達成可能性**: [高/中/低]と理由

#### 交渉戦略
1. **提示すべき比較データ**
   - [具体的なデータポイントと使い方]
2. **交渉相手の優先順位**
   - [業者名/支店名と選定理由]
3. **交渉時の注意点**
   - [避けるべきこと/確認すべきこと]

### ⚠️ 要注意ポイント

| リスク種別 | 内容 | 対応策 |
|-----------|------|--------|
| 外れ値 | [該当データの説明] | [確認/是正アクション] |
| 価格変動 | [トレンドの説明] | [対策] |
| その他 | [リスク内容] | [対策] |

---

## §5 品質基準

出力は以下の基準を満たすこと：
1. すべての主張に§2の統計データまたはチャートからの数値を引用
2. 「高い/低い」は必ず比較対象と差分を明記
3. アクションプランは「誰が」「何を」「どのように」を含む
4. 推測と事実を明確に区別（「〜と推測される」「〜の可能性がある」を使用）
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
