/**
 * Base Factory
 *
 * factory.tsを使用したテストデータ生成の共通基盤
 * - 型安全なRowValues変換
 * - ファクトリ管理のオブジェクトリテラルパターン
 */
import type { RecPartial } from "factory.ts/lib/shared";

/**
 * 全フィールドにデフォルト値があるファクトリのインターフェース
 * factory.tsのFactory<T, keyof T>と互換
 */
interface CompleteFactory<T> {
  build(item?: RecPartial<T>): T;
  buildList(count: number, item?: RecPartial<T>): T[];
  resetSequenceNumber(newSequenceNumber?: number): void;
  // extend()の戻り値はfactory.tsの内部型を含むため、このインターフェース自体を返す
  extend(def: RecPartial<unknown>): CompleteFactory<T>;
}

/**
 * 行配列変換用のフィールド順序定義
 */
export type FieldOrder<T> = ReadonlyArray<keyof T>;

/**
 * オブジェクトを行配列に変換
 * @param data 変換対象オブジェクト
 * @param fieldOrder フィールド順序
 */
export const toRowValues = <T>(data: T, fieldOrder: FieldOrder<T>): unknown[] =>
  fieldOrder.map((key) => data[key]);

/**
 * ファクトリラッパー作成
 *
 * factory.tsのファクトリをオブジェクトリテラルパターンでラップ
 * プロジェクト規約に準拠したインターフェース提供
 *
 * 注: 全フィールドにデフォルト値があるファクトリ（makeFactoryで作成）専用
 */
export const createFactoryWrapper = <T, R = T>(
  factory: CompleteFactory<T>,
  transform?: (data: T) => R
) => {
  const build = (overrides?: RecPartial<T>): R => {
    const data = factory.build(overrides);
    return transform ? transform(data) : (data as unknown as R);
  };

  const buildList = (count: number, overrides?: RecPartial<T>): R[] =>
    Array.from({ length: count }, () => build(overrides));

  const resetSequenceNumber = (): void => {
    factory.resetSequenceNumber();
  };

  return {
    build,
    buildList,
    resetSequenceNumber,
    /** 派生バリエーション作成用に内部ファクトリを公開 */
    _factory: factory,
  } as const;
};

/**
 * 行配列ファクトリラッパー作成
 *
 * オブジェクトファクトリから行配列を生成するラッパー
 */
export const createRowValuesWrapper = <T>(
  factory: CompleteFactory<T>,
  fieldOrder: FieldOrder<T>
) => createFactoryWrapper(factory, (data) => toRowValues(data, fieldOrder));

/**
 * 複数ファクトリのシーケンスリセット
 */
export const resetAllFactories = (
  ...wrappers: Array<{ resetSequenceNumber: () => void }>
): void => {
  wrappers.forEach((w) => w.resetSequenceNumber());
};

/**
 * Map<number, string>からFieldOrder配列を生成
 *
 * proposalMapなどのカラム定義Mapから、行配列変換用のフィールド順序を生成
 * @param propMap 列番号→フィールド名のMap
 * @returns フィールド名の配列（列番号順）
 */
export const mapToFieldOrder = <T>(
  propMap: Map<number, keyof T & string>
): FieldOrder<T> => {
  const entries = Array.from(propMap.entries());
  entries.sort((a, b) => a[0] - b[0]);
  return entries.map(([, fieldName]) => fieldName) as FieldOrder<T>;
};
