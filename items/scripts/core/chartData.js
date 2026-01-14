/**
 * チャートデータ生成の純粋関数群
 */

/**
 * レスポンシブ設定に基づいてチャートオプションを生成する
 * @param {boolean} isMobile - モバイル判定
 * @param {boolean} isSmallMobile - 小画面モバイル判定
 * @param {string} unit - 単位
 * @param {Function} formatNumber - フォーマット関数
 * @returns {Object} Chart.jsのオプションオブジェクト
 */
export function buildChartOptions(isMobile, isSmallMobile, unit, formatNumber) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: {
      intersect: false,
      mode: "index",
    },
    plugins: {
      legend: buildLegendOptions(isMobile),
      tooltip: buildTooltipOptions(isSmallMobile, formatNumber),
    },
    scales: {
      x: buildXAxisOptions(isMobile, isSmallMobile),
      y: buildYAxisOptions(isMobile, isSmallMobile, unit, formatNumber),
    },
  };
}

/**
 * 凡例オプションを生成
 * @param {boolean} isMobile - モバイル判定
 * @returns {Object} 凡例オプション
 */
function buildLegendOptions(isMobile) {
  return {
    position: isMobile ? "bottom" : "top",
    labels: {
      usePointStyle: true,
      padding: isMobile ? 10 : 20,
      font: { size: isMobile ? 10 : 12 },
      boxWidth: isMobile ? 20 : 40,
      boxHeight: isMobile ? 10 : 12,
    },
  };
}

/**
 * ツールチップオプションを生成
 * @param {boolean} isSmallMobile - 小画面モバイル判定
 * @param {Function} formatNumber - フォーマット関数
 * @returns {Object} ツールチップオプション
 */
function buildTooltipOptions(isSmallMobile, formatNumber) {
  return {
    enabled: !isSmallMobile,
    callbacks: {
      label: function (context) {
        const point = context.raw;
        // 統計データセット（数値）とオブジェクト形式の両方に対応
        if (typeof point === "number") {
          return `${context.dataset.label}: ¥${formatNumber(point)}`;
        }
        // オブジェクト形式 { x, y, project } の場合
        return `${context.dataset.label}: ¥${formatNumber(point.y)} (${
          point.project
        })`;
      },
    },
    bodyFont: { size: isSmallMobile ? 10 : 12 },
    titleFont: { size: isSmallMobile ? 11 : 13 },
  };
}

/**
 * X軸オプションを生成
 * @param {boolean} isMobile - モバイル判定
 * @param {boolean} isSmallMobile - 小画面モバイル判定
 * @returns {Object} X軸オプション
 */
function buildXAxisOptions(isMobile, isSmallMobile) {
  return {
    title: {
      display: !isSmallMobile,
      text: "見積日付",
      font: { size: isMobile ? 10 : 12 },
    },
    ticks: {
      font: { size: isMobile ? 9 : 11 },
      maxRotation: isMobile ? 45 : 0,
      minRotation: isMobile ? 45 : 0,
    },
    grid: { display: false },
  };
}

/**
 * Y軸オプションを生成
 * @param {boolean} isMobile - モバイル判定
 * @param {boolean} isSmallMobile - 小画面モバイル判定
 * @param {string} unit - 単位
 * @param {Function} formatNumber - フォーマット関数
 * @returns {Object} Y軸オプション
 */
function buildYAxisOptions(isMobile, isSmallMobile, unit, formatNumber) {
  return {
    title: {
      display: !isSmallMobile,
      text: `NET単価 (円/${unit})`,
      font: { size: isMobile ? 10 : 12 },
    },
    ticks: {
      font: { size: isMobile ? 9 : 11 },
      callback: function (value) {
        if (isMobile) {
          return "¥" + (value >= 1000 ? Math.round(value / 1000) + "k" : value);
        }
        return "¥" + formatNumber(value);
      },
    },
  };
}

// =============================================================================
// 統計チャートデータセット関連
// =============================================================================

/**
 * Chart.jsカラー定数
 */
const CHART_COLORS = {
  min: { border: "#198754", background: "#19875422" },
  avg: { border: "#0d6efd", background: "#0d6efd22" },
  median: { border: "#e83e8c", background: "#e83e8c22" },
  max: { border: "#dc3545", background: "#dc354522" },
};

/**
 * データセットスタイル定数
 */
const DATASET_STYLES = {
  primary: {
    borderWidth: 2,
    pointRadius: 5,
    pointHoverRadius: 7,
    fill: false,
    tension: 0.3,
  },
  secondary: {
    borderWidth: 1.5,
    pointRadius: 4,
    pointHoverRadius: 6,
    fill: false,
    tension: 0.3,
    borderDash: [5, 5],
  },
};

/**
 * 中央値を計算
 * @param {number[]} values - 数値配列
 * @returns {number} 中央値
 */
function calcMedian(values) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * 時間軸ごとの統計データセットを生成
 * @param {Object} groupedByPeriod - 期間でグループ化されたレコード { period: records[] }
 * @returns {Object} 統計データ { avgData, medianData, minData, maxData, periods }
 */
export function buildPeriodStatistics(groupedByPeriod) {
  const sortedPeriods = Object.keys(groupedByPeriod).sort();

  const avgData = [];
  const medianData = [];
  const minData = [];
  const maxData = [];

  sortedPeriods.forEach((period) => {
    const periodRecords = groupedByPeriod[period];
    const prices = periodRecords.map((r) => r.netUnitPrice);

    // 各統計値を計算
    const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    const median = calcMedian(prices);
    const min = Math.min(...prices);
    const max = Math.max(...prices);

    avgData.push(avg);
    medianData.push(median);
    minData.push(min);
    maxData.push(max);
  });

  return {
    periods: sortedPeriods,
    avgData,
    medianData,
    minData,
    maxData,
  };
}

/**
 * 統計データセットを生成（kentakuの多角分析参照）
 * @param {Object} periodStats - buildPeriodStatistics()の戻り値
 * @returns {Array} Chart.jsのデータセット配列
 */
export function buildStatisticsDatasets(periodStats) {
  const { avgData, medianData, minData, maxData } = periodStats;

  return [
    // 最小値（緑・破線）
    {
      label: "最小値",
      data: minData,
      borderColor: CHART_COLORS.min.border,
      backgroundColor: CHART_COLORS.min.background,
      ...DATASET_STYLES.secondary,
    },
    // 平均値（青・実線）
    {
      label: "平均値",
      data: avgData,
      borderColor: CHART_COLORS.avg.border,
      backgroundColor: CHART_COLORS.avg.background,
      ...DATASET_STYLES.primary,
    },
    // 中央値（ピンク・実線）
    {
      label: "中央値",
      data: medianData,
      borderColor: CHART_COLORS.median.border,
      backgroundColor: CHART_COLORS.median.background,
      ...DATASET_STYLES.primary,
    },
    // 最大値（赤・破線）
    {
      label: "最大値",
      data: maxData,
      borderColor: CHART_COLORS.max.border,
      backgroundColor: CHART_COLORS.max.background,
      ...DATASET_STYLES.secondary,
    },
  ];
}
