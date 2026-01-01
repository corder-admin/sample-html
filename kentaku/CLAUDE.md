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
```

## §3 Architecture

### §3.1 File Structure

```yaml
kentaku/:
  index.html: SPA entry point
  css/style.css: Bootstrap overrides, layout customization
  js/:
    utils.js: Pure utility functions (fmt, parseDate, getWeekNumber)
    db.js: IndexedDB operations module
    data-loader.js: Data loading manager (cache control)
    data.js: Raw data source (rawRecords[]) - fallback
    app.js: Alpine.js component (appData())
```

### §3.2 Layer Dependencies

```text
Presentation (index.html) → Application (app.js) → Data (data.js) → Utilities (utils.js)
```

### §3.3 Script Load Order

ALWAYS load in this exact order:

1. Bootstrap JS (CDN)
2. Chart.js (CDN)
3. utils.js → db.js → data-loader.js → data.js → app.js
4. Alpine.js (CDN, with `defer`)

## §4 Data Structure

```yaml
rawRecords[]:
  region: Branch name (厚木|横浜|高崎|春日部|つくば)
  projectName: Construction project name
  majorCode: Major work item code (e.g., "026")
  item: Item name
  spec: Specification
  unit: Unit of measure
  qty: Quantity
  price: Unit price (JPY)
  vendor: Vendor name
  orderDate: Order date (YYYYMMDD format)
  floors: Number of floors
  unitRow: Unit row count
  resUnits: Residential unit count
  constArea: Construction area (㎡)
  totalArea: Total floor area (㎡)
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

## §6 Key Functions

| Location       | Function               | Purpose                      |
| -------------- | ---------------------- | ---------------------------- |
| app.js         | appData()              | Main Alpine component        |
| app.js         | applyFilters()         | Filter records by criteria   |
| app.js         | showChart(idx)         | Display Chart.js price trend |
| utils.js       | formatNumber(n)        | Format number with locale    |
| utils.js       | getWeekNumber(dateStr) | Convert YYYYMMDD to ISO week |
| db.js          | VendorQuoteDB          | IndexedDB operations (IIFE)  |
| data-loader.js | DataLoader.loadData()  | Load data with cache control |

## §7 Data Loading (IndexedDB)

### §7.1 Loading Flow

```yaml
initial_access:
  - DataLoader.loadData() → IndexedDB empty → load from data.js
  - bulkAdd with version metadata → return to app.js

subsequent_access:
  - Version check → up_to_date → getAll from IndexedDB (fast)

data_update:
  - data.js deployed → version mismatch → clearRecords → bulkAdd
```

### §7.2 Adding New Fields

```yaml
simple_field:
  - data.js: Add field to rawRecords[]
  - db.js: No change (schemaless)
  - app.js: Use field as needed

searchable_field:
  - db.js: Add index in onupgradeneeded
  - db.js: Increment DB_VERSION
```

### §7.3 IndexedDB Indexes

```yaml
indexes: [region, vendor, item, majorCode, orderDate, item_spec (compound)]
```

## §8 Modification Procedures

### §8.1 Add Quote Records

1. Edit `js/data.js`
2. Append object with all fields (§4)
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
