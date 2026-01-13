# CLAUDE.md

Guidance for Claude Code when working with this repository.

## §1 Project Identity

```yaml
name: 業者見積データベース (Vendor Quote Database)
type: Static SPA (no build step)
purpose: Search and analyze construction vendor quotes
```

## §2 Tech Stack

```yaml
framework: Alpine.js 3.15.3 (CDN)
css: Bootstrap 5.3.3 (CDN)
charts: Chart.js 4.4.1 (CDN)
language: JavaScript (ES6+)
libraries:
  - pako: gzip decompression
  - Comlink: Web Worker communication
  - chartjs-chart-boxplot: Box plot charts
  - chartjs-chart-matrix: Heatmap charts
```

## §3 Architecture

### §3.1 File Structure

```yaml
kentaku/:
  index.html: SPA entry point
  css/style.css: Bootstrap overrides, layout customization
  data/data.json.gz: Gzip-compressed quote records
  js/:
    utils.js: Pure utility functions (formatNumber, getWeekNumber, calcPriceStats)
    chart-helpers.js: Chart drawing helper functions (pure functions)
    data-loader.js: Data loading manager (gzip decompression, memory cache)
    filter-worker.js: Web Worker for non-blocking filter operations
    app.js: Alpine.js component (appData())
```

### §3.2 Layer Dependencies

```text
Presentation (index.html)
  ↓
Application (app.js + filter-worker.js)
  ↓
Data (data-loader.js → data.json.gz)
  ↓
Utilities (utils.js, chart-helpers.js)
```

### §3.3 Script Load Order

ALWAYS load in this exact order:

1. CDN Libraries (Bootstrap JS, Chart.js, pako, chartjs-chart-boxplot, chartjs-chart-matrix, Comlink)
2. Local Modules: `utils.js` → `chart-helpers.js` → `data-loader.js` → `app.js`
3. Alpine.js (CDN, with `defer`)
4. Web Worker: `filter-worker.js` (loaded dynamically by app.js)

## §4 Data Structure

```yaml
rawRecords[]:
  region: Branch name (string)
  projectName: Construction project name
  majorCode: Major work item code (e.g., "026")
  item: Item name
  spec: Specification
  unit: Unit of measure
  qty: Quantity (number)
  price: Unit price in JPY (number)
  vendor: Vendor name
  orderDate: Order date (YYYYMMDD format, string)
  floors: Number of floors (number)
  unitRow: Unit row count (number)
  resUnits: Residential unit count (number)
  constArea: Construction area in ㎡ (number)
  totalArea: Total floor area in ㎡ (number)
```

## §5 Alpine.js Rules

```yaml
ALWAYS:
  - Pair x-cloak with CSS: "[x-cloak] { display: none !important; }"
  - Use <template> with :key for x-for loops
  - Use @ shorthand (@click, NOT x-on:click)

NEVER:
  - Apply x-for directly on non-template elements
  - Omit :key in x-for loops
```

## §6 Core Functions

### §6.1 Main Component (app.js)

```yaml
appData():
  lifecycle:
    - init(): Initialize data loading and Alpine component
    - processData(): Transform raw records to grouped structure
    - groupByItem(): Group records by item name

  filtering:
    - applyFilters(): Apply filters via Web Worker (primary filter method)
    - clearFilters(): Reset all filters to defaults

  charts:
    - showChart(idx): Display price trend chart for item
    - openDetailModal(item): Open detail modal with charts and analysis

  ui_interaction:
    - toggleGroup(item): Expand/collapse item group
    - loadMoreGroups(): Load more item groups (pagination)
```

### §6.2 Utilities (utils.js)

```yaml
formatting:
  - formatNumber(n): Format number with locale (e.g., "1,234")

date_handling:
  - getWeekNumber(dateStr): Convert YYYYMMDD to ISO week number
  - parseDateString(dateStr): Parse YYYYMMDD to Date object

statistics:
  - calcPriceStats(prices): Calculate min/max/avg/median statistics
  - calcMedian(arr): Calculate median value
  - calcCorrelation(x, y): Calculate correlation coefficient

data_processing:
  - groupRecordsBy(records, key): Group records by key
  - isInRange(value, min, max): Check if value in range
```

### §6.3 Chart Helpers (chart-helpers.js)

```yaml
chart_creation:
  - buildTrendDatasets(groupedData, options): Build trend chart datasets
  - createLineChartOptions(options): Create Chart.js line chart config
  - createValueRanges(values, count): Create value ranges for heatmap
```

### §6.4 Data Loader (data-loader.js)

```yaml
data_loading:
  DataLoader.loadData(regionFilter):
    - Fetch data.json.gz → Decompress with pako → Parse JSON
    - Apply region filter → Cache in memory → Return records
```

### §6.5 Filter Worker (filter-worker.js)

```yaml
worker_functions:
  - Web Worker for non-blocking filter operations
  - Exposed via Comlink for main thread communication
```

## §7 Data Loading (Gzip JSON)

### §7.1 Loading Flow

```yaml
initial_access:
  - DataLoader.loadData() → fetch data.json.gz
  - Decompress with pako → parse JSON → apply region filter
  - Cache in memory → return to app.js

subsequent_access:
  - Return cached records from memory (instant)

data_update:
  - Deploy new data.json.gz → user reload page → automatic refresh
```

### §7.2 Adding New Fields

```yaml
simple_field:
  - Update data source (data.json.gz)
  - app.js: Use field as needed
  - No schema changes required
```

## §8 Modification Procedures

### §8.1 Add Quote Records

1. Update source data (data.json.gz)
2. Ensure all fields match schema (§4)
3. ALWAYS use YYYYMMDD format for orderDate

### §8.2 CSS Customization

```yaml
priority: Bootstrap utilities > css/style.css overrides
css_variables: [--sidebar-width: 300px, --header-height: 56px]
breakpoints: Bootstrap standard (lg: 992px, xl: 1200px)
```

## §9 Bootstrap 5 Rules

```yaml
ALWAYS:
  - Use utility classes before custom CSS
  - Combine utilities on elements (e.g., "d-flex align-items-center gap-3")
  - Use responsive variants (e.g., "d-lg-flex", "mb-md-4")

NEVER:
  - Write custom CSS for spacing (use m-*, p-*, gap-*)
  - Write custom CSS for flexbox (use d-flex, align-items-*, justify-content-*)
  - Use inline styles for Bootstrap-supported properties

reference: https://getbootstrap.com/docs/5.3/utilities/api/
```

## §10 Cache Version Management

ブラウザキャッシュを適切に制御するため、ファイル更新時にバージョン番号を更新する必要があります。

### §10.1 Data Version (data.json.gz)

```yaml
location: js/data-loader.js
variable: CONFIG.DATA_VERSION
format: "YYYYMMDD"
example: "20260113"

update_when:
  - data/data.json.gz を更新した時
  - TSVコンバーターでデータを再生成した時

procedure: 1. data.json.gz を更新
  2. data-loader.js の DATA_VERSION を当日の日付に変更
```

### §10.2 Script Version (JS files)

```yaml
location: index.html
parameter: "?d=YYYYMMDDHHMMSS"
example: "?d=20260113120000"

affected_files:
  - js/utils.js
  - js/chart-helpers.js
  - js/data-loader.js
  - js/app.js

update_when:
  - 上記いずれかのJSファイルを修正した時

procedure: 1. JSファイルを修正
  2. index.html の該当 <script> タグのクエリパラメータを更新
  3. 全JSファイルのバージョンを同一タイムスタンプに統一
```

### §10.3 Version Update Checklist

```yaml
ALWAYS:
  - データ更新時: DATA_VERSION を更新
  - JS修正時: index.html のスクリプトバージョンを更新
  - 両方更新時: 両方のバージョンを更新

NEVER:
  - バージョン更新を忘れてデプロイしない
  - 異なるタイムスタンプをJSファイル間で混在させない
```
