/**
 * =============================================================================
 * app.js - アプリケーションロジックモジュール
 * =============================================================================
 *
 * 概要:
 *   Alpine.jsで使用するアプリケーションのメインロジックを定義します。
 *   フィルタリング、データ集計、チャート表示などのビジネスロジックを含みます。
 *
 * 分類: アプリケーション層 (Application Layer)
 *
 * 依存関係:
 *   - utils.js  : ユーティリティ関数（formatNumber, formatDateHyphen, getWeekNumber, calcPriceStats, isInRange等）
 *   - data.js   : 生データ（rawRecords）
 *   - Alpine.js : リアクティブUIフレームワーク
 *   - Chart.js  : グラフ描画ライブラリ
 *   - Bootstrap : UIコンポーネント（モーダル等）
 *
 * =============================================================================
 */

/**
 * Chart.js color constants for consistent styling
 */
const CHART_COLORS = {
  min: { border: "#198754", background: "#19875422" },
  avg: { border: "#0d6efd", background: "#0d6efd22" },
  max: { border: "#dc3545", background: "#dc354522" },
  actual: { border: "#6f42c1", background: "#6f42c1" },
};

function appData() {
  return {
    filters: {
      project: "",
      regions: [],
      majorCodes: [],
      dateFrom: "",
      dateTo: "",
      floorMin: null,
      floorMax: null,
      unitRowMin: null,
      unitRowMax: null,
      resUnitMin: null,
      resUnitMax: null,
      constAreaMin: null,
      constAreaMax: null,
      totalAreaMin: null,
      totalAreaMax: null,
      item: "",
      vendor: "",
    },
    rawRecords: rawRecords,
    records: [],
    itemGroups: [],
    filteredGroups: [],
    expandedGroups: {},
    autocomplete: {
      show: false,
      items: [],
      activeIndex: -1,
    },
    projectNames: [],
    chartData: {
      title: "",
      item: "",
      unit: "",
      records: [],
      displayMode: "chart", // 'chart' or 'table'
      minPrice: 0,
      maxPrice: 0,
      avgPrice: 0,
    },
    chartInstance: null,

    // Detail Analysis Modal State
    detailModal: {
      isOpen: false,
      currentGroup: null,
      groupBy: "timeline",
      displayMode: "list",
      chartType: "trend",
    },
    detailChartInstance: null,

    regionNames: [],
    regionDropdownOpen: false,

    init() {
      this.processData();
      this.groupByItem();
      this.clearFilters();
      this.projectNames = [
        ...new Set(this.rawRecords.map((r) => r.projectName)),
      ].sort();
      this.regionNames = [
        ...new Set(this.rawRecords.map((r) => r.region)),
      ].sort();
    },

    toggleRegionDropdown() {
      this.regionDropdownOpen = !this.regionDropdownOpen;
    },

    toggleRegion(region) {
      const idx = this.filters.regions.indexOf(region);
      if (idx === -1) {
        this.filters.regions.push(region);
      } else {
        this.filters.regions.splice(idx, 1);
      }
    },

    confirmRegionSelection() {
      this.regionDropdownOpen = false;
      this.applyFilters();
    },

    isRegionSelected(region) {
      return this.filters.regions.includes(region);
    },

    get selectedRegionsText() {
      if (this.filters.regions.length === 0) return "すべて";
      if (this.filters.regions.length <= 2)
        return this.filters.regions.join(", ");
      return `${this.filters.regions.length}件選択中`;
    },

    processData() {
      this.records = this.rawRecords.map((r) => ({
        ...r,
        orderDateFormatted: formatDateHyphen(r.orderDate),
        orderMonth: r.orderDate
          ? r.orderDate.slice(0, 4) + "-" + r.orderDate.slice(4, 6)
          : "",
        orderWeek: r.orderDate ? getWeekNumber(r.orderDate) : "",
        orderWeekStart: r.orderDate ? getWeekStartDate(r.orderDate) : "",
        amount: r.qty * r.price,
      }));
    },

    groupByItem() {
      const groups = {};
      this.records.forEach((item) => {
        const key = `${item.item}|${item.spec}`;
        if (!groups[key])
          groups[key] = {
            item: item.item,
            spec: item.spec,
            unit: item.unit,
            records: [],
          };
        groups[key].records.push(item);
      });
      this.itemGroups = Object.values(groups).map((g) => {
        g.records.sort((a, b) => a.orderDate.localeCompare(b.orderDate));
        const prices = g.records.map((r) => r.price);
        const stats = calcPriceStats(prices);
        return {
          ...g,
          recordCount: g.records.length,
          minPrice: stats.min,
          maxPrice: stats.max,
          avgPrice: stats.avg,
        };
      });
    },

    applyFilters() {
      const projectKw = this.filters.project.toLowerCase();
      const itemKw = this.filters.item.toLowerCase();
      const regions = this.filters.regions;
      const majorCodes = this.filters.majorCodes;
      const vendor = this.filters.vendor.toLowerCase();
      const dateFrom = this.filters.dateFrom.replace(/-/g, "");
      const dateTo = this.filters.dateTo.replace(/-/g, "");
      const f = this.filters;

      this.filteredGroups = this.itemGroups
        .map((g) => {
          const matchingRecords = g.records.filter((r) => {
            if (projectKw && !r.projectName.toLowerCase().includes(projectKw))
              return false;
            if (regions.length && !regions.includes(r.region)) return false;
            if (majorCodes.length && !majorCodes.includes(r.majorCode))
              return false;
            if (vendor && !r.vendor.toLowerCase().includes(vendor))
              return false;
            if (dateFrom && r.orderDate < dateFrom) return false;
            if (dateTo && r.orderDate > dateTo) return false;
            if (!isInRange(r.floors, f.floorMin, f.floorMax)) return false;
            if (!isInRange(r.unitRow, f.unitRowMin, f.unitRowMax)) return false;
            if (!isInRange(r.resUnits, f.resUnitMin, f.resUnitMax))
              return false;
            if (!isInRange(r.constArea, f.constAreaMin, f.constAreaMax))
              return false;
            if (!isInRange(r.totalArea, f.totalAreaMin, f.totalAreaMax))
              return false;
            return true;
          });
          const prices = matchingRecords.map((r) => r.price);
          const stats = calcPriceStats(prices);
          return {
            ...g,
            filteredRecords: matchingRecords,
            minPrice: stats.min,
            maxPrice: stats.max,
          };
        })
        .filter((g) => {
          if (
            itemKw &&
            !g.item.toLowerCase().includes(itemKw) &&
            !g.spec.toLowerCase().includes(itemKw)
          )
            return false;
          return g.filteredRecords.length > 0;
        });
    },

    clearFilters() {
      this.filters = {
        project: "",
        regions: [],
        majorCodes: [],
        dateFrom: "",
        dateTo: "",
        floorMin: null,
        floorMax: null,
        unitRowMin: null,
        unitRowMax: null,
        resUnitMin: null,
        resUnitMax: null,
        constAreaMin: null,
        constAreaMax: null,
        totalAreaMin: null,
        totalAreaMax: null,
        item: "",
        vendor: "",
      };
      this.filteredGroups = this.itemGroups.map((g) => ({
        ...g,
        filteredRecords: g.records,
      }));
    },

    get activeFiltersDisplay() {
      const filters = [];
      if (this.filters.project)
        filters.push(`工事名称: ${this.filters.project}`);
      if (this.filters.regions.length)
        filters.push(`支店名: ${this.filters.regions.join(", ")}`);
      if (this.filters.majorCodes.length)
        filters.push(`大工事項目: ${this.filters.majorCodes.join(", ")}`);
      if (this.filters.item)
        filters.push(`小工事項目名称: ${this.filters.item}`);
      if (this.filters.vendor) filters.push(`業者: ${this.filters.vendor}`);
      return filters;
    },

    toggleGroup(idx) {
      this.expandedGroups[idx] = !this.expandedGroups[idx];
    },

    getVendorSummary(records) {
      const vendorData = {};
      records.forEach((record) => {
        const vendorName = record.vendor;
        if (!vendorData[vendorName]) {
          vendorData[vendorName] = { prices: [], count: 0 };
        }
        vendorData[vendorName].prices.push(record.price);
        vendorData[vendorName].count++;
      });
      return Object.entries(vendorData).map(([name, data]) => {
        const stats = calcPriceStats(data.prices);
        return {
          name: name.replace(/株式会社|有限会社/g, "").trim(),
          count: data.count,
          min: stats.min,
          avg: stats.avg,
          max: stats.max,
        };
      });
    },

    filterProjectNames() {
      const filter = this.filters.project;
      this.autocomplete.items = filter
        ? this.projectNames.filter((p) =>
            p.toLowerCase().includes(filter.toLowerCase())
          )
        : this.projectNames;
      this.autocomplete.activeIndex = -1;
    },

    moveAutocompleteDown() {
      if (!this.autocomplete.show) return;
      this.autocomplete.activeIndex = Math.min(
        this.autocomplete.activeIndex + 1,
        this.autocomplete.items.length - 1
      );
    },

    moveAutocompleteUp() {
      if (!this.autocomplete.show) return;
      this.autocomplete.activeIndex = Math.max(
        this.autocomplete.activeIndex - 1,
        0
      );
    },

    selectAutocomplete() {
      if (
        this.autocomplete.show &&
        this.autocomplete.activeIndex >= 0 &&
        this.autocomplete.items[this.autocomplete.activeIndex]
      ) {
        this.filters.project =
          this.autocomplete.items[this.autocomplete.activeIndex];
        this.autocomplete.show = false;
      }
    },

    selectProject(event) {
      if (event.target.classList.contains("autocomplete-item")) {
        this.filters.project = event.target.dataset.value;
        this.autocomplete.show = false;
      }
    },

    /**
     * Prepare chart data by grouping records by week
     * @param {Array} records - Filtered records to chart
     * @returns {{weekLabels: string[], actualData: number[], stats: {min: number, max: number, avg: number}}}
     */
    prepareChartData(records) {
      const weekData = {};
      records.forEach((record) => {
        if (!weekData[record.orderWeek]) {
          weekData[record.orderWeek] = {
            prices: [],
            weekStart: record.orderWeekStart,
          };
        }
        weekData[record.orderWeek].prices.push(record.price);
      });

      const allWeeks = Object.keys(weekData).sort();
      const weekLabels = allWeeks.map((week) => weekData[week].weekStart);
      const actualData = allWeeks.map((week) => {
        const prices = weekData[week].prices;
        return prices.reduce((a, b) => a + b, 0) / prices.length;
      });

      const allPrices = records.map((r) => r.price);
      const stats = calcPriceStats(allPrices);

      return { weekLabels, actualData, stats, weekCount: allWeeks.length };
    },

    /**
     * Create a reference line dataset for chart
     * @param {string} label - Dataset label
     * @param {number} value - Constant value for the line
     * @param {number} count - Number of data points
     * @param {{border: string, background: string}} colors - Color config
     * @returns {Object} Chart.js dataset configuration
     */
    createReferenceLine(label, value, count, colors) {
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
    },

    setChartDisplayMode(mode) {
      this.chartData.displayMode = mode;
      if (mode === "chart") {
        this.$nextTick(() => {
          this.renderPriceChart();
        });
      }
    },

    renderPriceChart() {
      const ctx = this.$refs.netPriceChart.getContext("2d");
      if (this.chartInstance) this.chartInstance.destroy();

      const { weekLabels, actualData, stats, weekCount } = this.prepareChartData(
        this.chartData.records
      );

      const datasets = [
        this.createReferenceLine("最小値", stats.min, weekCount, CHART_COLORS.min),
        this.createReferenceLine("平均値", stats.avg, weekCount, CHART_COLORS.avg),
        this.createReferenceLine("最大値", stats.max, weekCount, CHART_COLORS.max),
        {
          label: "実行単価",
          data: actualData,
          borderColor: CHART_COLORS.actual.border,
          backgroundColor: CHART_COLORS.actual.background,
          borderWidth: 2,
          pointRadius: 8,
          pointHoverRadius: 10,
          fill: false,
          tension: 0.1,
        },
      ];

      this.$refs.chartWrapper.style.width = "100%";

      this.chartInstance = new Chart(ctx, {
        type: "line",
        data: { labels: weekLabels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "top" },
            tooltip: {
              callbacks: {
                label: (context) =>
                  `${context.dataset.label}: ¥${formatNumber(context.parsed.y)}`,
              },
            },
          },
          scales: {
            y: {
              beginAtZero: false,
              ticks: {
                callback: (value) => `¥${formatNumber(value)}`,
              },
            },
          },
        },
      });
    },

    showChart(idx) {
      const group = this.filteredGroups[idx];
      const records = group.filteredRecords;
      const prices = records.map((r) => r.price);
      this.chartData = {
        title: `単価推移 - ${group.item}`,
        item: group.item,
        unit: group.unit,
        records: records,
        displayMode: "chart",
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        avgPrice: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      };

      this.$nextTick(() => {
        this.renderPriceChart();
        new bootstrap.Modal(this.$refs.chartModal).show();
      });
    },

    // =========================================================================
    // Detail Analysis Modal Methods
    // =========================================================================

    /**
     * Open detail analysis modal for a specific item group
     * @param {number} idx - Index of the filtered group
     */
    openDetailModal(idx) {
      const group = this.filteredGroups[idx];
      this.detailModal = {
        isOpen: true,
        currentGroup: { ...group },
        groupBy: "timeline",
        displayMode: "list",
        chartType: "trend",
      };
      this.$nextTick(() => {
        new bootstrap.Modal(this.$refs.detailModal).show();
      });
    },

    /**
     * Close detail analysis modal and cleanup
     */
    closeDetailModal() {
      if (this.detailChartInstance) {
        this.detailChartInstance.destroy();
        this.detailChartInstance = null;
      }
      this.detailModal.isOpen = false;
    },

    /**
     * Set display mode and trigger chart render if needed
     * @param {string} mode - 'list' or 'chart'
     */
    setDetailDisplayMode(mode) {
      this.detailModal.displayMode = mode;
      if (mode === "chart") {
        this.renderDetailChart();
      }
    },

    /**
     * Get grouped detail data based on current groupBy setting
     * @returns {Object} Grouped records { key: records[] }
     */
    getGroupedDetailData() {
      const records = this.detailModal.currentGroup?.filteredRecords || [];
      const groupBy = this.detailModal.groupBy;

      const keyFn = {
        timeline: (r) => r.orderMonth,
        majorCode: (r) => r.majorCode,
        region: (r) => r.region,
        building: (r) => buildingInfoKey(r),
        vendor: (r) => r.vendor,
      }[groupBy];

      const groups = groupRecordsBy(records, keyFn);

      // Sort by key for timeline
      if (groupBy === "timeline") {
        return Object.fromEntries(
          Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
        );
      }

      // Sort groups by record count (descending) for others
      return Object.fromEntries(
        Object.entries(groups).sort(([, a], [, b]) => b.length - a.length)
      );
    },

    /**
     * Prepare chart data based on current chart type
     * @returns {Object} Chart data
     */
    prepareDetailChartData() {
      const records = this.detailModal.currentGroup?.filteredRecords || [];
      switch (this.detailModal.chartType) {
        case "trend":
          return this.prepareChartData(records);
        case "comparison":
          return this.prepareComparisonData();
        case "distribution":
          return createDistribution(
            records.map((r) => r.price),
            10
          );
        default:
          return null;
      }
    },

    /**
     * Prepare comparison chart data (min/avg/max by group)
     * @returns {Object} { labels, avgPrices, minPrices, maxPrices }
     */
    prepareComparisonData() {
      const grouped = this.getGroupedDetailData();
      const labels = Object.keys(grouped);
      const avgPrices = labels.map(
        (k) => calcPriceStats(grouped[k].map((r) => r.price)).avg
      );
      const minPrices = labels.map(
        (k) => calcPriceStats(grouped[k].map((r) => r.price)).min
      );
      const maxPrices = labels.map(
        (k) => calcPriceStats(grouped[k].map((r) => r.price)).max
      );
      return { labels, avgPrices, minPrices, maxPrices };
    },

    /**
     * Render detail chart based on current chart type
     */
    renderDetailChart() {
      this.$nextTick(() => {
        const ctx = this.$refs.detailChart?.getContext("2d");
        if (!ctx) return;

        if (this.detailChartInstance) {
          this.detailChartInstance.destroy();
        }

        const chartType = this.detailModal.chartType;
        const data = this.prepareDetailChartData();

        if (chartType === "trend") {
          this.renderTrendChart(ctx, data);
        } else if (chartType === "comparison") {
          this.renderComparisonChart(ctx, data);
        } else if (chartType === "distribution") {
          this.renderDistributionChart(ctx, data);
        }
      });
    },

    /**
     * Render trend line chart
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} data - Chart data from prepareChartData
     */
    renderTrendChart(ctx, data) {
      const { weekLabels, actualData, stats, weekCount } = data;
      const unit = this.detailModal.currentGroup?.unit || "";

      const datasets = [
        this.createReferenceLine(
          "最小値",
          stats.min,
          weekCount,
          CHART_COLORS.min
        ),
        this.createReferenceLine(
          "平均値",
          stats.avg,
          weekCount,
          CHART_COLORS.avg
        ),
        this.createReferenceLine(
          "最大値",
          stats.max,
          weekCount,
          CHART_COLORS.max
        ),
        {
          label: "実行単価",
          data: actualData,
          borderColor: CHART_COLORS.actual.border,
          backgroundColor: CHART_COLORS.actual.background,
          borderWidth: 2,
          pointRadius: 8,
          pointHoverRadius: 10,
          fill: false,
          tension: 0.1,
        },
      ];

      this.detailChartInstance = new Chart(ctx, {
        type: "line",
        data: { labels: weekLabels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: "index" },
          plugins: {
            legend: {
              position: "top",
              labels: { usePointStyle: true, padding: 20 },
            },
            tooltip: {
              callbacks: {
                label: (context) =>
                  `${context.dataset.label}: ¥${formatNumber(context.raw)}`,
              },
            },
          },
          scales: {
            x: {
              title: { display: true, text: "発注週" },
              grid: { display: false },
            },
            y: {
              title: { display: true, text: `実行単価 (円/${unit})` },
              ticks: { callback: (value) => "¥" + formatNumber(value) },
            },
          },
        },
      });
    },

    /**
     * Render comparison bar chart (min/avg/max by group)
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} data - { labels, avgPrices, minPrices, maxPrices }
     */
    renderComparisonChart(ctx, data) {
      const { labels, avgPrices, minPrices, maxPrices } = data;
      const unit = this.detailModal.currentGroup?.unit || "";

      this.detailChartInstance = new Chart(ctx, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "最小",
              data: minPrices,
              backgroundColor: CHART_COLORS.min.border,
            },
            {
              label: "平均",
              data: avgPrices,
              backgroundColor: CHART_COLORS.avg.border,
            },
            {
              label: "最大",
              data: maxPrices,
              backgroundColor: CHART_COLORS.max.border,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "top" },
            tooltip: {
              callbacks: {
                label: (context) =>
                  `${context.dataset.label}: ¥${formatNumber(context.raw)}`,
              },
            },
          },
          scales: {
            x: { grid: { display: false } },
            y: {
              title: { display: true, text: `実行単価 (円/${unit})` },
              ticks: { callback: (value) => "¥" + formatNumber(value) },
            },
          },
        },
      });
    },

    /**
     * Render distribution histogram chart
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} data - { labels, counts }
     */
    renderDistributionChart(ctx, data) {
      const { labels, counts } = data;

      this.detailChartInstance = new Chart(ctx, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "件数",
              data: counts,
              backgroundColor: CHART_COLORS.actual.border,
              borderColor: CHART_COLORS.actual.border,
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (context) => `${context.raw}件`,
              },
            },
          },
          scales: {
            x: {
              title: { display: true, text: "単価範囲" },
              grid: { display: false },
            },
            y: {
              title: { display: true, text: "件数" },
              ticks: { stepSize: 1 },
            },
          },
        },
      });
    },
  };
}
