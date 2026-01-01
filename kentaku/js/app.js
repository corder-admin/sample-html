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
 *   - utils.js       : ユーティリティ関数（formatNumber, formatDateHyphen, getWeekNumber, calcPriceStats, isInRange等）
 *   - db.js          : IndexedDB操作モジュール
 *   - data-loader.js : データ読み込み管理モジュール
 *   - data.js        : 生データ（rawRecords）- フォールバック用
 *   - Alpine.js      : リアクティブUIフレームワーク
 *   - Chart.js       : グラフ描画ライブラリ
 *   - Bootstrap      : UIコンポーネント（モーダル等）
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
  weeklyMin: { border: "#20c997", background: "#20c997" },
  weeklyMax: { border: "#fd7e14", background: "#fd7e14" },
  weeklyMedian: { border: "#e83e8c", background: "#e83e8c" },
};

/**
 * Default filter values - single source of truth
 */
const DEFAULT_FILTERS = {
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

/**
 * Check if a record matches all filter criteria
 * @param {Object} record - Record to check
 * @param {Object} criteria - Filter criteria
 * @returns {boolean} True if record matches all criteria
 */
function recordMatchesFilters(record, criteria) {
  const { projectKw, regions, majorCodes, vendor, dateFrom, dateTo, ranges } =
    criteria;

  if (projectKw && !record.projectName.toLowerCase().includes(projectKw))
    return false;
  if (regions.length && !regions.includes(record.region)) return false;
  if (majorCodes.length && !majorCodes.includes(record.majorCode)) return false;
  if (vendor && !record.vendor.toLowerCase().includes(vendor)) return false;
  if (dateFrom && record.orderDate < dateFrom) return false;
  if (dateTo && record.orderDate > dateTo) return false;
  if (!isInRange(record.floors, ranges.floorMin, ranges.floorMax)) return false;
  if (!isInRange(record.unitRow, ranges.unitRowMin, ranges.unitRowMax))
    return false;
  if (!isInRange(record.resUnits, ranges.resUnitMin, ranges.resUnitMax))
    return false;
  if (!isInRange(record.constArea, ranges.constAreaMin, ranges.constAreaMax))
    return false;
  if (!isInRange(record.totalArea, ranges.totalAreaMin, ranges.totalAreaMax))
    return false;

  return true;
}

function appData() {
  return {
    // Loading state
    isLoading: true,
    loadError: null,

    // Pagination settings
    displayLimit: 50,
    displayedCount: 50,

    filters: { ...DEFAULT_FILTERS },
    rawRecords: [],
    records: [],
    itemGroups: [],
    filteredGroups: [],
    expandedGroups: {},
    vendorSectionExpanded: {},
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
      listLimit: 100,
      listDisplayed: 100,
    },
    detailChartInstance: null,

    regionNames: [],
    regionDropdownOpen: false,

    async init() {
      this.isLoading = true;
      this.loadError = null;

      // UIレンダリングを確実に完了させるため、フレーム待機 + 短い遅延
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => setTimeout(resolve, 16));

      try {
        // DataLoaderからデータを読み込み（fetch + IndexedDB）
        if (typeof DataLoader === "undefined") {
          throw new Error("DataLoader is not available");
        }

        const records = await DataLoader.loadData();
        if (!records || records.length === 0) {
          throw new Error("No data available");
        }

        this.rawRecords = records;

        // データ処理
        this.processData();
        this.groupByItem();
        this.clearFilters();

        // Single-pass extraction of unique names
        const projectSet = {};
        const regionSet = {};
        for (const r of this.rawRecords) {
          projectSet[r.projectName] = true;
          regionSet[r.region] = true;
        }
        this.projectNames = Object.keys(projectSet).sort();
        this.regionNames = Object.keys(regionSet).sort();
      } catch (error) {
        console.error("App initialization failed:", error);
        this.loadError = error.message;
      } finally {
        this.isLoading = false;
      }
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
      // Pre-compute derived fields including cleaned vendor name
      const vendorNameRegex = /株式会社|有限会社/g;

      this.records = this.rawRecords.map((r) => ({
        ...r,
        orderDateFormatted: formatDateHyphen(r.orderDate),
        orderMonth: r.orderDate
          ? r.orderDate.slice(0, 4) + "-" + r.orderDate.slice(4, 6)
          : "",
        orderWeek: r.orderDate ? getWeekNumber(r.orderDate) : "",
        orderWeekStart: r.orderDate ? getWeekStartDate(r.orderDate) : "",
        amount: r.qty * r.price,
        // Pre-compute cleaned vendor name to avoid regex in hot path
        vendorNameClean: r.vendor.replace(vendorNameRegex, "").trim(),
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

        // Inline stats computation: avoid intermediate array allocation
        let min = Infinity;
        let max = -Infinity;
        let sum = 0;
        const len = g.records.length;

        for (const r of g.records) {
          const price = r.price;
          if (price < min) min = price;
          if (price > max) max = price;
          sum += price;
        }

        return {
          ...g,
          recordCount: len,
          minPrice: len > 0 ? min : 0,
          maxPrice: len > 0 ? max : 0,
          avgPrice: len > 0 ? Math.round(sum / len) : 0,
        };
      });
    },

    applyFilters() {
      const f = this.filters;
      const itemKw = f.item.toLowerCase();

      // Build filter criteria object for recordMatchesFilters
      const criteria = {
        projectKw: f.project.toLowerCase(),
        regions: f.regions,
        majorCodes: f.majorCodes,
        vendor: f.vendor.toLowerCase(),
        dateFrom: f.dateFrom.replace(/-/g, ""),
        dateTo: f.dateTo.replace(/-/g, ""),
        ranges: {
          floorMin: f.floorMin,
          floorMax: f.floorMax,
          unitRowMin: f.unitRowMin,
          unitRowMax: f.unitRowMax,
          resUnitMin: f.resUnitMin,
          resUnitMax: f.resUnitMax,
          constAreaMin: f.constAreaMin,
          constAreaMax: f.constAreaMax,
          totalAreaMin: f.totalAreaMin,
          totalAreaMax: f.totalAreaMax,
        },
      };

      this.filteredGroups = this.itemGroups
        .map((g) => {
          // Inline stats computation: avoid intermediate array allocation
          let min = Infinity;
          let max = -Infinity;
          const matchingRecords = [];

          for (const r of g.records) {
            if (recordMatchesFilters(r, criteria)) {
              matchingRecords.push(r);
              if (r.price < min) min = r.price;
              if (r.price > max) max = r.price;
            }
          }

          return {
            ...g,
            filteredRecords: matchingRecords,
            minPrice: matchingRecords.length > 0 ? min : 0,
            maxPrice: matchingRecords.length > 0 ? max : 0,
            vendorSummary: null, // Lazy computed
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
        })
        // Sort by record count (descending)
        .sort((a, b) => b.filteredRecords.length - a.filteredRecords.length);

      // Reset pagination when filters change
      this.displayedCount = this.displayLimit;
    },

    clearFilters() {
      this.filters = { ...DEFAULT_FILTERS };
      this.filteredGroups = this.itemGroups
        .map((g) => ({
          ...g,
          filteredRecords: g.records,
        }))
        // Sort by record count (descending)
        .sort((a, b) => b.filteredRecords.length - a.filteredRecords.length);
      this.displayedCount = this.displayLimit;
    },

    // Pagination: displayed subset of filtered groups
    get displayedGroups() {
      return this.filteredGroups.slice(0, this.displayedCount);
    },

    get hasMoreGroups() {
      return this.displayedCount < this.filteredGroups.length;
    },

    get remainingGroupsCount() {
      return this.filteredGroups.length - this.displayedCount;
    },

    loadMoreGroups() {
      this.displayedCount += this.displayLimit;
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

    computeVendorSummary(records) {
      const vendorData = {};

      // Single-pass aggregation with inline stats computation
      for (const record of records) {
        const vendorName = record.vendor;
        let entry = vendorData[vendorName];

        if (!entry) {
          entry = {
            name: record.vendorNameClean, // Use pre-computed clean name
            count: 0,
            min: Infinity,
            max: -Infinity,
            sum: 0,
          };
          vendorData[vendorName] = entry;
        }

        const price = record.price;
        entry.count++;
        if (price < entry.min) entry.min = price;
        if (price > entry.max) entry.max = price;
        entry.sum += price;
      }

      // Convert to array with computed average
      return Object.values(vendorData).map((entry) => ({
        name: entry.name,
        count: entry.count,
        min: entry.min,
        avg: Math.round(entry.sum / entry.count),
        max: entry.max,
      }));
    },

    // Cached vendor summary getter
    getVendorSummary(group) {
      if (!group.vendorSummary) {
        group.vendorSummary = this.computeVendorSummary(group.filteredRecords);
      }
      return group.vendorSummary;
    },

    // Get vendor count without computing full summary
    getVendorCount(group) {
      if (group.vendorSummary) {
        return group.vendorSummary.length;
      }
      // Quick count using object (faster than Set + map)
      const seen = {};
      let count = 0;
      const records = group.filteredRecords;
      for (let i = 0, len = records.length; i < len; i++) {
        const v = records[i].vendor;
        if (!seen[v]) {
          seen[v] = true;
          count++;
        }
      }
      return count;
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
     * Prepare chart data by grouping records by week (optimized single-pass)
     * @param {Array} records - Filtered records to chart
     * @returns {{weekLabels: string[], actualData: number[], stats: {min: number, max: number, avg: number}}}
     */
    prepareChartData(records) {
      const weekData = {};
      let globalMin = Infinity;
      let globalMax = -Infinity;
      let globalSum = 0;

      // Single pass: group by week and compute global stats
      for (const record of records) {
        const week = record.orderWeek;
        const price = record.price;

        if (!weekData[week]) {
          weekData[week] = { prices: [], weekStart: record.orderWeekStart };
        }
        weekData[week].prices.push(price);

        if (price < globalMin) globalMin = price;
        if (price > globalMax) globalMax = price;
        globalSum += price;
      }

      const allWeeks = Object.keys(weekData).sort();
      const weekCount = allWeeks.length;
      const weekLabels = new Array(weekCount);
      const actualData = new Array(weekCount);
      const weeklyMinData = new Array(weekCount);
      const weeklyMaxData = new Array(weekCount);
      const weeklyMedianData = new Array(weekCount);

      // Single pass: compute all weekly stats
      for (let i = 0; i < weekCount; i++) {
        const entry = weekData[allWeeks[i]];
        const prices = entry.prices;
        const len = prices.length;

        weekLabels[i] = entry.weekStart;

        // Compute min/max/avg in one pass
        let min = Infinity;
        let max = -Infinity;
        let sum = 0;
        for (let j = 0; j < len; j++) {
          const p = prices[j];
          if (p < min) min = p;
          if (p > max) max = p;
          sum += p;
        }

        weeklyMinData[i] = min;
        weeklyMaxData[i] = max;
        actualData[i] = sum / len;

        // Median calculation (requires sort)
        prices.sort((a, b) => a - b);
        const mid = len >> 1;
        weeklyMedianData[i] =
          len & 1 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
      }

      return {
        weekLabels,
        actualData,
        weeklyMinData,
        weeklyMaxData,
        weeklyMedianData,
        stats: {
          min: globalMin === Infinity ? 0 : globalMin,
          max: globalMax === -Infinity ? 0 : globalMax,
          avg: records.length > 0 ? Math.round(globalSum / records.length) : 0,
        },
        weekCount,
      };
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

    /**
     * Build datasets for trend line chart
     * @param {Object} data - Chart data with weekLabels, actualData, stats, weekCount
     * @returns {Array} Chart.js datasets
     */
    buildTrendDatasets(data) {
      const {
        actualData,
        weeklyMinData,
        weeklyMaxData,
        weeklyMedianData,
        stats,
        weekCount,
      } = data;
      return [
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
          borderWidth: 1,
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
    },

    /**
     * Create line chart options
     * @param {Object} options - Additional options { unit, showXTitle }
     * @returns {Object} Chart.js options config
     */
    createLineChartOptions(options = {}) {
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

      const data = this.prepareChartData(this.chartData.records);
      const datasets = this.buildTrendDatasets(data);

      this.$refs.chartWrapper.style.width = "100%";

      this.chartInstance = new Chart(ctx, {
        type: "line",
        data: { labels: data.weekLabels, datasets },
        options: this.createLineChartOptions(),
      });
    },

    showChart(idx) {
      const group = this.filteredGroups[idx];
      const records = group.filteredRecords;

      // Single-pass stats computation
      let min = Infinity;
      let max = -Infinity;
      let sum = 0;
      const len = records.length;
      for (let i = 0; i < len; i++) {
        const p = records[i].price;
        if (p < min) min = p;
        if (p > max) max = p;
        sum += p;
      }

      this.chartData = {
        title: `単価推移 - ${group.item}`,
        item: group.item,
        unit: group.unit,
        records: records,
        displayMode: "chart",
        minPrice: len > 0 ? min : 0,
        maxPrice: len > 0 ? max : 0,
        avgPrice: len > 0 ? Math.round(sum / len) : 0,
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
        listLimit: 100,
        listDisplayed: 100,
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
      const allRecords = this.detailModal.currentGroup?.filteredRecords || [];
      // Apply pagination limit
      const records = allRecords.slice(0, this.detailModal.listDisplayed);
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

    get detailTotalRecords() {
      return this.detailModal.currentGroup?.filteredRecords?.length || 0;
    },

    get hasMoreDetailRecords() {
      return this.detailModal.listDisplayed < this.detailTotalRecords;
    },

    get remainingDetailRecords() {
      return this.detailTotalRecords - this.detailModal.listDisplayed;
    },

    loadMoreDetailRecords() {
      this.detailModal.listDisplayed += this.detailModal.listLimit;
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

      // Calculate stats once per group instead of 3 times
      const statsArray = labels.map((k) =>
        calcPriceStats(grouped[k].map((r) => r.price))
      );

      return {
        labels,
        avgPrices: statsArray.map((s) => s.avg),
        minPrices: statsArray.map((s) => s.min),
        maxPrices: statsArray.map((s) => s.max),
      };
    },

    /**
     * Render detail chart based on current chart type
     */
    renderDetailChart(retryCount = 0) {
      // Wait for x-show transition to complete before accessing canvas
      const maxRetries = 5;
      const delay = 100;

      setTimeout(() => {
        const ctx = this.$refs.detailChart?.getContext("2d");
        if (!ctx) {
          if (retryCount < maxRetries) {
            console.log(
              `Detail chart canvas not ready, retrying (${
                retryCount + 1
              }/${maxRetries})...`
            );
            this.renderDetailChart(retryCount + 1);
          } else {
            console.warn("Detail chart canvas not available after retries");
          }
          return;
        }

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
      }, delay);
    },

    /**
     * Render trend line chart
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} data - Chart data from prepareChartData
     */
    renderTrendChart(ctx, data) {
      const unit = this.detailModal.currentGroup?.unit || "";
      const datasets = this.buildTrendDatasets(data);

      this.detailChartInstance = new Chart(ctx, {
        type: "line",
        data: { labels: data.weekLabels, datasets },
        options: this.createLineChartOptions({ unit, showXTitle: true }),
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
