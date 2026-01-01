/**
 * =============================================================================
 * app.js - アプリケーションロジックモジュール
 * =============================================================================
 *
 * 概要:
 *   Alpine.jsで使用するアプリケーションのメインロジックを定義します。
 *   フィルタリング、データ集計、チャート表示などのビジネスロジックを含みます。
 *   Web Worker (Comlink) を使用してフィルタ処理をオフロードし、UIブロックを防止します。
 *
 * 分類: アプリケーション層 (Application Layer)
 *
 * 依存関係:
 *   - utils.js        : ユーティリティ関数（formatNumber, formatDateHyphen, getWeekNumber, calcPriceStats, isInRange等）
 *   - chart-helpers.js: チャート描画ヘルパー関数（buildTrendDatasets, createLineChartOptions, createValueRanges等）
 *   - data-loader.js  : データ読み込み管理モジュール（gzip展開、メモリキャッシュ）
 *   - Alpine.js       : リアクティブUIフレームワーク
 *   - Chart.js        : グラフ描画ライブラリ
 *   - Bootstrap       : UIコンポーネント（モーダル等）
 *   - Comlink         : Web Worker通信ライブラリ (CDN)
 *
 * =============================================================================
 */

// =============================================================================
// Web Worker Setup (Comlink)
// =============================================================================

/**
 * Filter Worker instance (lazy initialized)
 */
let filterWorkerProxy = null;
let filterWorkerInstance = null;

/**
 * Initialize the filter worker
 * @returns {Promise<Object>} Worker proxy
 */
async function getFilterWorker() {
  if (filterWorkerProxy) {
    return filterWorkerProxy;
  }

  // Check if Comlink is available
  if (typeof Comlink === "undefined") {
    console.warn("Comlink not available, using main thread filtering");
    return null;
  }

  try {
    filterWorkerInstance = new Worker("js/filter-worker.js");
    filterWorkerProxy = Comlink.wrap(filterWorkerInstance);

    // Verify worker is working
    const pingResult = await filterWorkerProxy.ping();
    console.log("FilterWorker initialized:", pingResult);

    return filterWorkerProxy;
  } catch (error) {
    console.warn("Failed to initialize filter worker:", error);
    return null;
  }
}

/**
 * Pagination and list display configuration
 */
const PAGINATION_CONFIG = {
  DEFAULT_DISPLAY_LIMIT: 50,
  DEFAULT_LIST_LIMIT: 100,
};

/**
 * Chart rendering and visualization configuration
 */
const CHART_CONFIG = {
  HEATMAP_BUCKET_COUNT: 5,
  MAX_RENDER_RETRIES: 5,
  RENDER_RETRY_DELAY: 100,
  BUBBLE_SIZE_QTY_FACTOR: 5, // 対数スケール用係数（log10(qty + 1) * factor）
  BUBBLE_SIZE_AMOUNT_DIVISOR: 10000,
  BUBBLE_SIZE_AMOUNT_FACTOR: 2,
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
    displayLimit: PAGINATION_CONFIG.DEFAULT_DISPLAY_LIMIT,
    displayedCount: PAGINATION_CONFIG.DEFAULT_DISPLAY_LIMIT,

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

    // Detail Analysis Modal State (Tabbed BI Dashboard)
    detailModal: {
      isOpen: false,
      currentGroup: null,
      activeTab: "timeseries", // 'timeseries' | 'comparison' | 'trend'

      // 共通フィルター
      commonFilters: {
        dateFrom: "",
        dateTo: "",
        regions: [],
        vendors: [],
      },
      filteredByCommon: [],

      // タブ1: 時系列分析
      timeseries: {
        metric: "price", // 'price' | 'movingAvg'
        timeUnit: "weekly", // 'yearly' | 'monthly' | 'weekly' | 'daily'
        chartType: "line", // 'line' | 'area' | 'bar' | 'table'
        movingAvgWindow: 4,
      },

      // タブ2: 比較分析
      comparison: {
        groupBy: "region", // 'region' | 'vendor' | 'majorCode' | 'building'
        metric: "avg", // 'avg' | 'median'
        chartType: "bar", // 'bar' | 'boxplot' | 'radar' | 'table'
      },

      // タブ3: 傾向分析
      trend: {
        xAxis: "resUnits", // 'resUnits' | 'floors' | 'totalArea' | 'constArea'
        chartType: "scatter", // 'scatter' | 'bubble' | 'heatmap' | 'table'
        bubbleSize: "qty",
      },

      // KPIサマリー
      kpiSummary: {
        count: 0,
        minPrice: 0,
        avgPrice: 0,
        maxPrice: 0,
        medianPrice: 0,
      },

      // ページネーション
      listLimit: PAGINATION_CONFIG.DEFAULT_LIST_LIMIT,
      listDisplayed: PAGINATION_CONFIG.DEFAULT_LIST_LIMIT,
    },
    detailChartInstance: null,

    regionNames: [],
    regionDropdownOpen: false,

    // 多角分析モーダル用ドロップダウン状態
    detailRegionDropdownOpen: false,
    detailVendorDropdownOpen: false,

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

    // ===== 多角分析モーダル用ドロップダウン関数 =====
    // Note: The following dropdown handlers follow the same pattern as main filter dropdowns above.
    // This duplication is intentional to maintain Alpine.js reactivity and component isolation.

    toggleDetailRegionDropdown() {
      this.detailRegionDropdownOpen = !this.detailRegionDropdownOpen;
    },

    toggleDetailRegion(region) {
      const idx = this.detailModal.commonFilters.regions.indexOf(region);
      if (idx === -1) {
        this.detailModal.commonFilters.regions.push(region);
      } else {
        this.detailModal.commonFilters.regions.splice(idx, 1);
      }
    },

    confirmDetailRegionSelection() {
      this.detailRegionDropdownOpen = false;
      this.applyDetailCommonFilters();
    },

    isDetailRegionSelected(region) {
      return this.detailModal.commonFilters.regions.includes(region);
    },

    get selectedDetailRegionsText() {
      if (this.detailModal.commonFilters.regions.length === 0) return "すべて";
      if (this.detailModal.commonFilters.regions.length <= 2)
        return this.detailModal.commonFilters.regions.join(", ");
      return `${this.detailModal.commonFilters.regions.length}件選択中`;
    },

    toggleDetailVendorDropdown() {
      this.detailVendorDropdownOpen = !this.detailVendorDropdownOpen;
    },

    toggleDetailVendor(vendor) {
      const idx = this.detailModal.commonFilters.vendors.indexOf(vendor);
      if (idx === -1) {
        this.detailModal.commonFilters.vendors.push(vendor);
      } else {
        this.detailModal.commonFilters.vendors.splice(idx, 1);
      }
    },

    confirmDetailVendorSelection() {
      this.detailVendorDropdownOpen = false;
      this.applyDetailCommonFilters();
    },

    isDetailVendorSelected(vendor) {
      return this.detailModal.commonFilters.vendors.includes(vendor);
    },

    get selectedDetailVendorsText() {
      if (this.detailModal.commonFilters.vendors.length === 0) return "すべて";
      if (this.detailModal.commonFilters.vendors.length <= 2)
        return this.detailModal.commonFilters.vendors.join(", ");
      return `${this.detailModal.commonFilters.vendors.length}件選択中`;
    },
    // ===== 多角分析モーダル用ドロップダウン関数終了 =====

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

        // Calculate statistics using shared utility
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

    /**
     * Apply filters using Web Worker (or fallback to main thread)
     */
    async applyFilters() {
      const startTime = performance.now();

      // Try to use Web Worker
      const worker = await getFilterWorker();

      if (worker) {
        // Use Web Worker for filtering (non-blocking)
        try {
          this.filteredGroups = await worker.applyFilters(
            this.itemGroups,
            this.filters
          );
          console.log(
            `Worker filter: ${(performance.now() - startTime).toFixed(0)}ms`
          );
        } catch (error) {
          console.warn("Worker filter failed, falling back:", error);
          this._applyFiltersSync();
        }
      } else {
        // Fallback to synchronous filtering
        this._applyFiltersSync();
      }

      // Reset pagination when filters change
      this.displayedCount = this.displayLimit;
    },

    /**
     * Synchronous filter implementation (fallback)
     */
    _applyFiltersSync() {
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
          // Filter matching records
          const matchingRecords = g.records.filter((r) =>
            recordMatchesFilters(r, criteria)
          );

          // Calculate statistics using shared utility
          const prices = matchingRecords.map((r) => r.price);
          const stats = calcPriceStats(prices);

          return {
            ...g,
            filteredRecords: matchingRecords,
            minPrice: stats.min,
            maxPrice: stats.max,
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
    },

    async clearFilters() {
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
      const datasets = buildTrendDatasets(data);

      this.$refs.chartWrapper.style.width = "100%";

      this.chartInstance = new Chart(ctx, {
        type: "line",
        data: { labels: data.weekLabels, datasets },
        options: createLineChartOptions(),
      });
    },

    showChart(idx) {
      const group = this.filteredGroups[idx];
      const records = group.filteredRecords;

      // Calculate statistics using shared utility
      const prices = records.map((r) => r.price);
      const stats = calcPriceStats(prices);

      // Prepare weekly grouped data for table display
      const weeklyData = prepareWeeklyTableData(records);

      this.chartData = {
        title: `単価推移 - ${group.item}`,
        item: group.item,
        unit: group.unit,
        records: records,
        weeklyData: weeklyData,
        displayMode: "chart",
        minPrice: stats.min,
        maxPrice: stats.max,
        avgPrice: stats.avg,
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
      // Calculate date range from actual data
      const orderDates = group.filteredRecords
        .map((r) => r.orderDate)
        .filter((d) => d && d.length === 8)
        .sort();
      const minDate = orderDates.length > 0 ? formatDateHyphen(orderDates[0]) : "";
      const maxDate = orderDates.length > 0 ? formatDateHyphen(orderDates[orderDates.length - 1]) : "";

      this.detailModal = {
        isOpen: true,
        currentGroup: { ...group },
        activeTab: "timeseries",
        // 初期値を保存（クリア時に使用）
        initialDateFrom: minDate,
        initialDateTo: maxDate,
        commonFilters: {
          dateFrom: minDate,
          dateTo: maxDate,
          regions: [],
          vendors: [],
        },
        filteredByCommon: [...group.filteredRecords],
        timeseries: {
          metric: "price",
          timeUnit: "weekly",
          chartType: "line",
          movingAvgWindow: 4,
        },
        comparison: {
          groupBy: "region",
          metric: "avg",
          chartType: "bar",
        },
        trend: {
          xAxis: "resUnits",
          chartType: "scatter",
          bubbleSize: "qty",
        },
        kpiSummary: {
          count: 0,
          minPrice: 0,
          avgPrice: 0,
          maxPrice: 0,
          medianPrice: 0,
        },
        listLimit: 100,
        listDisplayed: 100,
      };
      this.updateKpiSummary();
      this.$nextTick(() => {
        new bootstrap.Modal(this.$refs.detailModal).show();
        // Render chart after modal is shown
        this.$nextTick(() => {
          this.renderDetailChart();
        });
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
      // Reset filters
      this.detailModal.commonFilters = {
        dateFrom: "",
        dateTo: "",
        regions: [],
        vendors: [],
      };
    },

    /**
     * Switch detail modal tab
     * @param {string} tab - 'timeseries' | 'comparison' | 'trend'
     */
    setDetailTab(tab) {
      this.detailModal.activeTab = tab;
      // Render chart if not in table mode
      if (!this.isDetailTableMode()) {
        this.$nextTick(() => this.renderDetailChart());
      }
    },

    /**
     * Check if current tab is in table mode
     * @returns {boolean}
     */
    isDetailTableMode() {
      const tab = this.detailModal.activeTab;
      if (tab === "timeseries") return this.detailModal.timeseries.chartType === "table";
      if (tab === "comparison") return this.detailModal.comparison.chartType === "table";
      if (tab === "trend") return this.detailModal.trend.chartType === "table";
      return false;
    },

    /**
     * Apply common filters and update KPI summary
     */
    applyDetailCommonFilters() {
      const records = this.detailModal.currentGroup?.filteredRecords || [];
      const { dateFrom, dateTo, regions, vendors } = this.detailModal.commonFilters;

      const dateFromYMD = dateFrom ? dateFrom.replace(/-/g, "") : "";
      const dateToYMD = dateTo ? dateTo.replace(/-/g, "") : "";

      this.detailModal.filteredByCommon = records.filter((r) => {
        if (dateFromYMD && r.orderDate < dateFromYMD) return false;
        if (dateToYMD && r.orderDate > dateToYMD) return false;
        if (regions.length && !regions.includes(r.region)) return false;
        if (vendors.length && !vendors.includes(r.vendor)) return false;
        return true;
      });

      this.updateKpiSummary();
      if (!this.isDetailTableMode()) {
        this.renderDetailChart();
      }
    },

    /**
     * Clear common filters (reset to initial values)
     */
    clearDetailCommonFilters() {
      this.detailModal.commonFilters = {
        dateFrom: this.detailModal.initialDateFrom || "",
        dateTo: this.detailModal.initialDateTo || "",
        regions: [],
        vendors: [],
      };
      this.applyDetailCommonFilters();
    },

    /**
     * Update KPI summary based on filtered records
     */
    updateKpiSummary() {
      const records = this.detailModal.filteredByCommon || [];
      const prices = records.map((r) => r.price);
      const stats = calcPriceStats(prices);

      this.detailModal.kpiSummary = {
        count: records.length,
        minPrice: stats.min,
        avgPrice: stats.avg,
        maxPrice: stats.max,
        medianPrice: calcMedian(prices),
      };
    },

    /**
     * Get available regions for filter dropdown
     */
    get detailModalRegionOptions() {
      const records = this.detailModal.currentGroup?.filteredRecords || [];
      return [...new Set(records.map((r) => r.region))].sort();
    },

    /**
     * Get available vendors for filter dropdown
     */
    get detailModalVendorOptions() {
      const records = this.detailModal.currentGroup?.filteredRecords || [];
      return [...new Set(records.map((r) => r.vendor))].sort();
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
        timeline: (r) => r.orderWeekStart,
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
     * Get table data for current tab
     * @returns {Array} Grouped table data with statistics
     */
    getDetailTableData() {
      const records = this.detailModal.filteredByCommon || [];
      const tab = this.detailModal.activeTab;

      if (tab === "timeseries") {
        const timeUnit = this.detailModal.timeseries.timeUnit;
        return this.prepareTimeseriesTableData(records, timeUnit);
      } else if (tab === "comparison") {
        const groupBy = this.detailModal.comparison.groupBy;
        return this.prepareComparisonTableData(records, groupBy);
      } else if (tab === "trend") {
        const xAxis = this.detailModal.trend.xAxis;
        return this.prepareTrendTableData(records, xAxis);
      }
      return [];
    },

    /**
     * Prepare timeseries table data grouped by time unit
     * @param {Array} records - Records to group
     * @param {string} timeUnit - 'yearly' | 'monthly' | 'weekly' | 'daily'
     * @returns {Array} Grouped data with statistics
     */
    prepareTimeseriesTableData(records, timeUnit) {
      const grouped = groupByTimeUnit(records, timeUnit);
      const sortedKeys = Object.keys(grouped).sort();

      return sortedKeys.map((key) => {
        const groupRecords = grouped[key];
        const prices = groupRecords.map((r) => r.price);
        const stats = calcPriceStats(prices);

        return {
          label: key,
          count: groupRecords.length,
          minPrice: stats.min,
          avgPrice: stats.avg,
          maxPrice: stats.max,
          records: groupRecords,
        };
      });
    },

    /**
     * Prepare comparison table data grouped by comparison axis
     * @param {Array} records - Records to group
     * @param {string} groupBy - 'region' | 'vendor' | 'majorCode' | 'building'
     * @returns {Array} Grouped data with statistics
     */
    prepareComparisonTableData(records, groupBy) {
      const keyFn = {
        region: (r) => r.region,
        vendor: (r) => r.vendor,
        majorCode: (r) => r.majorCode,
        building: (r) => buildingInfoKey(r),
      }[groupBy];

      const grouped = groupRecordsBy(records, keyFn);

      return Object.entries(grouped)
        .map(([key, groupRecords]) => {
          const prices = groupRecords.map((r) => r.price);
          const stats = calcPriceStats(prices);

          return {
            label: key,
            count: groupRecords.length,
            minPrice: stats.min,
            avgPrice: stats.avg,
            maxPrice: stats.max,
            medianPrice: calcMedian(prices),
            records: groupRecords,
          };
        })
        .sort((a, b) => b.count - a.count);
    },

    /**
     * Prepare trend table data grouped by X-axis value
     * @param {Array} records - Records to group
     * @param {string} xAxis - 'resUnits' | 'floors' | 'totalArea' | 'constArea'
     * @returns {Array} Grouped data with statistics
     */
    prepareTrendTableData(records, xAxis) {
      // Group by x-axis value
      const grouped = groupRecordsBy(records, (r) => {
        const value = r[xAxis];
        if (xAxis === "totalArea" || xAxis === "constArea") {
          // Group area values into buckets of 100
          return `${Math.floor(value / 100) * 100}~${Math.floor(value / 100) * 100 + 99}㎡`;
        }
        return `${value}${xAxis === "floors" ? "階" : "戸"}`;
      });

      return Object.entries(grouped)
        .map(([key, groupRecords]) => {
          const prices = groupRecords.map((r) => r.price);
          const stats = calcPriceStats(prices);

          return {
            label: key,
            count: groupRecords.length,
            minPrice: stats.min,
            avgPrice: stats.avg,
            maxPrice: stats.max,
            records: groupRecords,
          };
        })
        .sort((a, b) => {
          // Sort by the numeric part of the label
          const numA = parseInt(a.label.replace(/[^0-9]/g, "")) || 0;
          const numB = parseInt(b.label.replace(/[^0-9]/g, "")) || 0;
          return numA - numB;
        });
    },

    /**
     * Prepare chart data based on current tab and chart type
     * @returns {Object} Chart data
     */
    prepareDetailChartData() {
      const records = this.detailModal.filteredByCommon || [];
      const tab = this.detailModal.activeTab;

      if (tab === "timeseries") {
        return this.prepareTimeseriesChartData(records);
      } else if (tab === "comparison") {
        return this.prepareComparisonChartData(records);
      } else if (tab === "trend") {
        return this.prepareTrendChartData(records);
      }
      return null;
    },

    /**
     * Prepare timeseries chart data
     * @param {Array} records - Records to process
     * @returns {Object} Chart data for timeseries
     */
    prepareTimeseriesChartData(records) {
      const timeUnit = this.detailModal.timeseries.timeUnit;
      const grouped = groupByTimeUnit(records, timeUnit);
      const sortedKeys = Object.keys(grouped).sort();

      const labels = sortedKeys;
      // Per-period statistics
      const minData = [];
      const avgData = [];
      const medianData = [];
      const maxData = [];

      sortedKeys.forEach((key) => {
        const prices = grouped[key].map((r) => r.price);
        const stats = calcPriceStats(prices);
        minData.push(stats.min);
        avgData.push(stats.avg);
        medianData.push(calcMedian(prices));
        maxData.push(stats.max);
      });

      return { labels, minData, avgData, medianData, maxData, count: sortedKeys.length };
    },

    /**
     * Prepare comparison chart data
     * @param {Array} records - Records to process
     * @returns {Object} Chart data for comparison
     */
    prepareComparisonChartData(records) {
      const groupBy = this.detailModal.comparison.groupBy;
      const metric = this.detailModal.comparison.metric;

      const keyFn = {
        region: (r) => r.region,
        vendor: (r) => r.vendor,
        majorCode: (r) => r.majorCode,
        building: (r) => buildingInfoKey(r),
      }[groupBy];

      const grouped = groupRecordsBy(records, keyFn);
      const labels = Object.keys(grouped).sort((a, b) => {
        return grouped[b].length - grouped[a].length;
      });

      const data = labels.map((key) => {
        const prices = grouped[key].map((r) => r.price);
        const stats = calcPriceStats(prices);

        if (metric === "avg") return stats.avg;
        if (metric === "median") return calcMedian(prices);
        return stats.avg;
      });

      // For boxplot, we need the raw prices per group
      const boxplotData = labels.map((key) => grouped[key].map((r) => r.price));

      return { labels, data, boxplotData };
    },

    /**
     * Prepare trend chart data (scatter/bubble/heatmap)
     * @param {Array} records - Records to process
     * @returns {Object} Chart data for trend analysis
     */
    prepareTrendChartData(records) {
      const xAxis = this.detailModal.trend.xAxis;
      const bubbleSize = this.detailModal.trend.bubbleSize;

      const scatterData = records.map((r) => ({
        x: r[xAxis],
        y: r.price,
        r: bubbleSize === "qty"
          ? Math.log10(Math.abs(r.qty) + 1) * CHART_CONFIG.BUBBLE_SIZE_QTY_FACTOR
          : Math.sqrt(Math.abs(r.amount) / CHART_CONFIG.BUBBLE_SIZE_AMOUNT_DIVISOR) * CHART_CONFIG.BUBBLE_SIZE_AMOUNT_FACTOR,
        record: r,
      }));

      // For heatmap, create a matrix with ranges
      const xAxisValues = records.map((r) => r[xAxis]);
      const priceValues = records.map((r) => r.price);

      const xRanges = createValueRanges(xAxisValues, CHART_CONFIG.HEATMAP_BUCKET_COUNT, xAxis);
      const priceRanges = createValueRanges(priceValues, CHART_CONFIG.HEATMAP_BUCKET_COUNT, 'price');

      const heatmapData = [];
      xRanges.forEach((xRange) => {
        priceRanges.forEach((yRange) => {
          const isLastXRange = xRange === xRanges[xRanges.length - 1];
          const isLastYRange = yRange === priceRanges[priceRanges.length - 1];

          const count = records.filter((r) => {
            const xMatch = r[xAxis] >= xRange.min && (isLastXRange ? r[xAxis] <= xRange.max : r[xAxis] < xRange.max);
            const yMatch = r.price >= yRange.min && (isLastYRange ? r.price <= yRange.max : r.price < yRange.max);
            return xMatch && yMatch;
          }).length;

          if (count > 0) {
            heatmapData.push({ x: xRange.label, y: yRange.label, v: count });
          }
        });
      });

      return {
        scatterData,
        heatmapData,
        xRanges,
        priceRanges,
        xAxisLabel: getAxisLabel(xAxis),
      };
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
     * Render detail chart based on current tab and chart type
     *
     * Note: This method implements a retry mechanism because Alpine.js x-show transitions
     * may delay canvas availability. The canvas element might not be immediately accessible
     * after tab switching, so we retry with exponential backoff.
     *
     * @param {number} retryCount - Current retry attempt (default: 0)
     */
    renderDetailChart(retryCount = 0) {
      // Skip if in table mode
      if (this.isDetailTableMode()) return;

      // Wait for x-show transition to complete before accessing canvas
      const maxRetries = CHART_CONFIG.MAX_RENDER_RETRIES;
      const delay = CHART_CONFIG.RENDER_RETRY_DELAY;

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

        const tab = this.detailModal.activeTab;
        const data = this.prepareDetailChartData();
        if (!data) return;

        if (tab === "timeseries") {
          this.renderTimeseriesChart(ctx, data);
        } else if (tab === "comparison") {
          this.renderComparisonTabChart(ctx, data);
        } else if (tab === "trend") {
          this.renderTrendTabChart(ctx, data);
        }
      }, delay);
    },

    /**
     * Render timeseries chart (line/area/bar)
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} data - Chart data from prepareTimeseriesChartData
     */
    renderTimeseriesChart(ctx, data) {
      const chartType = this.detailModal.timeseries.chartType;
      const unit = this.detailModal.currentGroup?.unit || "";
      const { labels, minData, avgData, medianData, maxData } = data;

      const datasets = [];

      // Min data line (per period)
      datasets.push({
        label: "最小値",
        data: minData,
        borderColor: CHART_COLORS.min.border,
        backgroundColor: chartType === "bar" ? CHART_COLORS.min.border + "88" : CHART_COLORS.min.background,
        borderWidth: 1,
        borderDash: [4, 4],
        pointRadius: chartType === "bar" ? 0 : 3,
        fill: false,
        tension: 0.1,
        order: 3,
      });

      // Median data line (per period)
      datasets.push({
        label: "中央値",
        data: medianData,
        borderColor: "#f59e0b",
        backgroundColor: chartType === "bar" ? "#f59e0b88" : "#f59e0b22",
        borderWidth: 2,
        pointRadius: chartType === "bar" ? 0 : 4,
        fill: false,
        tension: 0.1,
        order: 2,
      });

      // Average data line (per period) - main line
      datasets.push({
        label: "平均値",
        data: avgData,
        borderColor: CHART_COLORS.actual.border,
        backgroundColor: chartType === "area"
          ? CHART_COLORS.actual.border + "44"
          : CHART_COLORS.actual.background,
        borderWidth: 2,
        pointRadius: chartType === "bar" ? 0 : 5,
        fill: chartType === "area",
        tension: 0.1,
        order: 1,
      });

      // Max data line (per period)
      datasets.push({
        label: "最大値",
        data: maxData,
        borderColor: CHART_COLORS.max.border,
        backgroundColor: chartType === "bar" ? CHART_COLORS.max.border + "88" : CHART_COLORS.max.background,
        borderWidth: 1,
        borderDash: [4, 4],
        pointRadius: chartType === "bar" ? 0 : 3,
        fill: false,
        tension: 0.1,
        order: 4,
      });

      this.detailChartInstance = new Chart(ctx, {
        type: chartType === "bar" ? "bar" : "line",
        data: { labels, datasets },
        options: createLineChartOptions({ unit, showXTitle: true }),
      });
    },

    /**
     * Render comparison tab chart (bar/boxplot/radar)
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} data - Chart data from prepareComparisonChartData
     */
    renderComparisonTabChart(ctx, data) {
      const chartType = this.detailModal.comparison.chartType;
      const metric = this.detailModal.comparison.metric;
      const unit = this.detailModal.currentGroup?.unit || "";
      const { labels, data: chartData, boxplotData } = data;

      if (chartType === "boxplot") {
        this.renderBoxplotChart(ctx, labels, boxplotData, unit);
      } else if (chartType === "radar") {
        this.renderRadarChart(ctx, labels, chartData, metric);
      } else {
        // Default bar chart
        const metricLabels = { avg: "平均", median: "中央値" };
        this.detailChartInstance = new Chart(ctx, {
          type: "bar",
          data: {
            labels,
            datasets: [{
              label: metricLabels[metric] || "平均",
              data: chartData,
              backgroundColor: CHART_COLORS.avg.border,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
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
      }
    },

    /**
     * Render boxplot chart
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Array} labels - Group labels
     * @param {Array} boxplotData - Array of price arrays per group
     * @param {string} unit - Unit label
     */
    renderBoxplotChart(ctx, labels, boxplotData, unit) {
      // Check if boxplot plugin is available
      if (typeof Chart.controllers.boxplot === "undefined") {
        console.warn("Boxplot plugin not loaded, falling back to bar chart");
        // Fallback to bar chart showing quartiles
        const statsData = boxplotData.map((prices) => calcBoxplotStats(prices));
        this.detailChartInstance = new Chart(ctx, {
          type: "bar",
          data: {
            labels,
            datasets: [
              { label: "Q1", data: statsData.map((s) => s.q1), backgroundColor: "#20c99755" },
              { label: "中央値", data: statsData.map((s) => s.median), backgroundColor: "#0d6efd" },
              { label: "Q3", data: statsData.map((s) => s.q3), backgroundColor: "#fd7e1455" },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: { 
              legend: { position: "top" },
              subtitle: {
                display: true,
                text: "※ データを4等分した位置（25%, 50%, 75%）を正確に計算",
                font: { size: 11 },
                color: "#6c757d",
                padding: { bottom: 10 }
              }
            },
            scales: {
              y: {
                title: { display: true, text: `実行単価 (円/${unit})` },
                ticks: { callback: (value) => "¥" + formatNumber(value) },
              },
            },
          },
        });
        return;
      }

      this.detailChartInstance = new Chart(ctx, {
        type: "boxplot",
        data: {
          labels,
          datasets: [{
            label: "単価分布",
            data: boxplotData,
            backgroundColor: CHART_COLORS.avg.border + "44",
            borderColor: CHART_COLORS.avg.border,
            borderWidth: 1,
            outlierBackgroundColor: CHART_COLORS.max.border,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { display: false },
            subtitle: {
              display: true,
              text: "※ 箱はデータの中央50%の範囲、ひげは通常範囲（箱の1.5倍まで）、灰色の点は各データ、赤い点は外れ値を表示",
              font: { size: 11 },
              color: "#6c757d",
              padding: { bottom: 10 }
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const stats = calcBoxplotStats(context.raw);
                  return [
                    `最小: ¥${formatNumber(stats.min)}`,
                    `Q1: ¥${formatNumber(stats.q1)}`,
                    `中央値: ¥${formatNumber(stats.median)}`,
                    `Q3: ¥${formatNumber(stats.q3)}`,
                    `最大: ¥${formatNumber(stats.max)}`,
                  ];
                },
              },
            },
          },
          scales: {
            y: {
              title: { display: true, text: `実行単価 (円/${unit})` },
              ticks: { callback: (value) => "¥" + formatNumber(value) },
            },
          },
        },
      });
    },

    /**
     * Render radar chart
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Array} labels - Group labels
     * @param {Array} data - Data values
     * @param {string} metric - Metric type
     * @param {string} unit - Unit label
     */
    renderRadarChart(ctx, labels, data, metric) {
      const metricLabels = { avg: "平均", median: "中央値" };
      this.detailChartInstance = new Chart(ctx, {
        type: "radar",
        data: {
          labels,
          datasets: [{
            label: metricLabels[metric] || "平均",
            data,
            backgroundColor: CHART_COLORS.avg.border + "44",
            borderColor: CHART_COLORS.avg.border,
            borderWidth: 2,
            pointBackgroundColor: CHART_COLORS.avg.border,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
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
            r: {
              beginAtZero: true,
              ticks: { callback: (value) => "¥" + formatNumber(value) },
            },
          },
        },
      });
    },

    /**
     * Render trend tab chart (scatter/bubble/heatmap)
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} data - Chart data from prepareTrendChartData
     */
    renderTrendTabChart(ctx, data) {
      const chartType = this.detailModal.trend.chartType;
      const unit = this.detailModal.currentGroup?.unit || "";
      const { scatterData, heatmapData, xRanges, priceRanges, xAxisLabel } = data;

      if (chartType === "heatmap") {
        this.renderHeatmapChart(ctx, heatmapData, xRanges, priceRanges, xAxisLabel, unit);
      } else {
        // Scatter or bubble chart
        // Calculate correlation coefficient
        const xValues = scatterData.map((d) => d.x);
        const yValues = scatterData.map((d) => d.y);
        const correlation = calcCorrelation(xValues, yValues);
        const correlationText = correlation !== null
          ? `相関係数: ${correlation.toFixed(3)}`
          : '';

        const bubbleText = chartType === "bubble"
          ? `円の大きさは${this.detailModal.trend.bubbleSize === "qty" ? "数量" : "合計金額（数量×単価）"}を表示。`
          : '';

        const subtitleText = correlationText
          ? `※ ${bubbleText}${correlationText} (右上ほど単価が高く${xAxisLabel}が多い傾向、外れ値や標準的な価格帯の分布を確認)`
          : `※ ${bubbleText}右上ほど単価が高く${xAxisLabel}が多い傾向、外れ値や標準的な価格帯の分布を確認`;

        this.detailChartInstance = new Chart(ctx, {
          type: chartType === "bubble" ? "bubble" : "scatter",
          data: {
            datasets: [{
              label: "単価",
              data: scatterData,
              backgroundColor: CHART_COLORS.avg.border + "88",
              borderColor: CHART_COLORS.avg.border,
              borderWidth: 1,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: {
              mode: 'point',
              intersect: true,
              axis: 'xy',
            },
            plugins: {
              legend: { display: false },
              subtitle: {
                display: true,
                text: subtitleText,
                font: { size: 11 },
                color: "#6c757d",
                padding: { bottom: 10 }
              },
              tooltip: {
                callbacks: {
                  label: (context) => {
                    const point = context.raw;
                    return [
                      `${xAxisLabel}: ${point.x}`,
                      `単価: ¥${formatNumber(point.y)}`,
                    ];
                  },
                },
              },
            },
            scales: {
              x: {
                title: { display: true, text: xAxisLabel },
              },
              y: {
                title: { display: true, text: `実行単価 (円/${unit})` },
                ticks: { callback: (value) => "¥" + formatNumber(value) },
              },
            },
          },
        });
      }
    },

    /**
     * Render heatmap chart
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Array} data - Heatmap data [{x, y, v}]
     * @param {Array} xRanges - X-axis ranges
     * @param {Array} priceRanges - Price range labels
     * @param {string} xAxisLabel - X-axis label
     * @param {string} unit - Unit label
     */
    renderHeatmapChart(ctx, data, xRanges, priceRanges, xAxisLabel, unit) {
      // Check if matrix plugin is available
      if (typeof Chart.controllers.matrix === "undefined") {
        console.warn("Matrix plugin not loaded, falling back to scatter chart");
        // Fallback to scatter chart
        this.detailChartInstance = new Chart(ctx, {
          type: "scatter",
          data: {
            datasets: [{
              label: "件数",
              data: data.map((d) => ({ x: d.x, y: d.y, r: d.v * 3 })),
              backgroundColor: CHART_COLORS.avg.border + "88",
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
              x: { title: { display: true, text: xAxisLabel } },
              y: {
                title: { display: true, text: "単価範囲" },
                ticks: {
                  callback: (value) => priceRanges[value]?.label || value,
                },
              },
            },
          },
        });
        return;
      }

      this.detailChartInstance = new Chart(ctx, {
        type: "matrix",
        data: {
          datasets: [{
            label: "件数",
            data: data,
            backgroundColor: (context) => {
              const value = context.dataset.data[context.dataIndex]?.v || 0;
              const alpha = Math.min(value / 10, 1);
              return `rgba(13, 110, 253, ${alpha})`;
            },
            borderWidth: 1,
            borderColor: "rgba(0, 0, 0, 0.1)",
            width: ({ chart }) => (chart.chartArea?.width || 100) / xRanges.length - 1,
            height: ({ chart }) => (chart.chartArea?.height || 100) / priceRanges.length - 1,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          layout: {
            padding: {
              bottom: 5
            }
          },
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              align: 'center',
              labels: {
                boxWidth: 30,
                boxHeight: 8,
                padding: 3,
                font: { size: 9 },
                usePointStyle: false
              }
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const d = context.raw;
                  return `${d.x} x ${d.y}: ${d.v}件`;
                },
              },
            },
          },
          scales: {
            x: {
              type: "category",
              labels: xRanges.map((r) => r.label),
              title: { display: true, text: xAxisLabel },
            },
            y: {
              type: "category",
              labels: priceRanges.map((r) => r.label),
              title: { display: true, text: `単価範囲 (円/${unit})` },
            },
          },
        },
      });
    },
  };
}
