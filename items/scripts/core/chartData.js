/**
 * チャートデータ生成の純粋関数群
 */

/**
 * レコードから協力会社別のチャートデータセットを生成する
 * @param {Array} records - レコードの配列
 * @param {Function} getCompanyColor - 会社色を取得する関数
 * @returns {Array} Chart.jsのデータセット配列
 */
export function buildChartDatasets(records, getCompanyColor) {
  const companyData = {};
  records.forEach((r) => {
    const name = r.company;
    if (!companyData[name]) {
      companyData[name] = [];
    }
    companyData[name].push({
      x: r.projectPeriodStart,
      y: r.netPrice,
      project: r.projectName,
    });
  });

  return Object.entries(companyData).map(([company, data]) => ({
    label: company.replace("株式会社 ", ""),
    data: data,
    borderColor: getCompanyColor(company),
    backgroundColor: getCompanyColor(company) + "33",
    borderWidth: 2,
    pointRadius: 6,
    pointHoverRadius: 8,
    fill: false,
    tension: 0.1,
  }));
}

/**
 * レコードから全期間のラベルを生成する
 * @param {Array} records - レコードの配列
 * @returns {Array} ソート済みの期間ラベル配列
 */
export function buildPeriodLabels(records) {
  return [...new Set(records.map((r) => r.projectPeriodStart))].sort();
}

/**
 * レスポンシブ設定に基づいてチャートオプションを生成する
 * @param {boolean} isMobile - モバイル判定
 * @param {boolean} isSmallMobile - 小画面モバイル判定
 * @param {string} unit - 単位
 * @param {Function} fmt - フォーマット関数
 * @returns {Object} Chart.jsのオプションオブジェクト
 */
export function buildChartOptions(isMobile, isSmallMobile, unit, fmt) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: {
      intersect: false,
      mode: "index",
    },
    plugins: {
      legend: {
        position: isMobile ? "bottom" : "top",
        labels: {
          usePointStyle: true,
          padding: isMobile ? 10 : 20,
          font: {
            size: isMobile ? 10 : 12,
          },
          boxWidth: isMobile ? 20 : 40,
          boxHeight: isMobile ? 10 : 12,
        },
      },
      tooltip: {
        enabled: !isSmallMobile,
        callbacks: {
          label: function (context) {
            const point = context.raw;
            return `${context.dataset.label}: ¥${fmt(point.y)} (${point.project})`;
          },
        },
        bodyFont: {
          size: isMobile ? 10 : 12,
        },
        titleFont: {
          size: isMobile ? 11 : 13,
        },
      },
    },
    scales: {
      x: {
        title: {
          display: !isSmallMobile,
          text: "見積時期",
          font: {
            size: isMobile ? 10 : 12,
          },
        },
        ticks: {
          font: {
            size: isMobile ? 9 : 11,
          },
          maxRotation: isMobile ? 45 : 0,
          minRotation: isMobile ? 45 : 0,
        },
        grid: {
          display: false,
        },
      },
      y: {
        title: {
          display: !isSmallMobile,
          text: `NET単価 (円/${unit})`,
          font: {
            size: isMobile ? 10 : 12,
          },
        },
        ticks: {
          font: {
            size: isMobile ? 9 : 11,
          },
          callback: function (value) {
            if (isMobile) {
              return (
                "¥" + (value >= 1000 ? Math.round(value / 1000) + "k" : value)
              );
            }
            return "¥" + fmt(value);
          },
        },
      },
    },
  };
}
