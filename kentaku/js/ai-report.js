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
    // チャート種別固有の読み取りガイド
    readingGuide: {
      primaryPattern: "トレンドライン（上昇/下降/横ばい）の方向と傾き",
      measurementPoints: [
        "始点と終点の価格差 → 変化率を算出",
        "最高値・最安値の出現時期を特定",
        "急激な変化点（傾きが変わる点）の位置",
      ],
      visualCues: [
        "線の傾き角度: 45度以上=急激、15度以下=緩やか",
        "データ密度: 点の集中期間=安定期、散らばり=変動期",
        "バンド幅: 最大-最小の帯が広い期間=高ボラティリティ",
      ],
      commonMisreads: [
        "スケールの起点が0でない場合、変動を過大評価しがち",
        "欠損期間を見落とし、連続トレンドと誤認",
      ],
    },
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
    readingGuide: {
      primaryPattern: "バーの長さ/箱の位置による順位と差異",
      measurementPoints: [
        "最長バーと最短バーの差 → 価格レンジを数値化",
        "中央付近に集まるグループ数 → 市場の標準価格帯",
        "箱ひげ図: 箱の幅（IQR）が狭い=価格安定、広い=価格変動大",
      ],
      visualCues: [
        "バーの長さ比: 最長が最短の2倍以上=大きな価格差",
        "箱ひげ図のひげ: 長いひげ=外れ値の存在を示唆",
        "色分け: 同色グループ間での差異にも注目",
      ],
      commonMisreads: [
        "サンプル数の違いを無視した単純比較",
        "箱ひげ図の中央線（中央値）と平均を混同",
      ],
    },
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
    readingGuide: {
      primaryPattern: "点群の散らばり方向（右上がり/右下がり/無相関）",
      measurementPoints: [
        "点群の主軸方向 → 相関の正負を判定",
        "点群の帯幅 → 相関の強さ（狭い=強相関、広い=弱相関）",
        "クラスター（点の塊）の位置と数を特定",
      ],
      visualCues: [
        "右上がりの帯状=正の相関（規模↑価格↑）",
        "右下がりの帯状=負の相関（スケールメリット）",
        "円形/ランダム散布=相関なし",
        "離れた孤立点=外れ値→個別確認必要",
      ],
      commonMisreads: [
        "少数の外れ値に引っ張られた相関の誤認",
        "クラスター内の局所相関を全体傾向と混同",
      ],
    },
  },
};

// =============================================================================
// Chart Description Generator
// =============================================================================

/**
 * Get chart description based on current tab and settings
 * @param {string} tab - Active tab name (timeseries, comparison, trend)
 * @param {Object} tabSettings - Settings for the current tab
 * @returns {Object} Chart description with tabName, description, analysisPoints, and readingGuide
 */
function getChartDescription(tab, tabSettings) {
  const config = CHART_CONFIGS[tab];

  if (!config) {
    return {
      tabName: "不明",
      description: "チャート情報なし",
      analysisPoints: [],
      readingGuide: null,
    };
  }

  return {
    tabName: config.tabName,
    description: config.descriptionTemplate(tabSettings, config.labels),
    analysisPoints: config.analysisPoints,
    readingGuide: config.readingGuide || null,
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

  // Build reading guide section if available
  const readingGuide = chartInfo.readingGuide;
  const readingGuideSection = readingGuide
    ? `
### §3.3 このチャート種別の読み取り手法

**主要パターン**: ${readingGuide.primaryPattern}

**数値化ポイント**（ALWAYS これらを読み取る）:
${readingGuide.measurementPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}

**視覚的手がかり**:
${readingGuide.visualCues.map((c) => `- ${c}`).join("\n")}

**⚠️ よくある誤読パターン**（NEVER これらの罠に陥らない）:
${readingGuide.commonMisreads.map((m) => `- ${m}`).join("\n")}
`
    : "";

  return `# 建設資材購買分析レポート生成

## §1 あなたの役割

あなたは建設業界で15年以上の経験を持つ購買分析の専門家です。
**添付されたチャート画像を詳細に読み取り**、データに基づく論理的な分析と実務で即座に活用できる具体的な提言を行います。

### §1.1 チャート読み取りの絶対ルール

**ALWAYS（必ず実行）**:
- チャートの軸ラベル・単位・スケールを最初に確認する
- 視覚的パターン（傾き、クラスター、外れ値）を具体的な数値や位置で説明
- 統計データ（§2.2）とチャート視覚情報の整合性を検証
- 日付は明確に記述（例: 「2024年3月〜4月」「2023年第4四半期」「2024年3月第1週」）

**NEVER（絶対禁止）**:
- チャートに表示されていないデータを推測で補完
- 「高い」「低い」を比較基準なしで使用
- 統計データのみに依存してチャート視覚情報を無視
- 冒頭に自己紹介や挨拶文を出力しない（「ご提示いただいた〜を分析します」等は禁止）

### §1.2 分析の優先順位
1. **チャートから直接読み取れる視覚的事実**（最優先）
2. **統計データ（§2.2）との照合・検証**
3. **因果関係の推論**（「〜と推測される」と明記）
4. **具体的アクション提案**

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
| 指標 | 金額 |
|------|------|
| 最小値 | ¥${formatNumber(kpi.minPrice)} |
| 平均値 | ¥${formatNumber(kpi.avgPrice)} |
| 中央値 | ¥${formatNumber(kpi.medianPrice)} |
| 最大値 | ¥${formatNumber(kpi.maxPrice)} |

### §2.3 分布特性
- **価格レンジ**: ¥${formatNumber(priceSpread)}（平均の${priceSpreadPercent}%）
- **平均-中央値乖離**: ${avgMedianGap}%${
    Number(avgMedianGap) > 5
      ? "（高価格側に外れ値の可能性）"
      : Number(avgMedianGap) < -5
      ? "（低価格側に偏り）"
      : "（対称的な分布）"
  }

---

## §3 チャート分析タスク

### §3.1 チャート種別
- **分析カテゴリ**: ${chartInfo.tabName}
- **表示内容**: ${chartInfo.description}

### §3.2 分析の着眼点
${analysisPointsList}
${readingGuideSection}
---

## §4 出力フォーマット

**重要**: 出力は必ず「⚠️注意：AIによる分析のため、不正確な情報を表示することがあります。」から開始すること。自己紹介や挨拶文は一切不要。

### 📋 基本情報

| 項目 | 内容 |
|------|------|
| 品目名 | ${group?.item || "不明"} |
| 単位 | ${group?.unit || "不明"} |
| 分析種別 | ${chartInfo.tabName} |
| 時間軸 | ${chartInfo.description} |
| 分析期間 | [チャートから読み取った期間を記載（例: 2023年4月〜2024年3月）] |
| データ件数 | ${kpi.count}件 |

### 📊 チャート分析サマリー

> チャート画像から読み取れる最も重要な発見を1〜2文で要約。
> 「チャートを見ると...」「グラフ上で...が確認できる」のように視覚的特徴を起点に記述。

### 📈 詳細分析（5項目）

以下の形式で5つの分析を記述:

**分析1: [発見したパターン名]**
- **事実**: チャートから読み取れる客観的事実（傾向、位置、パターン）
- **数値**: 具体的な金額や変化率
- **解釈**: この傾向が意味すること
- **価格交渉への影響**: この分析から導かれる交渉上のポイント（後述の交渉アクションの根拠となる）

**分析2〜5**: 同様の形式で記述

### 💼 価格交渉ガイド

#### 推奨ターゲット単価
| 項目 | 値 | 根拠 |
|------|-----|------|
| 目標単価 | ¥[金額] | チャート上のデータ分布から判断 |
| 下限目標 | ¥[金額] | 最低価格帯の実績 |
| 統計基準 | 中央値¥${formatNumber(kpi.medianPrice)} ± [X%] | ${
    kpi.count
  }件のデータ基準 |

#### 価格交渉アクション（優先順）

**重要**: 以下のアクションは、上記「詳細分析」の各分析における「価格交渉への影響」から導出すること。分析との整合性を必ず保つ。

| # | アクション | 根拠（対応する分析） | 期待効果 |
|---|----------|-------------------|---------|
| 1 | [最優先アクション] | 分析○の「価格交渉への影響」より | [効果] |
| 2 | [次点アクション] | 分析○の「価格交渉への影響」より | [効果] |
| 3 | [補助的アクション] | 分析○の「価格交渉への影響」より | [効果] |

### ⚠️ リスク・注意事項

| 発見場所 | 詳細 | 対応策 |
|---------|------|--------|
| チャート | [視覚的に検出した異常] | [アクション] |
| 統計データ | [数値的リスク] | [対策] |

---

## §5 品質チェックリスト

- [ ] 各分析がチャートの視覚情報を引用している
- [ ] 「高い/低い」には比較基準を明記
- [ ] 推測は「〜と推測される」と明記
- [ ] 統計データとチャートが整合している
- [ ] 価格交渉アクションが詳細分析の「価格交渉への影響」と整合している
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
