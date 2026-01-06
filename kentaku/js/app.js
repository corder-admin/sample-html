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
 * Filter Worker instance (遅延初期化)
 * @type {Worker|null}
 */
let filterWorkerProxy = null;
let filterWorkerInstance = null;

/**
 * フィルターWorkerを初期化（遅延ロード、キャッシュあり）
 * Comlinkが未ロードの場合はnullを返しメインスレッドでフォールバック
 * @returns {Promise<Object|null>} Worker proxy、または初期化失敗時null
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
 * ページネーションとリスト表示の設定
 */
const PAGINATION_CONFIG = {
  DEFAULT_DISPLAY_LIMIT: 50,
  DEFAULT_LIST_LIMIT: 100,
};

/**
 * チャート描画と可視化の設定
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
 * デフォルトフィルター値 - 単一の信頼できる情報源
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
 * レコードがすべてのフィルター条件に一致するかをチェック
 * @param {Object} record - チェック対象のレコード
 * @param {Object} criteria - フィルター条件オブジェクト
 * @returns {boolean} すべての条件に一致する場合true
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

// =============================================================================
// Private Helper Functions (Chart Data Preparation)
// =============================================================================

/**
 * レコードを週次で集計し、グローバル統計を計算
 * @private
 * @param {Array} records - 集計対象のレコード配列
 * @returns {{weekData: Object, globalMin: number, globalMax: number, globalSum: number}}
 */
function groupRecordsByWeek(records) {
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

  return { weekData, globalMin, globalMax, globalSum };
}

/**
 * 週次集計データから統計配列を生成
 * @private
 * @param {Object} weekData - 週ごとのレコードデータ
 * @param {number} recordsLength - 全レコード数（平均計算用）
 * @returns {{weekLabels, actualData, weeklyMinData, weeklyMaxData, weeklyMedianData, stats, weekCount}}
 */
function calculateWeeklyStats(weekData, recordsLength) {
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
    weekCount,
  };
}

/**
 * Alpine.jsメインコンポーネント
 * データ管理、フィルタリング、チャート描画、モーダル制御を統合
 * Note: Alpine.jsのリアクティビティ要件により単一オブジェクトで構成
 * @returns {Object} Alpine.jsコンポーネントオブジェクト
 */
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

    /**
     * コンポーネント初期化 - データロード、前処理、初期フィルター適用
     */
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
        for (const record of this.rawRecords) {
          projectSet[record.projectName] = true;
          regionSet[record.region] = true;
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

    /**
     * メイン検索用：支店ドロップダウンの開閉を切り替え
     * Note: Alpine.jsリアクティビティとコンポーネント分離のため、
     *       多角分析モーダル用と意図的に独立して実装
     */
    toggleRegionDropdown() {
      this.regionDropdownOpen = !this.regionDropdownOpen;
    },

    /**
     * メイン検索用：支店の選択/解除を切り替え
     * @param {string} region - 対象支店名
     */
    toggleRegion(region) {
      const idx = this.filters.regions.indexOf(region);
      if (idx === -1) {
        this.filters.regions.push(region);
      } else {
        this.filters.regions.splice(idx, 1);
      }
    },

    /**
     * メイン検索用：支店選択を確定してドロップダウンを閉じる
     */
    confirmRegionSelection() {
      this.regionDropdownOpen = false;
      this.applyFilters();
    },

    /**
     * メイン検索用：支店が選択されているかをチェック
     * @param {string} region - チェック対象支店名
     * @returns {boolean} 選択済みならtrue
     */
    isRegionSelected(region) {
      return this.filters.regions.includes(region);
    },

    /**
     * メイン検索用：選択中の支店を表示用テキストに整形
     * @returns {string} 表示用テキスト
     */
    get selectedRegionsText() {
      if (this.filters.regions.length === 0) return "すべて";
      if (this.filters.regions.length <= 2)
        return this.filters.regions.join(", ");
      return `${this.filters.regions.length}件選択中`;
    },

    // ===== 多角分析モーダル用ドロップダウン関数 =====
    // Note: Alpine.jsリアクティビティとコンポーネント分離のため、
    //       メインフィルター用と意図的に重複して実装

    /**
     * 多角分析モーダル用：支店ドロップダウンの開閉を切り替え
     */
    toggleDetailRegionDropdown() {
      this.detailRegionDropdownOpen = !this.detailRegionDropdownOpen;
    },

    /**
     * 多角分析モーダル用：支店の選択/解除を切り替え
     * @param {string} region - 対象支店名
     */
    toggleDetailRegion(region) {
      const idx = this.detailModal.commonFilters.regions.indexOf(region);
      if (idx === -1) {
        this.detailModal.commonFilters.regions.push(region);
      } else {
        this.detailModal.commonFilters.regions.splice(idx, 1);
      }
    },

    /**
     * 多角分析モーダル用：支店選択を確定してドロップダウンを閉じる
     */
    confirmDetailRegionSelection() {
      this.detailRegionDropdownOpen = false;
      this.applyDetailCommonFilters();
    },

    /**
     * 多角分析モーダル用：支店が選択されているかをチェック
     * @param {string} region - チェック対象支店名
     * @returns {boolean} 選択済みならtrue
     */
    isDetailRegionSelected(region) {
      return this.detailModal.commonFilters.regions.includes(region);
    },

    /**
     * 多角分析モーダル用：選択中の支店を表示用テキストに整形
     * @returns {string} 表示用テキスト
     */
    get selectedDetailRegionsText() {
      if (this.detailModal.commonFilters.regions.length === 0) return "すべて";
      if (this.detailModal.commonFilters.regions.length <= 2)
        return this.detailModal.commonFilters.regions.join(", ");
      return `${this.detailModal.commonFilters.regions.length}件選択中`;
    },

    /**
     * 多角分析モーダル用：業者ドロップダウンの開閉を切り替え
     */
    toggleDetailVendorDropdown() {
      this.detailVendorDropdownOpen = !this.detailVendorDropdownOpen;
    },

    /**
     * 多角分析モーダル用：業者の選択/解除を切り替え
     * @param {string} vendor - 対象業者名
     */
    toggleDetailVendor(vendor) {
      const idx = this.detailModal.commonFilters.vendors.indexOf(vendor);
      if (idx === -1) {
        this.detailModal.commonFilters.vendors.push(vendor);
      } else {
        this.detailModal.commonFilters.vendors.splice(idx, 1);
      }
    },

    /**
     * 多角分析モーダル用：業者選択を確定してドロップダウンを閉じる
     */
    confirmDetailVendorSelection() {
      this.detailVendorDropdownOpen = false;
      this.applyDetailCommonFilters();
    },

    /**
     * 多角分析モーダル用：業者が選択されているかをチェック
     * @param {string} vendor - チェック対象業者名
     * @returns {boolean} 選択済みならtrue
     */
    isDetailVendorSelected(vendor) {
      return this.detailModal.commonFilters.vendors.includes(vendor);
    },

    /**
     * 多角分析モーダル用：選択中の業者を表示用テキストに整形
     * @returns {string} 表示用テキスト
     */
    get selectedDetailVendorsText() {
      if (this.detailModal.commonFilters.vendors.length === 0) return "すべて";
      if (this.detailModal.commonFilters.vendors.length <= 2)
        return this.detailModal.commonFilters.vendors.join(", ");
      return `${this.detailModal.commonFilters.vendors.length}件選択中`;
    },
    // ===== 多角分析モーダル用ドロップダウン関数終了 =====

    /**
     * rawRecordsに派生フィールドを事前計算して追加
     * 日付フォーマット、業者名クリーニング、金額計算など
     */
    processData() {
      // Pre-compute derived fields including cleaned vendor name
      const vendorNameRegex = /株式会社|有限会社/g;

      this.records = this.rawRecords.map((record) => ({
        ...record,
        orderDateFormatted: formatDateHyphen(record.orderDate),
        orderMonth: record.orderDate
          ? record.orderDate.slice(0, 4) + "-" + record.orderDate.slice(4, 6)
          : "",
        orderWeek: record.orderDate ? getWeekNumber(record.orderDate) : "",
        orderWeekStart: record.orderDate
          ? getWeekStartDate(record.orderDate)
          : "",
        amount: record.qty * record.price,
        // Pre-compute cleaned vendor name to avoid regex in hot path
        vendorNameClean: record.vendor.replace(vendorNameRegex, "").trim(),
      }));
    },

    /**
     * レコードを小工事項目（item+spec）でグループ化し統計を計算
     */
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
      this.itemGroups = Object.values(groups).map((group) => {
        group.records.sort((a, b) => a.orderDate.localeCompare(b.orderDate));

        // Calculate statistics using shared utility
        const prices = group.records.map((record) => record.price);
        const stats = calcPriceStats(prices);

        return {
          ...group,
          recordCount: group.records.length,
          minPrice: stats.min,
          maxPrice: stats.max,
          avgPrice: stats.avg,
        };
      });
    },

    /**
     * Web Worker（またはフォールバック）を使用してフィルターを適用
     * パフォーマンス測定付き
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
     * 同期的なフィルター実装（Web Workerフォールバック用）
     * @private
     */
    _applyFiltersSync() {
      const filters = this.filters;
      const itemKw = filters.item.toLowerCase();

      // Build filter criteria object for recordMatchesFilters
      const criteria = {
        projectKw: filters.project.toLowerCase(),
        regions: filters.regions,
        majorCodes: filters.majorCodes,
        vendor: filters.vendor.toLowerCase(),
        dateFrom: filters.dateFrom.replace(/-/g, ""),
        dateTo: filters.dateTo.replace(/-/g, ""),
        ranges: {
          floorMin: filters.floorMin,
          floorMax: filters.floorMax,
          unitRowMin: filters.unitRowMin,
          unitRowMax: filters.unitRowMax,
          resUnitMin: filters.resUnitMin,
          resUnitMax: filters.resUnitMax,
          constAreaMin: filters.constAreaMin,
          constAreaMax: filters.constAreaMax,
          totalAreaMin: filters.totalAreaMin,
          totalAreaMax: filters.totalAreaMax,
        },
      };

      this.filteredGroups = this.itemGroups
        .map((group) => {
          // Filter matching records
          const matchingRecords = group.records.filter((record) =>
            recordMatchesFilters(record, criteria)
          );

          // Calculate statistics using shared utility
          const prices = matchingRecords.map((record) => record.price);
          const stats = calcPriceStats(prices);

          return {
            ...group,
            filteredRecords: matchingRecords,
            minPrice: stats.min,
            maxPrice: stats.max,
            vendorSummary: null, // Lazy computed
          };
        })
        .filter((group) => {
          if (
            itemKw &&
            !group.item.toLowerCase().includes(itemKw) &&
            !group.spec.toLowerCase().includes(itemKw)
          )
            return false;
          return group.filteredRecords.length > 0;
        })
        // Sort by record count (descending)
        .sort((a, b) => b.filteredRecords.length - a.filteredRecords.length);
    },

    /**
     * すべてのフィルターをデフォルト値にリセット
     */
    async clearFilters() {
      this.filters = { ...DEFAULT_FILTERS };
      this.filteredGroups = this.itemGroups
        .map((group) => ({
          ...group,
          filteredRecords: group.records,
        }))
        // Sort by record count (descending)
        .sort((a, b) => b.filteredRecords.length - a.filteredRecords.length);
      this.displayedCount = this.displayLimit;
    },

    // ===== Pagination Getters =====

    /**
     * 表示中のグループ一覧（ページネーション適用後）
     * @returns {Array} 表示範囲のフィルター済みグループ
     */
    get displayedGroups() {
      return this.filteredGroups.slice(0, this.displayedCount);
    },

    /**
     * さらに表示可能なグループが存在するか
     * @returns {boolean} 表示可能ならtrue
     */
    get hasMoreGroups() {
      return this.displayedCount < this.filteredGroups.length;
    },

    /**
     * 未表示のグループ数を取得
     * @returns {number} 残りグループ数
     */
    get remainingGroupsCount() {
      return this.filteredGroups.length - this.displayedCount;
    },

    /**
     * さらにグループを読み込む（ページネーション）
     */
    loadMoreGroups() {
      this.displayedCount += this.displayLimit;
    },

    /**
     * アクティブなフィルター条件を表示用配列に変換
     * @returns {Array<string>} フィルター表示文字列配列
     */
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

    /**
     * グループの展開/折りたたみを切り替え
     * @param {number} idx - グループインデックス
     */
    toggleGroup(idx) {
      this.expandedGroups[idx] = !this.expandedGroups[idx];
    },

    /**
     * 業者ごとに単価統計を計算（単一パス集計）
     * @param {Array} records - 集計対象レコード
     * @returns {Array} 業者別統計配列 [{name, count, min, avg, max}]
     */
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

    /**
     * 業者サマリーを取得（遅延評価、キャッシュあり）
     * @param {Object} group - 対象グループ
     * @returns {Array} 業者別統計配列
     */
    getVendorSummary(group) {
      if (!group.vendorSummary) {
        group.vendorSummary = this.computeVendorSummary(group.filteredRecords);
      }
      return group.vendorSummary;
    },

    /**
     * 業者数を高速に取得（サマリー計算せずカウントのみ）
     * @param {Object} group - 対象グループ
     * @returns {number} ユニークな業者数
     */
    getVendorCount(group) {
      if (group.vendorSummary) {
        return group.vendorSummary.length;
      }
      // Quick count using object (faster than Set + map)
      const seen = {};
      let count = 0;
      const records = group.filteredRecords;
      for (let i = 0, len = records.length; i < len; i++) {
        const vendor = records[i].vendor;
        if (!seen[vendor]) {
          seen[vendor] = true;
          count++;
        }
      }
      return count;
    },

    // ===== Autocomplete Functions =====

    /**
     * 工事名称のオートコンプリート候補をフィルタリング
     */
    filterProjectNames() {
      const filter = this.filters.project;
      this.autocomplete.items = filter
        ? this.projectNames.filter((project) =>
            project.toLowerCase().includes(filter.toLowerCase())
          )
        : this.projectNames;
      this.autocomplete.activeIndex = -1;
    },

    /**
     * オートコンプリート選択を下に移動
     */
    moveAutocompleteDown() {
      if (!this.autocomplete.show) return;
      this.autocomplete.activeIndex = Math.min(
        this.autocomplete.activeIndex + 1,
        this.autocomplete.items.length - 1
      );
    },

    /**
     * オートコンプリート選択を上に移動
     */
    moveAutocompleteUp() {
      if (!this.autocomplete.show) return;
      this.autocomplete.activeIndex = Math.max(
        this.autocomplete.activeIndex - 1,
        0
      );
    },

    /**
     * 現在のオートコンプリート選択を確定
     */
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

    /**
     * クリックイベントから工事名称を選択
     * @param {Event} event - クリックイベント
     */
    selectProject(event) {
      if (event.target.classList.contains("autocomplete-item")) {
        this.filters.project = event.target.dataset.value;
        this.autocomplete.show = false;
      }
    },

    /**
     * チャート表示用データを準備（週次集計、最適化済み単一パス処理）
     * @param {Array} records - フィルター済みレコード
     * @returns {{weekLabels, actualData, weeklyMinData, weeklyMaxData, weeklyMedianData, stats, weekCount}}
     */
    prepareChartData(records) {
      const { weekData, globalMin, globalMax, globalSum } =
        groupRecordsByWeek(records);
      const weeklyStats = calculateWeeklyStats(weekData, records.length);

      return {
        ...weeklyStats,
        stats: {
          min: globalMin === Infinity ? 0 : globalMin,
          max: globalMax === -Infinity ? 0 : globalMax,
          avg: records.length > 0 ? Math.round(globalSum / records.length) : 0,
        },
      };
    },

    /**
     * チャート表示モードを切り替え（チャート/テーブル）
     * @param {string} mode - 'chart' または 'table'
     */
    setChartDisplayMode(mode) {
      this.chartData.displayMode = mode;
      if (mode === "chart") {
        this.$nextTick(() => {
          this.renderPriceChart();
        });
      }
    },

    /**
     * 単価推移チャートを描画（Chart.jsインスタンス生成）
     */
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

    /**
     * 単価推移モーダルを開く
     * @param {number} idx - filteredGroupsのインデックス
     */
    showChart(idx) {
      const group = this.filteredGroups[idx];
      const records = group.filteredRecords;

      // Calculate statistics using shared utility
      const prices = records.map((record) => record.price);
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
     * 多角分析モーダルを開く - タブ形式BIダッシュボード
     * @param {number} idx - filteredGroupsのインデックス
     */
    openDetailModal(idx) {
      const group = this.filteredGroups[idx];
      // Calculate date range from actual data
      const orderDates = group.filteredRecords
        .map((record) => record.orderDate)
        .filter((date) => date && date.length === 8)
        .sort();
      const minDate =
        orderDates.length > 0 ? formatDateHyphen(orderDates[0]) : "";
      const maxDate =
        orderDates.length > 0
          ? formatDateHyphen(orderDates[orderDates.length - 1])
          : "";

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
     * 多角分析モーダルを閉じてクリーンアップ
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
     * 多角分析モーダルのタブを切り替え
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
     * 現在のタブがテーブルモードかチェック
     * @returns {boolean} テーブルモードならtrue
     */
    isDetailTableMode() {
      const tab = this.detailModal.activeTab;
      if (tab === "timeseries")
        return this.detailModal.timeseries.chartType === "table";
      if (tab === "comparison")
        return this.detailModal.comparison.chartType === "table";
      if (tab === "trend") return this.detailModal.trend.chartType === "table";
      return false;
    },

    /**
     * 多角分析モーダルの共通フィルターを適用してKPI更新
     */
    applyDetailCommonFilters() {
      const records = this.detailModal.currentGroup?.filteredRecords || [];
      const { dateFrom, dateTo, regions, vendors } =
        this.detailModal.commonFilters;

      const dateFromYMD = dateFrom ? dateFrom.replace(/-/g, "") : "";
      const dateToYMD = dateTo ? dateTo.replace(/-/g, "") : "";

      this.detailModal.filteredByCommon = records.filter((record) => {
        if (dateFromYMD && record.orderDate < dateFromYMD) return false;
        if (dateToYMD && record.orderDate > dateToYMD) return false;
        if (regions.length && !regions.includes(record.region)) return false;
        if (vendors.length && !vendors.includes(record.vendor)) return false;
        return true;
      });

      this.updateKpiSummary();
      if (!this.isDetailTableMode()) {
        this.renderDetailChart();
      }
    },

    /**
     * 共通フィルターをクリア（初期値にリセット）
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
     * フィルター済みレコードからKPIサマリーを更新
     */
    updateKpiSummary() {
      const records = this.detailModal.filteredByCommon || [];
      const prices = records.map((record) => record.price);
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
     * 多角分析モーダルで利用可能な支店一覧を取得
     * @returns {Array<string>} ユニークな支店名配列
     */
    get detailModalRegionOptions() {
      const records = this.detailModal.currentGroup?.filteredRecords || [];
      return [...new Set(records.map((record) => record.region))].sort();
    },

    /**
     * 多角分析モーダルで利用可能な業者一覧を取得
     * @returns {Array<string>} ユニークな業者名配列
     */
    get detailModalVendorOptions() {
      const records = this.detailModal.currentGroup?.filteredRecords || [];
      return [...new Set(records.map((record) => record.vendor))].sort();
    },

    /**
     * 現在のgroupBy設定に基づいてグループ化されたデータを取得
     * @returns {Object} グループ化レコード {key: records[]}
     */
    getGroupedDetailData() {
      const allRecords = this.detailModal.currentGroup?.filteredRecords || [];
      // Apply pagination limit
      const records = allRecords.slice(0, this.detailModal.listDisplayed);
      const groupBy = this.detailModal.groupBy;

      const keyFn = {
        timeline: (record) => record.orderWeekStart,
        majorCode: (record) => record.majorCode,
        region: (record) => record.region,
        building: (record) => buildingInfoKey(record),
        vendor: (record) => record.vendor,
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
     * 多角分析モーダルの全レコード数を取得
     * @returns {number} レコード総数
     */
    get detailTotalRecords() {
      return this.detailModal.currentGroup?.filteredRecords?.length || 0;
    },

    /**
     * さらに表示可能なレコードが存在するか
     * @returns {boolean} 表示可能ならtrue
     */
    get hasMoreDetailRecords() {
      return this.detailModal.listDisplayed < this.detailTotalRecords;
    },

    /**
     * 未表示のレコード数を取得
     * @returns {number} 残りレコード数
     */
    get remainingDetailRecords() {
      return this.detailTotalRecords - this.detailModal.listDisplayed;
    },

    /**
     * さらにレコードを読み込む（ページネーション）
     */
    loadMoreDetailRecords() {
      this.detailModal.listDisplayed += this.detailModal.listLimit;
    },

    /**
     * 現在のタブに応じたテーブルデータを取得
     * @returns {Array} グループ化されたテーブルデータ（統計付き）
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
     * 時系列分析用テーブルデータを準備（時間単位でグループ化）
     * @param {Array} records - 処理対象レコード
     * @param {string} timeUnit - 'yearly' | 'monthly' | 'weekly' | 'daily'
     * @returns {Array} グループ化データ（統計付き）
     */
    prepareTimeseriesTableData(records, timeUnit) {
      const grouped = groupByTimeUnit(records, timeUnit);
      const sortedKeys = Object.keys(grouped).sort();

      return sortedKeys.map((key) => {
        const groupRecords = grouped[key];
        const prices = groupRecords.map((record) => record.price);
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
     * 比較分析用テーブルデータを準備（比較軸でグループ化）
     * @param {Array} records - 処理対象レコード
     * @param {string} groupBy - 'region' | 'vendor' | 'majorCode' | 'building'
     * @returns {Array} グループ化データ（統計付き）
     */
    prepareComparisonTableData(records, groupBy) {
      const keyFn = {
        region: (record) => record.region,
        vendor: (record) => record.vendor,
        majorCode: (record) => record.majorCode,
        building: (record) => buildingInfoKey(record),
      }[groupBy];

      const grouped = groupRecordsBy(records, keyFn);

      return Object.entries(grouped)
        .map(([key, groupRecords]) => {
          const prices = groupRecords.map((record) => record.price);
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
     * 傾向分析用テーブルデータを準備（X軸値でグループ化）
     * @param {Array} records - 処理対象レコード
     * @param {string} xAxis - 'resUnits' | 'floors' | 'totalArea' | 'constArea'
     * @returns {Array} グループ化データ（統計付き）
     */
    prepareTrendTableData(records, xAxis) {
      // Group by x-axis value
      const grouped = groupRecordsBy(records, (record) => {
        const value = record[xAxis];
        if (xAxis === "totalArea" || xAxis === "constArea") {
          // Group area values into buckets of 100
          return `${Math.floor(value / 100) * 100}~${
            Math.floor(value / 100) * 100 + 99
          }㎡`;
        }
        return `${value}${xAxis === "floors" ? "階" : "戸"}`;
      });

      return Object.entries(grouped)
        .map(([key, groupRecords]) => {
          const prices = groupRecords.map((record) => record.price);
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
     * 現在のタブとチャートタイプに基づいてチャートデータを準備
     * @returns {Object|null} チャートデータ
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
     * 時系列分析用チャートデータを準備
     * @param {Array} records - 処理対象レコード
     * @returns {Object} 時系列チャートデータ
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
        const prices = grouped[key].map((record) => record.price);
        const stats = calcPriceStats(prices);
        minData.push(stats.min);
        avgData.push(stats.avg);
        medianData.push(calcMedian(prices));
        maxData.push(stats.max);
      });

      return {
        labels,
        minData,
        avgData,
        medianData,
        maxData,
        count: sortedKeys.length,
      };
    },

    /**
     * 比較分析用チャートデータを準備
     * @param {Array} records - 処理対象レコード
     * @returns {Object} 比較チャートデータ {labels, data, boxplotData}
     */
    prepareComparisonChartData(records) {
      const groupBy = this.detailModal.comparison.groupBy;
      const metric = this.detailModal.comparison.metric;

      const keyFn = {
        region: (record) => record.region,
        vendor: (record) => record.vendor,
        majorCode: (record) => record.majorCode,
        building: (record) => buildingInfoKey(record),
      }[groupBy];

      const grouped = groupRecordsBy(records, keyFn);
      const labels = Object.keys(grouped).sort((a, b) => {
        return grouped[b].length - grouped[a].length;
      });

      const data = labels.map((key) => {
        const prices = grouped[key].map((record) => record.price);
        const stats = calcPriceStats(prices);

        if (metric === "avg") return stats.avg;
        if (metric === "median") return calcMedian(prices);
        return stats.avg;
      });

      // For boxplot, we need the raw prices per group
      const boxplotData = labels.map((key) =>
        grouped[key].map((record) => record.price)
      );

      return { labels, data, boxplotData };
    },

    /**
     * 傾向分析用チャートデータを準備（散布図/バブル/ヒートマップ）
     * @param {Array} records - 処理対象レコード
     * @returns {Object} 傾向分析チャートデータ
     */
    prepareTrendChartData(records) {
      const xAxis = this.detailModal.trend.xAxis;
      const bubbleSize = this.detailModal.trend.bubbleSize;

      const scatterData = records.map((record) => ({
        x: record[xAxis],
        y: record.price,
        r:
          bubbleSize === "qty"
            ? Math.log10(Math.abs(record.qty) + 1) *
              CHART_CONFIG.BUBBLE_SIZE_QTY_FACTOR
            : Math.sqrt(
                Math.abs(record.amount) /
                  CHART_CONFIG.BUBBLE_SIZE_AMOUNT_DIVISOR
              ) * CHART_CONFIG.BUBBLE_SIZE_AMOUNT_FACTOR,
        record: record,
      }));

      // For heatmap, create a matrix with ranges
      const xAxisValues = records.map((record) => record[xAxis]);
      const priceValues = records.map((record) => record.price);

      const xRanges = createValueRanges(
        xAxisValues,
        CHART_CONFIG.HEATMAP_BUCKET_COUNT,
        xAxis
      );
      const priceRanges = createValueRanges(
        priceValues,
        CHART_CONFIG.HEATMAP_BUCKET_COUNT,
        "price"
      );

      const heatmapData = [];
      xRanges.forEach((xRange) => {
        priceRanges.forEach((yRange) => {
          const isLastXRange = xRange === xRanges[xRanges.length - 1];
          const isLastYRange = yRange === priceRanges[priceRanges.length - 1];

          const count = records.filter((record) => {
            const xMatch =
              record[xAxis] >= xRange.min &&
              (isLastXRange
                ? record[xAxis] <= xRange.max
                : record[xAxis] < xRange.max);
            const yMatch =
              record.price >= yRange.min &&
              (isLastYRange
                ? record.price <= yRange.max
                : record.price < yRange.max);
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
     * 比較データを準備（グループごとのmin/avg/max）
     * @returns {Object} {labels, avgPrices, minPrices, maxPrices}
     */
    prepareComparisonData() {
      const grouped = this.getGroupedDetailData();
      const labels = Object.keys(grouped);

      // Calculate stats once per group instead of 3 times
      const statsArray = labels.map((key) =>
        calcPriceStats(grouped[key].map((record) => record.price))
      );

      return {
        labels,
        avgPrices: statsArray.map((stats) => stats.avg),
        minPrices: statsArray.map((stats) => stats.min),
        maxPrices: statsArray.map((stats) => stats.max),
      };
    },

    /**
     * 多角分析モーダルのチャートを描画
     * Note: Alpine.js x-show遷移によりcanvasが即座に利用できない場合があるため、
     *       リトライメカニズムを実装（指数バックオフ）
     * @param {number} retryCount - 現在のリトライ回数（デフォルト: 0）
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
     * 時系列分析用チャートを描画
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} data - prepareTimeseriesChartDataからのデータ
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
        backgroundColor:
          chartType === "bar"
            ? CHART_COLORS.min.border + "88"
            : CHART_COLORS.min.background,
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
        backgroundColor:
          chartType === "area"
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
        backgroundColor:
          chartType === "bar"
            ? CHART_COLORS.max.border + "88"
            : CHART_COLORS.max.background,
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
     * 比較分析用チャートを描画（棒グラフ/ボックスプロット/レーダー）
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} data - prepareComparisonChartDataからのデータ
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
            datasets: [
              {
                label: metricLabels[metric] || "平均",
                data: chartData,
                backgroundColor: CHART_COLORS.avg.border,
              },
            ],
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
     * ボックスプロットチャートを描画
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Array} labels - グループラベル
     * @param {Array} boxplotData - 各グループの価格配列
     * @param {string} unit - 単位ラベル
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
              {
                label: "Q1",
                data: statsData.map((s) => s.q1),
                backgroundColor: "#20c99755",
              },
              {
                label: "中央値",
                data: statsData.map((s) => s.median),
                backgroundColor: "#0d6efd",
              },
              {
                label: "Q3",
                data: statsData.map((s) => s.q3),
                backgroundColor: "#fd7e1455",
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
              legend: { display: false },
              subtitle: {
                display: true,
                text: "※ データを4等分した位置（25%, 50%, 75%）を正確に計算",
                font: { size: 11 },
                color: "#6c757d",
                padding: { bottom: 10 },
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
        return;
      }

      this.detailChartInstance = new Chart(ctx, {
        type: "boxplot",
        data: {
          labels,
          datasets: [
            {
              label: "単価分布",
              data: boxplotData,
              backgroundColor: CHART_COLORS.avg.border + "44",
              borderColor: CHART_COLORS.avg.border,
              borderWidth: 1,
              outlierBackgroundColor: CHART_COLORS.max.border,
            },
          ],
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
              padding: { bottom: 10 },
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
     * レーダーチャートを描画
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Array} labels - グループラベル
     * @param {Array} data - データ値
     * @param {string} metric - メトリックタイプ
     * @param {string} unit - 単位ラベル
     */
    renderRadarChart(ctx, labels, data, metric) {
      const metricLabels = { avg: "平均", median: "中央値" };
      this.detailChartInstance = new Chart(ctx, {
        type: "radar",
        data: {
          labels,
          datasets: [
            {
              label: metricLabels[metric] || "平均",
              data,
              backgroundColor: CHART_COLORS.avg.border + "44",
              borderColor: CHART_COLORS.avg.border,
              borderWidth: 2,
              pointBackgroundColor: CHART_COLORS.avg.border,
            },
          ],
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
     * 傾向分析用チャートを描画（散布図/バブル/ヒートマップ）
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} data - prepareTrendChartDataからのデータ
     */
    renderTrendTabChart(ctx, data) {
      const chartType = this.detailModal.trend.chartType;
      const unit = this.detailModal.currentGroup?.unit || "";
      const { scatterData, heatmapData, xRanges, priceRanges, xAxisLabel } =
        data;

      if (chartType === "heatmap") {
        this.renderHeatmapChart(
          ctx,
          heatmapData,
          xRanges,
          priceRanges,
          xAxisLabel,
          unit
        );
      } else {
        // Scatter or bubble chart
        // Calculate correlation coefficient
        const xValues = scatterData.map((d) => d.x);
        const yValues = scatterData.map((d) => d.y);
        const correlation = calcCorrelation(xValues, yValues);
        const correlationText =
          correlation !== null ? `相関係数: ${correlation.toFixed(3)}` : "";

        const bubbleText =
          chartType === "bubble"
            ? `円の大きさは${
                this.detailModal.trend.bubbleSize === "qty"
                  ? "数量"
                  : "合計金額（数量×単価）"
              }を表示。`
            : "";

        const subtitleText = correlationText
          ? `※ ${bubbleText}${correlationText} (右上ほど単価が高く${xAxisLabel}が多い傾向、外れ値や標準的な価格帯の分布を確認)`
          : `※ ${bubbleText}右上ほど単価が高く${xAxisLabel}が多い傾向、外れ値や標準的な価格帯の分布を確認`;

        this.detailChartInstance = new Chart(ctx, {
          type: chartType === "bubble" ? "bubble" : "scatter",
          data: {
            datasets: [
              {
                label: "単価",
                data: scatterData,
                backgroundColor: CHART_COLORS.avg.border + "88",
                borderColor: CHART_COLORS.avg.border,
                borderWidth: 1,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: {
              mode: "point",
              intersect: true,
              axis: "xy",
            },
            plugins: {
              legend: { display: false },
              subtitle: {
                display: true,
                text: subtitleText,
                font: { size: 11 },
                color: "#6c757d",
                padding: { bottom: 10 },
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
     * ヒートマップチャートを描画
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Array} data - ヒートマップデータ [{x, y, v}]
     * @param {Array} xRanges - X軸の範囲
     * @param {Array} priceRanges - 価格の範囲ラベル
     * @param {string} xAxisLabel - X軸のラベル
     * @param {string} unit - 単位ラベル
     */
    renderHeatmapChart(ctx, data, xRanges, priceRanges, xAxisLabel, unit) {
      // Check if matrix plugin is available
      if (typeof Chart.controllers.matrix === "undefined") {
        console.warn("Matrix plugin not loaded, falling back to scatter chart");
        // Fallback to scatter chart
        this.detailChartInstance = new Chart(ctx, {
          type: "scatter",
          data: {
            datasets: [
              {
                label: "件数",
                data: data.map((d) => ({ x: d.x, y: d.y, r: d.v * 3 })),
                backgroundColor: CHART_COLORS.avg.border + "88",
              },
            ],
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
          datasets: [
            {
              label: "件数",
              data: data,
              backgroundColor: (context) => {
                const value = context.dataset.data[context.dataIndex]?.v || 0;
                const alpha = Math.min(value / 10, 1);
                return `rgba(13, 110, 253, ${alpha})`;
              },
              borderWidth: 1,
              borderColor: "rgba(0, 0, 0, 0.1)",
              width: ({ chart }) =>
                (chart.chartArea?.width || 100) / xRanges.length - 1,
              height: ({ chart }) =>
                (chart.chartArea?.height || 100) / priceRanges.length - 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          layout: {
            padding: {
              bottom: 5,
            },
          },
          plugins: {
            legend: {
              display: true,
              position: "bottom",
              align: "center",
              labels: {
                boxWidth: 30,
                boxHeight: 8,
                padding: 3,
                font: { size: 9 },
                usePointStyle: false,
              },
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
