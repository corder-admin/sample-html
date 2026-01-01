/**
 * Record Factories
 *
 * TSVレコード関連のテストデータ生成ファクトリ
 */
import * as Factory from "factory.ts";
import { createFactoryWrapper } from "./base.factory";
import type { RawTsvRecord } from "../../src/types/raw";
import type { CleanedRecord } from "../../src/types/clean";

// ============================================
// RawTsvRecord Factory
// ============================================

/**
 * ベースファクトリ: TSV生データレコード
 */
const rawTsvRecordBaseFactory = Factory.Sync.makeFactory<RawTsvRecord>({
  施工支店ＣＤ: "001",
  施工支店名: "厚木",
  契約支店ＣＤ: "001",
  契約支店名: "厚木",
  受注ｺｰﾄﾞ: "A001",
  追加コード: "00",
  棟番号: "01",
  工事名称: "テスト工事",
  予算区分: "本体",
  予算入力区分: "通常",
  "大工事項目ｺｰﾄﾞ": "026",
  "小工事項目ｺｰﾄﾞ": "001",
  工事細目連番: "001",
  小工事項目名称: "外壁工事",
  摘要: "サイディング",
  摘要_2: "",
  単位: "㎡",
  目標数量: "100",
  目標単価: "5,000",
  目標予算金額: "500,000",
  実行数量: "100",
  実行単価: "4,500",
  実行予算金額: "450,000",
  工事注文書番号: "PO001",
  工事注文書枝番: "01",
  業者基本コード: "V001",
  業者明細コード: "01",
  "業者名（漢字）": "テスト建設株式会社",
  発注日: "20240101",
  原契約年月日: "20231201",
  外構着工完了日: "",
  "着工完了日 （最早の棟の本体着工日）": "20240115",
  "確認許可完了日 （最遅の棟の完了日）": "20240630",
  完工予定日: "20240630",
  完成引渡日: "",
  実行予算当初承認日: "20231215",
  実行予算表紙現状承認日: "20231220",
  外構実行予算表紙現状承認日: "",
  構造区分: "木造",
  "標準・特注区分": "標準",
  商品名称コード: "P001",
  商品コード枝番: "01",
  商品形式連番: "001",
  商品名称: "テスト商品",
  グレード名称: "スタンダード",
  地上階数: "2",
  戸並び: "1",
  事業用戸数: "0",
  居住用戸数: "1",
  施工面積: "100.50",
  延床面積: "120.75",
});

/**
 * RawTsvRecord ファクトリ（標準）
 */
export const RawTsvRecordFactory = createFactoryWrapper(rawTsvRecordBaseFactory);

/**
 * 派生ファクトリ: 数量ゼロのレコード（除外対象）
 */
const zeroQuantityFactory = rawTsvRecordBaseFactory.extend({
  実行数量: "0",
});
export const ZeroQuantityRecordFactory = createFactoryWrapper(zeroQuantityFactory);

/**
 * 派生ファクトリ: 業者なしのレコード（除外対象）
 */
const noVendorFactory = rawTsvRecordBaseFactory.extend({
  "業者名（漢字）": "",
  業者基本コード: "",
});
export const NoVendorRecordFactory = createFactoryWrapper(noVendorFactory);

/**
 * 派生ファクトリ: 無効な発注日のレコード（除外対象）
 */
const invalidDateFactory = rawTsvRecordBaseFactory.extend({
  発注日: "invalid",
});
export const InvalidDateRecordFactory = createFactoryWrapper(invalidDateFactory);

/**
 * 派生ファクトリ: 発注日がゼロのレコード（除外対象）
 */
const zeroDateFactory = rawTsvRecordBaseFactory.extend({
  発注日: "0",
});
export const ZeroDateRecordFactory = createFactoryWrapper(zeroDateFactory);

/**
 * 派生ファクトリ: 単価ゼロのレコード
 */
const zeroPriceFactory = rawTsvRecordBaseFactory.extend({
  実行単価: "0",
});
export const ZeroPriceRecordFactory = createFactoryWrapper(zeroPriceFactory);

/**
 * 派生ファクトリ: NULLの業者コード（除外対象）
 */
const nullVendorCodeFactory = rawTsvRecordBaseFactory.extend({
  業者基本コード: "NULL",
});
export const NullVendorCodeRecordFactory = createFactoryWrapper(nullVendorCodeFactory);

// ============================================
// CleanedRecord Factory
// ============================================

/**
 * ベースファクトリ: クレンジング済みレコード
 */
const cleanedRecordBaseFactory = Factory.Sync.makeFactory<CleanedRecord>({
  region: "厚木",
  projectName: "テスト工事",
  majorCode: "026",
  item: "外壁工事",
  spec: "サイディング",
  unit: "㎡",
  qty: 100,
  price: 4500,
  vendor: "テスト建設株式会社",
  orderDate: "20240101",
  floors: 2,
  unitRow: 1,
  resUnits: 1,
  constArea: 100.5,
  totalArea: 120.75,
});

/**
 * CleanedRecord ファクトリ（標準）
 */
export const CleanedRecordFactory = createFactoryWrapper(cleanedRecordBaseFactory);
