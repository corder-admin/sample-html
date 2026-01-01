/**
 * validators/rules.ts のテスト
 *
 * クレンジングルールの動作検証
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  isZeroQuantity,
  hasNoVendor,
  hasInvalidDate,
  isZeroPrice,
  checkExclusion,
  normalizeWhitespace,
  parseNumber,
  parseInteger,
} from "../../src/validators/rules";
import {
  RawTsvRecordFactory,
  ZeroQuantityRecordFactory,
  NoVendorRecordFactory,
  InvalidDateRecordFactory,
  ZeroDateRecordFactory,
  ZeroPriceRecordFactory,
  NullVendorCodeRecordFactory,
  resetAllFactories,
} from "../factories";

describe("validators/rules", () => {
  beforeEach(() => {
    // ファクトリのシーケンスをリセット
    resetAllFactories(
      RawTsvRecordFactory,
      ZeroQuantityRecordFactory,
      NoVendorRecordFactory,
      InvalidDateRecordFactory,
      ZeroDateRecordFactory,
      ZeroPriceRecordFactory,
      NullVendorCodeRecordFactory
    );
  });

  // ============================================
  // isZeroQuantity
  // ============================================
  describe("isZeroQuantity", () => {
    it("実行数量が正の値の場合、falseを返す", () => {
      // テストデータ: 標準レコード（実行数量=100）
      const record = RawTsvRecordFactory.build();

      // 検証: 除外対象ではない
      expect(isZeroQuantity(record)).toBe(false);
    });

    it("実行数量が0の場合、trueを返す", () => {
      // テストデータ: 数量ゼロのレコード
      const record = ZeroQuantityRecordFactory.build();

      // 検証: 除外対象である
      expect(isZeroQuantity(record)).toBe(true);
    });

    it("実行数量が空文字の場合、trueを返す", () => {
      // テストデータ: 実行数量が空
      const record = RawTsvRecordFactory.build({ 実行数量: "" });

      // 検証: 除外対象である
      expect(isZeroQuantity(record)).toBe(true);
    });

    it("実行数量がカンマ区切り数値の場合、正しくパースされる", () => {
      // テストデータ: カンマ区切りの大きな数値
      const record = RawTsvRecordFactory.build({ 実行数量: "1,000" });

      // 検証: 除外対象ではない
      expect(isZeroQuantity(record)).toBe(false);
    });
  });

  // ============================================
  // hasNoVendor
  // ============================================
  describe("hasNoVendor", () => {
    it("業者名がある場合、falseを返す", () => {
      // テストデータ: 標準レコード
      const record = RawTsvRecordFactory.build();

      // 検証: 除外対象ではない
      expect(hasNoVendor(record)).toBe(false);
    });

    it("業者名が空の場合、trueを返す", () => {
      // テストデータ: 業者なしレコード
      const record = NoVendorRecordFactory.build();

      // 検証: 除外対象である
      expect(hasNoVendor(record)).toBe(true);
    });

    it("業者基本コードがNULLの場合、trueを返す", () => {
      // テストデータ: 業者コードがNULL
      const record = NullVendorCodeRecordFactory.build();

      // 検証: 除外対象である
      expect(hasNoVendor(record)).toBe(true);
    });

    it("業者名がスペースのみの場合、trueを返す", () => {
      // テストデータ: 業者名がスペースのみ
      const record = RawTsvRecordFactory.build({
        "業者名（漢字）": "   ",
        業者基本コード: "",
      });

      // 検証: 除外対象である
      expect(hasNoVendor(record)).toBe(true);
    });
  });

  // ============================================
  // hasInvalidDate
  // ============================================
  describe("hasInvalidDate", () => {
    it("8桁の日付の場合、falseを返す", () => {
      // テストデータ: 標準レコード（YYYYMMDD形式）
      const record = RawTsvRecordFactory.build();

      // 検証: 除外対象ではない
      expect(hasInvalidDate(record)).toBe(false);
    });

    it("日付が無効な形式の場合、trueを返す", () => {
      // テストデータ: 無効な日付形式
      const record = InvalidDateRecordFactory.build();

      // 検証: 除外対象である
      expect(hasInvalidDate(record)).toBe(true);
    });

    it("日付が0の場合、trueを返す", () => {
      // テストデータ: 日付がゼロ
      const record = ZeroDateRecordFactory.build();

      // 検証: 除外対象である
      expect(hasInvalidDate(record)).toBe(true);
    });

    it("日付が空の場合、trueを返す", () => {
      // テストデータ: 日付が空
      const record = RawTsvRecordFactory.build({ 発注日: "" });

      // 検証: 除外対象である
      expect(hasInvalidDate(record)).toBe(true);
    });
  });

  // ============================================
  // isZeroPrice
  // ============================================
  describe("isZeroPrice", () => {
    it("実行単価が正の値の場合、falseを返す", () => {
      // テストデータ: 標準レコード
      const record = RawTsvRecordFactory.build();

      // 検証: 除外対象ではない
      expect(isZeroPrice(record)).toBe(false);
    });

    it("実行単価が0の場合、trueを返す", () => {
      // テストデータ: 単価ゼロのレコード
      const record = ZeroPriceRecordFactory.build();

      // 検証: 除外対象である
      expect(isZeroPrice(record)).toBe(true);
    });
  });

  // ============================================
  // checkExclusion
  // ============================================
  describe("checkExclusion", () => {
    it("正常なレコードの場合、excluded=falseを返す", () => {
      // テストデータ: 標準レコード
      const record = RawTsvRecordFactory.build();

      // 検証: 除外対象ではない
      const result = checkExclusion(record);
      expect(result.excluded).toBe(false);
      expect(result.reason).toBeUndefined();
    });

    it("数量ゼロの場合、ZERO_QUANTITY理由で除外", () => {
      // テストデータ: 数量ゼロのレコード
      const record = ZeroQuantityRecordFactory.build();

      // 検証: ZERO_QUANTITY理由で除外
      const result = checkExclusion(record);
      expect(result.excluded).toBe(true);
      expect(result.reason).toBe("ZERO_QUANTITY");
    });

    it("業者なしの場合、NO_VENDOR理由で除外", () => {
      // テストデータ: 業者なしのレコード
      const record = NoVendorRecordFactory.build();

      // 検証: NO_VENDOR理由で除外
      const result = checkExclusion(record);
      expect(result.excluded).toBe(true);
      expect(result.reason).toBe("NO_VENDOR");
    });

    it("無効な日付の場合、INVALID_DATE理由で除外", () => {
      // テストデータ: 無効な日付のレコード
      const record = InvalidDateRecordFactory.build();

      // 検証: INVALID_DATE理由で除外
      const result = checkExclusion(record);
      expect(result.excluded).toBe(true);
      expect(result.reason).toBe("INVALID_DATE");
    });

    it("複数の除外条件に該当する場合、優先順位に従って判定", () => {
      // テストデータ: 数量ゼロ + 業者なし（両方該当）
      const record = RawTsvRecordFactory.build({
        実行数量: "0",
        "業者名（漢字）": "",
        業者基本コード: "",
      });

      // 検証: ZERO_QUANTITYが優先される（先に判定されるため）
      const result = checkExclusion(record);
      expect(result.excluded).toBe(true);
      expect(result.reason).toBe("ZERO_QUANTITY");
    });
  });

  // ============================================
  // normalizeWhitespace
  // ============================================
  describe("normalizeWhitespace", () => {
    it("通常の文字列はそのまま返す", () => {
      expect(normalizeWhitespace("テスト")).toBe("テスト");
    });

    it("前後のスペースをトリムする", () => {
      expect(normalizeWhitespace("  テスト  ")).toBe("テスト");
    });

    it("連続するスペースを1つにまとめる", () => {
      expect(normalizeWhitespace("テスト  文字列")).toBe("テスト 文字列");
    });

    it("全角スペースも正規化される", () => {
      expect(normalizeWhitespace("テスト\u3000文字列")).toBe("テスト 文字列");
    });

    it("undefinedの場合、空文字を返す", () => {
      expect(normalizeWhitespace(undefined)).toBe("");
    });

    it("空文字の場合、空文字を返す", () => {
      expect(normalizeWhitespace("")).toBe("");
    });
  });

  // ============================================
  // parseNumber
  // ============================================
  describe("parseNumber", () => {
    it("数値文字列を正しくパースする", () => {
      expect(parseNumber("100")).toBe(100);
    });

    it("カンマ区切り数値を正しくパースする", () => {
      expect(parseNumber("1,234,567")).toBe(1234567);
    });

    it("小数点を含む数値を正しくパースする", () => {
      expect(parseNumber("100.50")).toBe(100.5);
    });

    it("前後にスペースがある場合もパースできる", () => {
      expect(parseNumber("  100  ")).toBe(100);
    });

    it("undefinedの場合、0を返す", () => {
      expect(parseNumber(undefined)).toBe(0);
    });

    it("空文字の場合、0を返す", () => {
      expect(parseNumber("")).toBe(0);
    });

    it("数値でない文字列の場合、0を返す", () => {
      expect(parseNumber("abc")).toBe(0);
    });
  });

  // ============================================
  // parseInteger
  // ============================================
  describe("parseInteger", () => {
    it("整数文字列を正しくパースする", () => {
      expect(parseInteger("100")).toBe(100);
    });

    it("カンマ区切り数値を正しくパースする", () => {
      expect(parseInteger("1,234")).toBe(1234);
    });

    it("小数点を含む場合、整数部分のみを返す", () => {
      expect(parseInteger("100.99")).toBe(100);
    });

    it("undefinedの場合、0を返す", () => {
      expect(parseInteger(undefined)).toBe(0);
    });

    it("空文字の場合、0を返す", () => {
      expect(parseInteger("")).toBe(0);
    });
  });
});
