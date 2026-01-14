/**
 * データ処理の純粋関数群
 * これらの関数は外部状態に依存せず、同じ入力に対して常に同じ出力を返す
 */

import { buildingColors } from "../../data/buildingColors.js";
import { workTypes } from "../../data/workTypes.js";
import { calculateArrayStats, normalizeCompanyName } from "../utils/utils.js";

/**
 * 案件データとアイテムレコードを統合してフラット化する
 * @param {Array} itemRecords - アイテムレコードの配列
 * @param {Array} projects - 案件データの配列
 * @returns {Array} フラット化されたアイテムデータ
 */
export function flattenData(itemRecords, projects) {
  return itemRecords.map((rec) => {
    const proj = projects.find((p) => p.id === rec.projectId);
    return {
      ...rec,
      projectName: proj.name,
      projectBuilding: proj.building,
      projectBuildingColor: buildingColors[proj.building],
      projectStructure: proj.structure,
      projectStructureCode: proj.structureCode,
      projectArea: proj.area,
      projectQuotationPeriodEnd: proj.quotationPeriodEnd,
      projectQuotationPeriodEndDate: proj.quotationPeriodEndDate,
      categoryName: workTypes[rec.workTypeId]?.name ?? rec.workTypeId,
      amount: rec.quantity * rec.price,
      netAmount: rec.quantity * rec.netPrice,
    };
  });
}

/**
 * アイテムデータを品目・仕様でグループ化する
 * @param {Array} items - フラット化されたアイテムデータ
 * @returns {Array} グループ化されたアイテムデータ
 */
export function groupByItem(items) {
  const groups = {};
  items.forEach((item) => {
    const key = `${item.itemName}|${item.spec}`;
    if (!groups[key]) {
      groups[key] = {
        itemName: item.itemName,
        spec: item.spec,
        unit: item.unit,
        records: [],
      };
    }
    groups[key].records.push(item);
  });

  return Object.values(groups).map((g) => {
    g.records.sort((a, b) => a.baseDate.localeCompare(b.baseDate));
    const netPrices = g.records.map((r) => r.netPrice);
    const stats = calculateArrayStats(netPrices);
    const types = [...new Set(g.records.map((r) => r.costType))];
    const categories = [...new Set(g.records.map((r) => r.categoryName))];

    return {
      ...g,
      recordCount: g.records.length,
      minNetPrice: stats.min,
      maxNetPrice: stats.max,
      avgNetPrice: stats.avg,
      types,
      categories,
    };
  });
}

/**
 * レコードの統計情報を計算する
 * @param {Array} records - レコードの配列
 * @returns {Object} 統計情報（用途カウント、構造カウント、平均面積）
 */
export function calculateStats(records) {
  const usageCount = {};
  const structureCount = {};
  let totalArea = 0;

  records.forEach((r) => {
    usageCount[r.projectBuilding] = (usageCount[r.projectBuilding] || 0) + 1;
    structureCount[r.projectStructureCode] =
      (structureCount[r.projectStructureCode] || 0) + 1;
    totalArea += r.projectArea;
  });

  return {
    usageCount,
    structureCount,
    avgArea: records.length > 0 ? Math.round(totalArea / records.length) : 0,
  };
}

/**
 * 協力会社別にレコードをグループ化する
 * @param {Array} records - レコードの配列
 * @returns {Object} 会社名をキーとした価格データのマッピング
 */
export function groupByCompany(records) {
  const companyData = {};
  records.forEach((r) => {
    const name = normalizeCompanyName(r.company);
    if (!companyData[name]) {
      companyData[name] = { prices: [], count: 0 };
    }
    companyData[name].prices.push(r.netPrice);
    companyData[name].count++;
  });
  return companyData;
}

/**
 * 会社データから価格統計を計算する
 * @param {Object} companyData - groupByCompanyの出力
 * @returns {Array} 会社名と価格統計の配列
 */
export function calculateCompanyStats(companyData) {
  return Object.entries(companyData).map(([name, data]) => {
    const stats = calculateArrayStats(data.prices);
    return {
      name,
      count: data.count,
      minPrice: stats.min,
      maxPrice: stats.max,
      avgPrice: stats.avg,
    };
  });
}
