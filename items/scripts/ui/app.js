/**
 * アプリケーションメインファイル
 * UI操作とビジネスロジックを統合
 */

import { projects } from "../../data/projects.js";
import { itemRecords } from "../../data/itemRecords.js";
import { catNames, typeNames, typeBadges } from "../../data/constants.js";
import { fmt, getCompanyColor } from "../utils/utils.js";
import {
  flattenData,
  groupByItem,
  groupByCompany,
  calculateCompanyStats,
} from "../core/dataProcessor.js";
import {
  applyFilterCriteria,
  buildActiveFilterLabels,
} from "../core/filterLogic.js";
import {
  buildChartDatasets,
  buildPeriodLabels,
  buildChartOptions,
} from "../core/chartData.js";

// アプリケーション状態
let allItems = [];
let groupedItems = [];
let filteredGroups = [];
let chartInstance = null;

/**
 * データを初期化
 */
function initializeData() {
  allItems = flattenData(itemRecords, projects, catNames);
  groupedItems = groupByItem(allItems);
}

/**
 * フィルタ条件をDOMから取得
 */
function getFilterCriteria() {
  const projectKeyword = document
    .getElementById("filterProject")
    .value.toLowerCase();
  const itemKeyword = document
    .getElementById("filterItem")
    .value.toLowerCase();
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
  filteredGroups = groupedItems.map((g) => ({
    ...g,
    filteredRecords: g.records,
  }));
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

  const filters = buildActiveFilterLabels(filterValues, catNames);

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
                        <h5 class="fw-bold mb-2">${g.item}${
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
                                  `<span class="badge bg-${typeBadges[t]} small">${typeNames[t]}</span>`
                              )
                              .join("")}
                        </div>
                    </div>
                    <div class="text-end">
                        <small class="text-muted d-block mb-1">NET単価レンジ</small>
                        <div class="fw-bold text-primary fs-5 tabular-nums">¥${fmt(
                          g.minNetPrice
                        )} ~ ¥${fmt(g.maxNetPrice)}</div>
                    </div>
                </div>

                <div class="vendor-section border rounded mb-3">
                    <div class="vendor-section-header d-flex align-items-center gap-2 p-2 bg-light" onclick="event.stopPropagation(); toggleVendorSection(${idx})">
                        <svg class="vendor-chevron" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                        </svg>
                        <span class="small fw-semibold text-secondary">業者別 NET単価レンジ（/${g.unit}）</span>
                        <span class="badge bg-secondary rounded-pill small ms-auto">${companyStats.length}社</span>
                    </div>
                    <div class="vendor-section-content transition-collapse collapse-hidden" id="vendorSection-${idx}">
                        <div class="d-flex flex-column gap-2 p-2 p-md-3">
                            ${companyStats
                              .map(
                                (stat) => `
                            <div class="company-summary-item d-flex flex-column flex-sm-row align-items-start align-items-sm-center gap-2 p-2 bg-light rounded border">
                                <div class="company-header d-flex align-items-center gap-2 w-100 w-sm-auto">
                                    <span class="fw-semibold small text-dark">${stat.name}</span>
                                    <span class="badge bg-secondary rounded-pill small">${stat.count}件</span>
                                </div>
                                <div class="company-prices d-flex align-items-center gap-2 gap-sm-3 ms-0 ms-sm-auto w-100 w-sm-auto flex-wrap">
                                    <div class="d-flex align-items-baseline gap-1">
                                        <span class="small text-secondary">最小</span>
                                        <span class="small fw-semibold tabular-nums company-price-value min">¥${fmt(stat.minPrice)}</span>
                                    </div>
                                    <div class="d-flex align-items-baseline gap-1">
                                        <span class="small text-secondary">平均</span>
                                        <span class="small fw-semibold tabular-nums text-dark">¥${fmt(stat.avgPrice)}</span>
                                    </div>
                                    <div class="d-flex align-items-baseline gap-1">
                                        <span class="small text-secondary">最大</span>
                                        <span class="small fw-semibold tabular-nums company-price-value max">¥${fmt(stat.maxPrice)}</span>
                                    </div>
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
                          .map((r) => {
                            const [year, month] = r.projectPeriodStart.split(
                              "-"
                            );
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
                                                  r.projectTypeColor
                                                }">${r.projectType}</span>
                                                <span class="badge bg-secondary">${
                                                  r.projectStructure
                                                }</span>
                                                <span class="badge bg-light text-dark">${fmt(
                                                  r.projectArea
                                                )} ㎡</span>
                                            </div>
                                            <div class="project-name">${
                                              r.projectName
                                            }</div>
                                        </div>
                                        <div class="price-display">
                                            <div class="price-main tabular-nums">¥${fmt(
                                              r.netPrice
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
                                              r.company
                                            }</div>
                                        </div>
                                        <div class="detail-item">
                                            <div class="detail-label">数量</div>
                                            <div class="detail-value tabular-nums">${fmt(
                                              r.qty
                                            )} ${r.unit}</div>
                                        </div>
                                        <div class="detail-item">
                                            <div class="detail-label">見積単価</div>
                                            <div class="detail-value tabular-nums">¥${fmt(
                                              r.price
                                            )}</div>
                                        </div>
                                        <div class="detail-item">
                                            <div class="detail-label">見積金額</div>
                                            <div class="detail-value tabular-nums">¥${fmt(
                                              r.amount
                                            )}</div>
                                        </div>
                                        <div class="detail-item">
                                            <div class="detail-label">NET金額</div>
                                            <div class="detail-value tabular-nums highlight">¥${fmt(
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
    chevron.classList.add("rotated");
  } else {
    section.classList.remove("collapse-shown");
    section.classList.add("collapse-hidden");
    chevron.classList.remove("rotated");
  }
}

/**
 * チャートを表示
 */
export function showChart(idx) {
  const group = filteredGroups[idx];
  const records = group.filteredRecords;

  document.getElementById(
    "chartModalTitle"
  ).textContent = `NET単価推移 - ${group.item}`;
  document.getElementById("chartItemName").textContent =
    group.item + (group.spec ? ` / ${group.spec}` : "");
  document.getElementById("chartUnit").textContent = group.unit;

  // テーブルデータ作成
  const tbody = document.querySelector("#chartDataTable tbody");
  tbody.innerHTML = records
    .map(
      (r) => `
        <tr>
            <td>${r.projectPeriodStart}</td>
            <td>${r.projectName}</td>
            <td>${r.company}</td>
            <td class="text-end tabular-nums">¥${fmt(r.netPrice)}</td>
            <td class="text-end tabular-nums">${r.netRate.toFixed(3)}</td>
        </tr>
    `
    )
    .join("");

  // チャート作成
  const ctx = document.getElementById("netPriceChart").getContext("2d");

  if (chartInstance) {
    chartInstance.destroy();
  }

  const datasets = buildChartDatasets(records, getCompanyColor);
  const allPeriods = buildPeriodLabels(records);

  // レスポンシブ設定の判定
  const isMobile = window.innerWidth < 768;
  const isSmallMobile = window.innerWidth < 576;

  const options = buildChartOptions(isMobile, isSmallMobile, group.unit, fmt);

  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: allPeriods,
      datasets: datasets,
    },
    options: options,
  });

  const modal = new bootstrap.Modal(document.getElementById("chartModal"));
  modal.show();
}

// 初期化実行
initializeData();
clearFilters();

// グローバルスコープに公開
window.applyFilters = applyFilters;
window.clearFilters = clearFilters;
window.toggleGroup = toggleGroup;
window.toggleVendorSection = toggleVendorSection;
window.showChart = showChart;
