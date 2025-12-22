/**
 * フィルタリングロジックの純粋関数群
 */

/**
 * 1つのレコードが検索条件に合致するか判定する
 * @param {Object} record - レコードオブジェクト
 * @param {Object} criteria - 検索条件
 * @returns {boolean} 条件に合致する場合true
 */
export function matchesRecordCriteria(record, criteria) {
  const {
    projectKeyword,
    usage,
    structures,
    areaMin,
    areaMax,
    company,
    dateFrom,
    dateTo,
  } = criteria;

  if (
    projectKeyword &&
    !record.projectName.toLowerCase().includes(projectKeyword)
  ) {
    return false;
  }
  if (usage && record.projectType !== usage) {
    return false;
  }
  if (structures.length && !structures.includes(record.projectStructureCode)) {
    return false;
  }
  if (record.projectArea < areaMin || record.projectArea > areaMax) {
    return false;
  }
  if (company && !record.company.toLowerCase().includes(company)) {
    return false;
  }
  if (dateFrom && record.projectDate < dateFrom) {
    return false;
  }
  if (dateTo && record.projectDate > dateTo) {
    return false;
  }
  return true;
}

/**
 * 1つのグループが品目検索条件に合致するか判定する
 * @param {Object} group - グループオブジェクト
 * @param {Object} criteria - 検索条件
 * @returns {boolean} 条件に合致する場合true
 */
export function matchesGroupCriteria(group, criteria) {
  const { itemKeyword, category } = criteria;

  if (
    itemKeyword &&
    !group.item.toLowerCase().includes(itemKeyword) &&
    !group.spec.toLowerCase().includes(itemKeyword)
  ) {
    return false;
  }
  if (category && !group.records.some((r) => r.categoryKey === category)) {
    return false;
  }
  return true;
}

/**
 * グループ化されたデータにフィルタを適用する
 * @param {Array} groupedItems - グループ化されたアイテムデータ
 * @param {Object} criteria - 検索条件
 * @returns {Array} フィルタリングされたグループ
 */
export function applyFilterCriteria(groupedItems, criteria) {
  return groupedItems
    .map((g) => {
      const matchingRecords = g.records.filter((r) =>
        matchesRecordCriteria(r, criteria)
      );
      return { ...g, filteredRecords: matchingRecords };
    })
    .filter((g) => {
      return (
        matchesGroupCriteria(g, criteria) && g.filteredRecords.length > 0
      );
    });
}

/**
 * アクティブなフィルタ条件をテキスト配列に変換する
 * @param {Object} filterValues - フィルタの値
 * @param {Object} catNames - カテゴリー名のマッピング
 * @returns {Array} フィルタ条件のテキスト配列
 */
export function buildActiveFilterLabels(filterValues, catNames) {
  const filters = [];
  const {
    projectKeyword,
    usage,
    structures,
    itemKeyword,
    category,
    company,
  } = filterValues;

  if (projectKeyword) filters.push(`案件名: ${projectKeyword}`);
  if (usage) filters.push(`建物用途: ${usage}`);
  if (structures.length) filters.push(`構造: ${structures.join(", ")}`);
  if (itemKeyword) filters.push(`品目: ${itemKeyword}`);
  if (category) filters.push(`工種: ${catNames[category]}`);
  if (company) filters.push(`協力会社: ${company}`);

  return filters;
}
