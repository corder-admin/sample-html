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
 *   - utils.js  : ユーティリティ関数（fmt, parseDate, getWeekNumber等）
 *   - data.js   : 生データ（rawRecords）
 *   - Alpine.js : リアクティブUIフレームワーク
 *   - Chart.js  : グラフ描画ライブラリ
 *   - Bootstrap : UIコンポーネント（モーダル等）
 *
 * =============================================================================
 */

function appData() {
  return {
    filters: {
      project: "",
      region: "",
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
    },
    chartInstance: null,

    init() {
      this.processData();
      this.groupByItem();
      this.clearFilters();
      this.projectNames = [
        ...new Set(this.rawRecords.map((r) => r.projectName)),
      ].sort();
    },

    processData() {
      this.records = this.rawRecords.map((r) => ({
        ...r,
        orderDateFormatted: parseDate(r.orderDate),
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
        return {
          ...g,
          recordCount: g.records.length,
          minPrice: Math.min(...prices),
          maxPrice: Math.max(...prices),
          avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
        };
      });
    },

    applyFilters() {
      const projectKw = this.filters.project.toLowerCase();
      const itemKw = this.filters.item.toLowerCase();
      const region = this.filters.region;
      const majorCodes = this.filters.majorCodes;
      const vendor = this.filters.vendor.toLowerCase();
      const dateFrom = this.filters.dateFrom.replace(/-/g, "");
      const dateTo = this.filters.dateTo.replace(/-/g, "");
      const floorMin = this.filters.floorMin || 0;
      const floorMax = this.filters.floorMax || Infinity;
      const unitRowMin = this.filters.unitRowMin || 0;
      const unitRowMax = this.filters.unitRowMax || Infinity;
      const resUnitMin = this.filters.resUnitMin || 0;
      const resUnitMax = this.filters.resUnitMax || Infinity;
      const constAreaMin = this.filters.constAreaMin || 0;
      const constAreaMax = this.filters.constAreaMax || Infinity;
      const totalAreaMin = this.filters.totalAreaMin || 0;
      const totalAreaMax = this.filters.totalAreaMax || Infinity;

      this.filteredGroups = this.itemGroups
        .map((g) => {
          const matchingRecords = g.records.filter((r) => {
            if (projectKw && !r.projectName.toLowerCase().includes(projectKw))
              return false;
            if (region && r.region !== region) return false;
            if (majorCodes.length && !majorCodes.includes(r.majorCode))
              return false;
            if (vendor && !r.vendor.toLowerCase().includes(vendor))
              return false;
            if (dateFrom && r.orderDate < dateFrom) return false;
            if (dateTo && r.orderDate > dateTo) return false;
            if (r.floors < floorMin || r.floors > floorMax) return false;
            if (r.unitRow < unitRowMin || r.unitRow > unitRowMax) return false;
            if (r.resUnits < resUnitMin || r.resUnits > resUnitMax)
              return false;
            if (r.constArea < constAreaMin || r.constArea > constAreaMax)
              return false;
            if (r.totalArea < totalAreaMin || r.totalArea > totalAreaMax)
              return false;
            return true;
          });
          const prices = matchingRecords.map((r) => r.price);
          return {
            ...g,
            filteredRecords: matchingRecords,
            minPrice: prices.length ? Math.min(...prices) : 0,
            maxPrice: prices.length ? Math.max(...prices) : 0,
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
        region: "",
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
      if (this.filters.region) filters.push(`支店名: ${this.filters.region}`);
      if (this.filters.majorCodes.length)
        filters.push(`大工事項目: ${this.filters.majorCodes.join(", ")}`);
      if (this.filters.item) filters.push(`品目: ${this.filters.item}`);
      if (this.filters.vendor) filters.push(`業者: ${this.filters.vendor}`);
      return filters;
    },

    toggleGroup(idx) {
      this.expandedGroups[idx] = !this.expandedGroups[idx];
    },

    getVendorSummary(records) {
      const vd = {};
      records.forEach((r) => {
        const n = r.vendor;
        if (!vd[n]) vd[n] = { prices: [], count: 0 };
        vd[n].prices.push(r.price);
        vd[n].count++;
      });
      return Object.entries(vd).map(([name, data]) => {
        const mn = Math.min(...data.prices);
        const mx = Math.max(...data.prices);
        const av = Math.round(
          data.prices.reduce((a, b) => a + b, 0) / data.prices.length
        );
        return {
          name: name.replace(/株式会社|有限会社/g, "").trim(),
          count: data.count,
          min: mn,
          avg: av,
          max: mx,
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

    showChart(idx) {
      const group = this.filteredGroups[idx];
      const records = group.filteredRecords;
      this.chartData = {
        title: `実行単価実績チャート - ${group.item}`,
        item: group.item,
        unit: group.unit,
        records: records,
      };

      this.$nextTick(() => {
        const ctx = this.$refs.netPriceChart.getContext("2d");
        if (this.chartInstance) this.chartInstance.destroy();

        const weekData = {};
        records.forEach((r) => {
          if (!weekData[r.orderWeek])
            weekData[r.orderWeek] = {
              prices: [],
              weekStart: r.orderWeekStart,
            };
          weekData[r.orderWeek].prices.push(r.price);
        });

        const allWeeks = Object.keys(weekData).sort();
        const weekLabels = allWeeks.map((w) => weekData[w].weekStart);

        const actualData = allWeeks.map((w) => {
          const prices = weekData[w].prices;
          return prices.reduce((a, b) => a + b, 0) / prices.length;
        });

        const allPrices = records.map((r) => r.price);
        const globalMin = Math.min(...allPrices);
        const globalMax = Math.max(...allPrices);
        const globalAvg = Math.round(
          allPrices.reduce((a, b) => a + b, 0) / allPrices.length
        );

        const minLine = allWeeks.map(() => globalMin);
        const maxLine = allWeeks.map(() => globalMax);
        const avgLine = allWeeks.map(() => globalAvg);

        const datasets = [
          {
            label: `最小値 (¥${fmt(globalMin)})`,
            data: minLine,
            borderColor: "#198754",
            backgroundColor: "#19875422",
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false,
            tension: 0,
          },
          {
            label: `平均値 (¥${fmt(globalAvg)})`,
            data: avgLine,
            borderColor: "#0d6efd",
            backgroundColor: "#0d6efd22",
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false,
            tension: 0,
          },
          {
            label: `最大値 (¥${fmt(globalMax)})`,
            data: maxLine,
            borderColor: "#dc3545",
            backgroundColor: "#dc354522",
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false,
            tension: 0,
          },
          {
            label: "実行単価",
            data: actualData,
            borderColor: "#6f42c1",
            backgroundColor: "#6f42c1",
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
            interaction: { intersect: false, mode: "index" },
            plugins: {
              legend: {
                position: "top",
                labels: { usePointStyle: true, padding: 20 },
              },
              tooltip: {
                callbacks: {
                  label: (ctx) => `${ctx.dataset.label}: ¥${fmt(ctx.raw)}`,
                },
              },
            },
            scales: {
              x: {
                title: { display: true, text: "発注週（週初め日付）" },
                grid: { display: false },
              },
              y: {
                title: {
                  display: true,
                  text: `実行単価 (円/${group.unit})`,
                },
                ticks: { callback: (v) => "¥" + fmt(v) },
              },
            },
          },
        });

        new bootstrap.Modal(this.$refs.chartModal).show();
      });
    },
  };
}
