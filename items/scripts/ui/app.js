/**
 * アプリケーションメインファイル
 * UI操作とビジネスロジックを統合
 */

import { costTypes } from "../../data/costTypes.js";
import { itemRecords } from "../../data/itemRecords.js";
import { projects } from "../../data/projects.js";
import {
  buildChartOptions,
  buildPeriodStatistics,
  buildStatisticsDatasets,
} from "../core/chartData.js";
import {
  calculateCompanyStats,
  flattenData,
  groupByCompany,
  groupByItem,
} from "../core/dataProcessor.js";
import {
  applyFilterCriteria,
  buildActiveFilterLabels,
} from "../core/filterLogic.js";
import { formatNumber } from "../utils/utils.js";

// アプリケーション状態
let allItems = [];
let groupedItems = [];
let filteredGroups = [];
let chartInstance = null;
let currentChartGroup = null;
let currentChartRecords = [];

/**
 * データを初期化
 */
function initializeData() {
  allItems = flattenData(itemRecords, projects);
  groupedItems = groupByItem(allItems);
}

/**
 * フィルタ条件をDOMから取得
 */
function getFilterCriteria() {
  const projectKeyword = document
    .getElementById("filterProject")
    .value.toLowerCase();
  const itemKeyword = document.getElementById("filterItem").value.toLowerCase();
  const category = document.getElementById("filterCategory").value;
  const usage = document.getElementById("filterUsage").value;
  const structures = Array.from(
    document.querySelectorAll(".filter-structure:checked")
  ).map((el) => el.value);
  const areaMin =
    parseFloat(document.getElementById("filterAreaMin").value) || 0;
  const areaMax =
    parseFloat(document.getElementById("filterAreaMax").value) || Infinity;
  const company = document.getElementById("filterCompany").value.toLowerCase();
  const dateFrom = document.getElementById("filterDateFrom").value;
  const dateTo = document.getElementById("filterDateTo").value;

  return {
    projectKeyword,
    itemKeyword,
    category,
    usage,
    structures,
    areaMin,
    areaMax,
    company,
    dateFrom,
    dateTo,
  };
}

/**
 * フィルタを適用
 */
export function applyFilters() {
  const criteria = getFilterCriteria();
  filteredGroups = applyFilterCriteria(groupedItems, criteria);
  renderResults();
  renderActiveFilters();
}

/**
 * フィルタをクリア
 */
export function clearFilters() {
  document.getElementById("filterProject").value = "";
  document.getElementById("filterItem").value = "";
  document.getElementById("filterCategory").value = "";
  document.getElementById("filterUsage").value = "";
  document
    .querySelectorAll(".filter-structure")
    .forEach((el) => (el.checked = false));
  document.getElementById("filterAreaMin").value = "";
  document.getElementById("filterAreaMax").value = "";
  document.getElementById("filterCompany").value = "";
  document.getElementById("filterDateFrom").value = "";
  document.getElementById("filterDateTo").value = "";
  filteredGroups = groupedItems
    .map((g) => ({
      ...g,
      filteredRecords: g.records,
    }))
    .sort((a, b) => b.filteredRecords.length - a.filteredRecords.length);
  renderResults();
  renderActiveFilters();
}

/**
 * アクティブフィルタを表示
 */
function renderActiveFilters() {
  const container = document.getElementById("activeFilters");
  const filterValues = {
    projectKeyword: document.getElementById("filterProject").value,
    usage: document.getElementById("filterUsage").value,
    structures: Array.from(
      document.querySelectorAll(".filter-structure:checked")
    ).map((el) => el.value),
    itemKeyword: document.getElementById("filterItem").value,
    category: document.getElementById("filterCategory").value,
    company: document.getElementById("filterCompany").value,
  };

  const filters = buildActiveFilterLabels(filterValues);

  container.innerHTML = filters.length
    ? '<small class="text-muted me-2">適用中:</small>' +
      filters
        .map((f) => `<span class="badge bg-secondary small">${f}</span>`)
        .join("")
    : '<small class="text-muted">絞り込み条件なし（全品目表示）</small>';
}

/**
 * 結果を表示
 */
function renderResults() {
  const container = document.getElementById("resultsContainer");
  if (!filteredGroups.length) {
    container.innerHTML = `
            <div class="text-center py-5">
                <svg width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" class="text-muted mb-3">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <p class="text-muted">検索条件に該当する品目がありません</p>
                <button class="btn btn-sm btn-outline-primary" onclick="clearFilters()">条件をクリア</button>
            </div>`;
    return;
  }

  container.innerHTML = `<div class="results-grid">${filteredGroups
    .map((g, idx) => renderGroupCard(g, idx))
    .join("")}</div>`;
}

/**
 * グループカードをレンダリング
 */
function renderGroupCard(g, idx) {
  const records = g.filteredRecords;
  const companyData = groupByCompany(records);
  const companyStats = calculateCompanyStats(companyData);

  return `
        <div class="card item-group-card shadow-sm" id="group-${idx}">
            <div class="card-body" onclick="toggleGroup(${idx})">
                <div class="d-flex justify-content-between align-items-start mb-3">
                    <div>
                        <h5 class="fw-bold mb-2">${g.name}${
    g.spec ? ` <span class="text-muted fw-normal">/ ${g.spec}</span>` : ""
  }</h5>
                        <div class="hstack gap-2 flex-wrap">
                            ${g.categories
                              .map(
                                (c) =>
                                  `<span class="badge bg-secondary small">${c}</span>`
                              )
                              .join("")}
                            ${g.types
                              .map(
                                (t) =>
                                  `<span class="badge bg-${costTypes[t].badge} small">${costTypes[t].name}</span>`
                              )
                              .join("")}
                            <span class="badge bg-info small">${
                              records.length
                            }件</span>
                        </div>
                    </div>
                    <div class="text-end">
                        <small class="text-muted d-block mb-1">NET単価レンジ</small>
                        <div class="fw-bold text-primary fs-5 tabular-nums">¥${formatNumber(
                          g.minNetPrice
                        )} ~ ¥${formatNumber(g.maxNetPrice)}</div>
                    </div>
                </div>

                <div class="bg-white rounded-3 border overflow-hidden mb-3">
                    <div class="p-2 d-flex align-items-center gap-2 cursor-pointer border-bottom" onclick="event.stopPropagation(); toggleVendorSection(${idx})">
                        <svg class="vendor-chevron transition-transform" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                        </svg>
                        <span class="small fw-semibold text-secondary">業者別 NET単価レンジ（/${
                          g.unit
                        }）</span>
                        <span class="badge bg-secondary rounded-pill small ms-auto">${
                          companyStats.length
                        }社</span>
                    </div>
                    <div class="vendor-section-content transition-collapse collapse-hidden p-2 p-md-3" id="vendorSection-${idx}">
                        <div class="d-flex flex-column gap-2">
                            ${companyStats
                              .map(
                                (stat) => `
                            <div class="company-summary-item py-1 px-2 bg-light rounded border">
                                <div class="d-flex align-items-center gap-2">
                                    <span class="fw-semibold small text-dark company-name">${
                                      stat.name
                                    }</span>
                                    <span class="badge bg-secondary rounded-pill small flex-shrink-0">${
                                      stat.count
                                    }件</span>
                                </div>
                                <div class="d-flex align-items-center gap-3 mt-1">
                                    <span class="small"><span class="text-secondary">最小</span> <span class="fw-semibold tabular-nums company-price-value min">¥${formatNumber(
                                      stat.minPrice
                                    )}</span></span>
                                    <span class="small"><span class="text-secondary">平均</span> <span class="fw-semibold tabular-nums text-dark">¥${formatNumber(
                                      stat.avgPrice
                                    )}</span></span>
                                    <span class="small"><span class="text-secondary">最大</span> <span class="fw-semibold tabular-nums company-price-value max">¥${formatNumber(
                                      stat.maxPrice
                                    )}</span></span>
                                </div>
                            </div>`
                              )
                              .join("")}
                        </div>
                    </div>
                </div>

                <div class="d-flex justify-content-center gap-2 align-items-center flex-wrap">
                    <button class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
                        </svg>
                        <span class="d-none d-sm-inline">時系列一覧</span>
                        <span class="d-inline d-sm-none">時系列</span>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1" onclick="event.stopPropagation(); showChart(${idx})">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                        </svg>
                        <span class="d-none d-sm-inline">NET単価推移</span>
                        <span class="d-inline d-sm-none">推移</span>
                    </button>
                </div>
            </div>

            <div class="collapse border-top" id="groupDetail-${idx}">
                <div class="card-body bg-light">
                    <h6 class="fw-bold text-secondary mb-3">
                        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:-2px">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                        見積詳細（見積期間終了の時系列）
                    </h6>
                    <div class="timeline-container">
                        ${records
                          .sort((a, b) =>
                            a.projectQuotationPeriodEnd.localeCompare(
                              b.projectQuotationPeriodEnd
                            )
                          )
                          .map((r) => {
                            const [year, month] =
                              r.projectQuotationPeriodEnd.split("-");
                            return `
                            <div class="timeline-item">
                                <div class="timeline-date">
                                    <span class="year">${year}</span>
                                    <span class="month">${parseInt(
                                      month
                                    )}月</span>
                                </div>
                                <div class="timeline-dot"></div>
                                <div class="timeline-content">
                                    <div class="project-header">
                                        <div class="flex-grow-1">
                                            <div class="project-badges">
                                                <span class="badge bg-${
                                                  r.projectBuildingColor
                                                }">${r.projectBuilding}</span>
                                                <span class="badge bg-secondary">${
                                                  r.projectStructure
                                                }</span>
                                                <span class="badge bg-light text-dark">${formatNumber(
                                                  r.projectArea
                                                )} ㎡</span>
                                            </div>
                                            <div class="project-name">${
                                              r.projectName
                                            }</div>
                                        </div>
                                        <div class="price-display">
                                            <div class="price-main tabular-nums">¥${formatNumber(
                                              r.netUnitPrice
                                            )}</div>
                                            <div class="price-sub">NET率 ${r.netRate.toFixed(
                                              3
                                            )}</div>
                                        </div>
                                    </div>
                                    <div class="detail-grid">
                                        <div class="detail-item">
                                            <div class="detail-label">協力会社</div>
                                            <div class="detail-value">${
                                              r.supplierName
                                            }</div>
                                        </div>
                                        <div class="detail-item">
                                            <div class="detail-label">数量</div>
                                            <div class="detail-value tabular-nums">${formatNumber(
                                              r.quantity
                                            )} ${r.unit}</div>
                                        </div>
                                        <div class="detail-item">
                                            <div class="detail-label">見積単価</div>
                                            <div class="detail-value tabular-nums">¥${formatNumber(
                                              r.unitPrice
                                            )}</div>
                                        </div>
                                        <div class="detail-item">
                                            <div class="detail-label">見積金額</div>
                                            <div class="detail-value tabular-nums">¥${formatNumber(
                                              r.amount
                                            )}</div>
                                        </div>
                                        <div class="detail-item">
                                            <div class="detail-label">NET金額</div>
                                            <div class="detail-value tabular-nums highlight">¥${formatNumber(
                                              Math.round(r.netAmount)
                                            )}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>`;
                          })
                          .join("")}
                    </div>
                    <div class="text-center mt-3 pt-3 border-top" onclick="event.stopPropagation(); toggleGroup(${idx})" style="cursor:pointer">
                        <small class="text-muted">
                            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:-3px">
                                <polyline points="18 15 12 9 6 15"/>
                            </svg>
                            クリックして閉じる
                        </small>
                    </div>
                </div>
            </div>
        </div>`;
}

/**
 * グループの展開/折りたたみ
 */
export function toggleGroup(idx) {
  const detail = document.getElementById(`groupDetail-${idx}`);
  const card = document.getElementById(`group-${idx}`);
  detail.classList.toggle("show");
  card.classList.toggle("expanded");
}

/**
 * 協力会社セクションの展開/折りたたみ
 */
export function toggleVendorSection(idx) {
  const section = document.getElementById(`vendorSection-${idx}`);
  const header = section.previousElementSibling;
  const chevron = header.querySelector(".vendor-chevron");

  if (section.classList.contains("collapse-hidden")) {
    section.classList.remove("collapse-hidden");
    section.classList.add("collapse-shown");
    chevron.classList.add("rotate-90");
  } else {
    section.classList.remove("collapse-shown");
    section.classList.add("collapse-hidden");
    chevron.classList.remove("rotate-90");
  }
}

/**
 * 統計情報を計算
 */
function calculateStats(records) {
  if (!records.length) {
    return { count: 0, min: 0, max: 0, avg: 0, median: 0 };
  }
  const prices = records.map((r) => r.netUnitPrice).sort((a, b) => a - b);
  const count = prices.length;
  const min = prices[0];
  const max = prices[count - 1];
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / count);
  const median =
    count % 2 === 0
      ? Math.round((prices[count / 2 - 1] + prices[count / 2]) / 2)
      : prices[Math.floor(count / 2)];
  return { count, min, max, avg, median };
}

/**
 * 時間軸に基づいてラベルをフォーマット
 */
function formatPeriodByTimeUnit(period, timeUnit) {
  const [year, month, day] = period.split("-");
  switch (timeUnit) {
    case "yearly":
      return year;
    case "monthly":
      return `${year}-${month}`;
    case "weekly":
      const date = new Date(period);
      const dayOfWeek = date.getDay(); // 0=日曜日, 1=月曜日, ...
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 月曜日までの日数差
      const monday = new Date(date);
      monday.setDate(date.getDate() + diff);
      const weekYear = monday.getFullYear();
      const weekMonth = String(monday.getMonth() + 1).padStart(2, "0");
      const weekDay = String(monday.getDate()).padStart(2, "0");
      return `${weekYear}-${weekMonth}-${weekDay}`;
    case "daily":
    default:
      return period;
  }
}

/**
 * グループ化テーブルをレンダリング
 */
function renderGroupedTables(groupedData) {
  const container = document.getElementById("groupedTablesContainer");

  if (!groupedData.length) {
    container.innerHTML = `
      <div class="text-center py-5 text-muted">
        <p>データがありません</p>
      </div>`;
    return;
  }

  container.innerHTML = groupedData
    .map(
      (group) => `
      <div class="mb-4">
        <!-- Group Header -->
        <div class="d-flex flex-column flex-md-row align-items-start align-items-md-center gap-2 mb-2 pb-2 border-bottom">
          <div class="d-flex align-items-center gap-2">
            <h6 class="fw-bold mb-0">${group.period}</h6>
            <span class="badge bg-secondary">${group.count}件</span>
          </div>
          <div class="ms-0 ms-md-auto small d-flex flex-wrap gap-2 gap-md-3">
            <span class="text-success">
              <span class="d-none d-sm-inline">最小:</span>
              <span class="d-inline d-sm-none">小:</span>
              <span class="fw-semibold">¥${formatNumber(group.minPrice)}</span>
            </span>
            <span class="text-muted d-none d-md-inline">|</span>
            <span class="text-primary">
              <span class="d-none d-sm-inline">平均:</span>
              <span class="d-inline d-sm-none">均:</span>
              <span class="fw-semibold">¥${formatNumber(group.avgPrice)}</span>
            </span>
            <span class="text-muted d-none d-md-inline">|</span>
            <span class="text-warning">
              <span class="d-none d-sm-inline">中央値:</span>
              <span class="d-inline d-sm-none">央:</span>
              <span class="fw-semibold">¥${formatNumber(
                group.medianPrice
              )}</span>
            </span>
            <span class="text-muted d-none d-md-inline">|</span>
            <span class="text-danger">
              <span class="d-none d-sm-inline">最大:</span>
              <span class="d-inline d-sm-none">大:</span>
              <span class="fw-semibold">¥${formatNumber(group.maxPrice)}</span>
            </span>
          </div>
        </div>
        <!-- Group Table -->
        <div class="card shadow-sm">
          <div class="table-responsive">
            <table class="table table-sm table-bordered table-hover mb-0" style="min-width: 1200px; table-layout: fixed;">
              <thead class="table-light">
                <tr>
                  <th style="width: 180px">案件名</th>
                  <th style="width: 80px">工種名</th>
                  <th style="width: 120px">協力会社名</th>
                  <th style="width: 150px">品目名称</th>
                  <th class="text-end" style="width: 70px">数量</th>
                  <th class="text-center" style="width: 50px">単位</th>
                  <th class="text-end" style="width: 70px">NET率</th>
                  <th class="text-end" style="width: 90px">NET単価</th>
                  <th class="text-end" style="width: 100px">NET金額</th>
                  <th class="text-center" style="width: 70px">用途</th>
                  <th class="text-end" style="width: 90px">延床面積</th>
                  <th class="text-center" style="width: 100px">見積日付</th>
                </tr>
              </thead>
              <tbody>
                ${group.records
                  .sort((a, b) => a.baseDate.localeCompare(b.baseDate))
                  .map(
                    (r) => `
                  <tr>
                    <td class="text-truncate" title="${r.projectName}">${
                      r.projectName
                    }</td>
                    <td>${r.categoryName}</td>
                    <td class="text-truncate" title="${r.supplierName}">${
                      r.supplierName
                    }</td>
                    <td class="text-truncate" title="${r.name}${
                      r.spec ? ` / ${r.spec}` : ""
                    }">${r.name}${r.spec ? ` / ${r.spec}` : ""}</td>
                    <td class="text-end tabular-nums">${formatNumber(
                      r.quantity
                    )}</td>
                    <td class="text-center">${r.unit}</td>
                    <td class="text-end tabular-nums">${r.netRate.toFixed(
                      3
                    )}</td>
                    <td class="text-end tabular-nums">¥${formatNumber(
                      r.netUnitPrice
                    )}</td>
                    <td class="text-end tabular-nums">¥${formatNumber(
                      Math.round(r.netAmount)
                    )}</td>
                    <td class="text-center"><span class="badge bg-${
                      r.projectBuildingColor
                    }">${r.projectBuilding}</span></td>
                    <td class="text-end tabular-nums">${formatNumber(
                      r.projectArea
                    )} ㎡</td>
                    <td class="text-center">${r.baseDate}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `
    )
    .join("");
}

/**
 * 表示モードを更新
 */
function updateDisplayMode() {
  const displayMode = document.getElementById("chartDisplayMode").value;
  const chartSection = document.getElementById("chartSection");
  const tableSection = document.getElementById("tableSection");

  if (displayMode === "line") {
    chartSection.style.display = "block";
    tableSection.style.display = "none";
  } else {
    chartSection.style.display = "none";
    tableSection.style.display = "block";
  }
}

/**
 * フィルタ適用後のチャートを更新
 */
function updateChartWithFilters() {
  if (!currentChartGroup) return;

  const dateFrom = document.getElementById("chartDateFrom").value;
  const dateTo = document.getElementById("chartDateTo").value;
  const timeUnit = document.getElementById("chartTimeUnit").value;

  // 表示モードを更新
  updateDisplayMode();

  // フィルタリング（単価基準日ベース）
  let records = currentChartRecords.filter((r) => {
    if (dateFrom && r.baseDate < dateFrom) return false;
    if (dateTo && r.baseDate > dateTo) return false;
    return true;
  });

  // 統計情報を更新
  const stats = calculateStats(records);
  document.getElementById("chartRecordCount").textContent = `${stats.count}件`;
  document.getElementById("chartMinPrice").textContent = `¥${formatNumber(
    stats.min
  )}`;
  document.getElementById("chartAvgPrice").textContent = `¥${formatNumber(
    stats.avg
  )}`;
  document.getElementById("chartMedianPrice").textContent = `¥${formatNumber(
    stats.median
  )}`;
  document.getElementById("chartMaxPrice").textContent = `¥${formatNumber(
    stats.max
  )}`;

  // 時間軸でグルーピング（単価基準日ベース）
  const groupedByPeriod = {};
  records.forEach((r) => {
    const periodKey = formatPeriodByTimeUnit(r.baseDate, timeUnit);
    if (!groupedByPeriod[periodKey]) {
      groupedByPeriod[periodKey] = [];
    }
    groupedByPeriod[periodKey].push(r);
  });

  // グループ化テーブルデータを生成
  const sortedPeriods = Object.keys(groupedByPeriod).sort();
  const groupedTableData = sortedPeriods.map((period) => {
    const periodRecords = groupedByPeriod[period];
    const periodStats = calculateStats(periodRecords);
    return {
      period,
      count: periodRecords.length,
      minPrice: periodStats.min,
      maxPrice: periodStats.max,
      avgPrice: periodStats.avg,
      medianPrice: periodStats.median,
      records: periodRecords,
    };
  });

  // グループ化テーブルをレンダリング
  renderGroupedTables(groupedTableData);

  // チャート更新
  const ctx = document.getElementById("netPriceChart").getContext("2d");

  if (chartInstance) {
    chartInstance.destroy();
  }

  // 時間軸ごとの統計データを生成（平均、中央値、最小、最大）
  const periodStats = buildPeriodStatistics(groupedByPeriod);
  const datasets = buildStatisticsDatasets(periodStats);

  // レスポンシブ設定の判定
  const isMobile = window.innerWidth < 768;
  const isSmallMobile = window.innerWidth < 576;

  const options = buildChartOptions(
    isMobile,
    isSmallMobile,
    currentChartGroup.unit,
    formatNumber
  );

  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: periodStats.periods,
      datasets: datasets,
    },
    options: options,
  });
}

/**
 * チャートフィルタをクリア
 */
function clearChartFilters() {
  // 日付はデータの範囲を初期値に設定
  const dates = currentChartRecords.map((r) => r.baseDate).sort();
  const minDate = dates[0] || "";
  const maxDate = dates[dates.length - 1] || "";
  document.getElementById("chartDateFrom").value = minDate;
  document.getElementById("chartDateTo").value = maxDate;
  document.getElementById("chartTimeUnit").value = "monthly";
  document.getElementById("chartDisplayMode").value = "line";
  updateChartWithFilters();
}

/**
 * チャートを表示
 */
export function showChart(idx) {
  const group = filteredGroups[idx];
  const records = group.filteredRecords;

  // 状態を保存
  currentChartGroup = group;
  currentChartRecords = [...records];

  // タイトル設定
  document.getElementById(
    "chartModalTitle"
  ).textContent = `NET単価推移 - ${group.name}`;
  document.getElementById("chartItemName").textContent =
    group.name + (group.spec ? ` / ${group.spec}` : "");
  document.getElementById("chartUnit").textContent = group.unit;

  // フィルタをリセット（日付はデータの範囲を初期値に設定）
  const dates = records.map((r) => r.baseDate).sort();
  const minDate = dates[0] || "";
  const maxDate = dates[dates.length - 1] || "";
  document.getElementById("chartDateFrom").value = minDate;
  document.getElementById("chartDateTo").value = maxDate;
  document.getElementById("chartTimeUnit").value = "monthly";
  document.getElementById("chartDisplayMode").value = "line";

  // 初回描画
  updateChartWithFilters();

  const modal = new bootstrap.Modal(document.getElementById("chartModal"));
  modal.show();
}

/**
 * チャートフィルタのイベントリスナーを設定
 */
function setupChartFilterListeners() {
  document
    .getElementById("chartDateFrom")
    .addEventListener("change", updateChartWithFilters);
  document
    .getElementById("chartDateTo")
    .addEventListener("change", updateChartWithFilters);
  document
    .getElementById("chartTimeUnit")
    .addEventListener("change", updateChartWithFilters);
  document
    .getElementById("chartDisplayMode")
    .addEventListener("change", updateChartWithFilters);
  document
    .getElementById("chartClearFilters")
    .addEventListener("click", clearChartFilters);
}

// 初期化実行
initializeData();
clearFilters();
setupChartFilterListeners();

// グローバルスコープに公開
window.applyFilters = applyFilters;
window.clearFilters = clearFilters;
window.toggleGroup = toggleGroup;
window.toggleVendorSection = toggleVendorSection;
window.showChart = showChart;
