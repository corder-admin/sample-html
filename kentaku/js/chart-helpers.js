/**
 * =============================================================================
 * chart-helpers.js - チャート描画ヘルパー関数モジュール
 * =============================================================================
 *
 * 概要:
 *   Chart.js を使用したグラフ描画のための純粋関数を提供します。
 *   Alpine.js コンポーネントから独立した、テスト可能なヘルパー関数です。
 *
 * 分類: プレゼンテーション層 (Presentation Layer)
 *
 * 依存関係:
 *   - utils.js       : ユーティリティ関数 (formatNumber, calcPriceStats, calcMedian等)
 *   - Chart.js       : グラフ描画ライブラリ (グローバル)
 *
 * =============================================================================
 */

// =============================================================================
// Constants
// =============================================================================

/**
 * Chart.js color constants for consistent styling
 */
const CHART_COLORS = {
  min: { border: "#198754", background: "#19875422" },
  avg: { border: "#0d6efd", background: "#0d6efd22" },
  max: { border: "#dc3545", background: "#dc354522" },
  actual: { border: "#6f42c1", background: "#6f42c1" },
  weeklyMin: { border: "#20c997", background: "#20c997" },
  weeklyMax: { border: "#fd7e14", background: "#fd7e14" },
  weeklyMedian: { border: "#e83e8c", background: "#e83e8c" },
};

// =============================================================================
// Axis and Label Utilities
// =============================================================================

/**
 * Get axis label for trend chart
 * @param {string} xAxis - X-axis field name
 * @returns {string} Human-readable label
 */
function getAxisLabel(xAxis) {
  const labels = {
    resUnits: "総戸数",
    floors: "階数",
    totalArea: "延床面積 (㎡)",
    constArea: "施工面積 (㎡)",
  };
  return labels[xAxis] || xAxis;
}

// =============================================================================
// Chart Data Preparation
// =============================================================================

/**
 * Prepare weekly grouped data for table display
 * @param {Array} records - Records to group by week
 * @returns {Array} Weekly grouped data with statistics and records
 */
function prepareWeeklyTableData(records) {
  const weekData = {};

  // Group records by week
  for (const record of records) {
    const week = record.orderWeek;
    if (!weekData[week]) {
      weekData[week] = {
        weekStart: record.orderWeekStart,
        week: week,
        records: [],
        prices: [],
      };
    }
    weekData[week].records.push(record);
    weekData[week].prices.push(record.price);
  }

  // Sort weeks and compute statistics
  const sortedWeeks = Object.keys(weekData).sort();
  return sortedWeeks.map((week) => {
    const entry = weekData[week];
    const prices = entry.prices;

    // Calculate statistics using shared utility
    const stats = calcPriceStats(prices);
    const median = calcMedian(prices);

    return {
      weekStart: entry.weekStart,
      week: week,
      count: prices.length,
      minPrice: stats.min,
      maxPrice: stats.max,
      avgPrice: stats.avg,
      medianPrice: Math.round(median),
      records: entry.records,
    };
  });
}

/**
 * Create value ranges for heatmap visualization
 *
 * Algorithm:
 * 1. Find min/max values in the dataset
 * 2. Divide the range into equal-sized buckets
 * 3. Generate human-readable labels based on field type
 * 4. Ensure the last bucket includes the maximum value (inclusive)
 *
 * @param {Array} values - Array of values
 * @param {number} buckets - Number of buckets (default from CHART_CONFIG)
 * @param {string} fieldType - Type of field ('price', 'totalArea', 'constArea', 'floors', 'resUnits')
 * @returns {Array} Array of {min, max, label}
 */
function createValueRanges(values, buckets, fieldType) {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = (max - min) / buckets || 1;

  return Array.from({ length: buckets }, (_, i) => {
    const rangeMin = min + step * i;
    const rangeMax = min + step * (i + 1);
    const isLastRange = i === buckets - 1;

    // ラベル表示用の最小値と最大値を丸める
    const displayMin = Math.round(rangeMin);
    const displayMax = isLastRange ? Math.round(max) : Math.round(rangeMax - 1);

    // Generate label based on field type
    let label;
    if (fieldType === 'price') {
      label = `¥${formatNumber(displayMin)}~¥${formatNumber(displayMax)}`;
    } else if (fieldType === 'totalArea' || fieldType === 'constArea') {
      label = `${formatNumber(displayMin)}~${formatNumber(displayMax)}㎡`;
    } else if (fieldType === 'floors' || fieldType === 'resUnits') {
      label = `${displayMin}~${displayMax}`;
    } else {
      label = `${formatNumber(displayMin)}~${formatNumber(displayMax)}`;
    }

    return {
      min: rangeMin,
      max: isLastRange ? max : rangeMax,
      label: label,
    };
  });
}

// =============================================================================
// Chart.js Dataset and Options Builders
// =============================================================================

/**
 * Create a reference line dataset for chart
 * @param {string} label - Dataset label
 * @param {number} value - Constant value for the line
 * @param {number} count - Number of data points
 * @param {{border: string, background: string}} colors - Color config
 * @returns {Object} Chart.js dataset configuration
 */
function createReferenceLine(label, value, count, colors) {
  return {
    label: `${label} (¥${formatNumber(value)})`,
    data: Array(count).fill(value),
    borderColor: colors.border,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderDash: [5, 5],
    pointRadius: 0,
    fill: false,
    tension: 0,
  };
}

/**
 * Build datasets for trend line chart
 * @param {Object} data - Chart data with weekLabels, actualData, stats, weekCount
 * @returns {Array} Chart.js datasets
 */
function buildTrendDatasets(data) {
  const {
    actualData,
    weeklyMinData,
    weeklyMaxData,
    weeklyMedianData,
    stats,
    weekCount,
  } = data;
  return [
    createReferenceLine(
      "最小値",
      stats.min,
      weekCount,
      CHART_COLORS.min
    ),
    createReferenceLine(
      "平均値",
      stats.avg,
      weekCount,
      CHART_COLORS.avg
    ),
    createReferenceLine(
      "最大値",
      stats.max,
      weekCount,
      CHART_COLORS.max
    ),
    {
      label: "実行単価(週最小)",
      data: weeklyMinData,
      borderColor: CHART_COLORS.weeklyMin.border,
      backgroundColor: CHART_COLORS.weeklyMin.background,
      borderWidth: 1,
      pointRadius: 4,
      pointHoverRadius: 6,
      fill: false,
      tension: 0.1,
    },
    {
      label: "実行単価(週中央値)",
      data: weeklyMedianData,
      borderColor: CHART_COLORS.weeklyMedian.border,
      backgroundColor: CHART_COLORS.weeklyMedian.background,
      borderWidth: 2,
      pointRadius: 5,
      pointHoverRadius: 7,
      fill: false,
      tension: 0.1,
    },
    {
      label: "実行単価(週平均)",
      data: actualData,
      borderColor: CHART_COLORS.actual.border,
      backgroundColor: CHART_COLORS.actual.background,
      borderWidth: 2,
      pointRadius: 8,
      pointHoverRadius: 10,
      fill: false,
      tension: 0.1,
    },
    {
      label: "実行単価(週最大)",
      data: weeklyMaxData,
      borderColor: CHART_COLORS.weeklyMax.border,
      backgroundColor: CHART_COLORS.weeklyMax.background,
      borderWidth: 1,
      pointRadius: 4,
      pointHoverRadius: 6,
      fill: false,
      tension: 0.1,
    },
  ];
}

/**
 * Create line chart options
 * @param {Object} options - Additional options { unit, showXTitle }
 * @returns {Object} Chart.js options config
 */
function createLineChartOptions(options = {}) {
  const { unit = "", showXTitle = false } = options;
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: "index" },
    plugins: {
      legend: {
        position: "top",
        labels: { usePointStyle: true, padding: 20 },
      },
      tooltip: {
        callbacks: {
          label: (context) =>
            `${context.dataset.label}: ¥${formatNumber(
              context.raw ?? context.parsed?.y
            )}`,
        },
      },
    },
    scales: {
      x: {
        title: showXTitle
          ? { display: true, text: "発注週" }
          : { display: false },
        grid: { display: false },
      },
      y: {
        beginAtZero: false,
        title: unit
          ? { display: true, text: `実行単価 (円/${unit})` }
          : { display: false },
        ticks: { callback: (value) => `¥${formatNumber(value)}` },
      },
    },
  };
}
