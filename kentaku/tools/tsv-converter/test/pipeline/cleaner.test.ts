/**
 * pipeline/cleaner.ts のテスト
 *
 * データクレンジング処理の動作検証
 */
import { describe, it, expect, beforeEach } from "vitest";
import { cleanRecords } from "../../src/pipeline/cleaner";
import {
  RawTsvRecordFactory,
  ZeroQuantityRecordFactory,
  NoVendorRecordFactory,
  InvalidDateRecordFactory,
  resetAllFactories,
} from "../factories";

describe("pipeline/cleaner", () => {
  beforeEach(() => {
    // ファクトリのシーケンスをリセット
    resetAllFactories(
      RawTsvRecordFactory,
      ZeroQuantityRecordFactory,
      NoVendorRecordFactory,
      InvalidDateRecordFactory
    );
  });

  // ============================================
  // cleanRecords - 正常系
  // ============================================
  describe("cleanRecords - 正常系", () => {
    it("正常なレコードはクレンジング済みとして出力される", () => {
      // テストデータ: 標準レコード1件
      const records = [RawTsvRecordFactory.build()];

      // 実行
      const result = cleanRecords(records);

      // 検証:
      // 1. クレンジング済み1件
      expect(result.cleaned).toHaveLength(1);
      // 2. 除外0件
      expect(result.rejected).toHaveLength(0);
      // 3. 統計が正しい
      expect(result.stats.total).toBe(1);
      expect(result.stats.accepted).toBe(1);
      expect(result.stats.rejected).toBe(0);
    });

    it("複数の正常レコードが正しく処理される", () => {
      // テストデータ: 標準レコード3件
      const records = RawTsvRecordFactory.buildList(3);

      // 実行
      const result = cleanRecords(records);

      // 検証: 全件クレンジング済み
      expect(result.cleaned).toHaveLength(3);
      expect(result.rejected).toHaveLength(0);
      expect(result.stats.accepted).toBe(3);
    });

    it("クレンジング済みレコードのフィールドが正しく変換される", () => {
      // テストデータ: 特定の値を持つレコード
      const records = [
        RawTsvRecordFactory.build({
          施工支店名: "  横浜  ",
          工事名称: "テスト　工事", // 全角スペース含む
          実行数量: "1,500",
          実行単価: "2,500.50",
          地上階数: "3",
        }),
      ];

      // 実行
      const result = cleanRecords(records);

      // 検証: 各フィールドが正しく変換される
      const cleaned = result.cleaned[0];
      expect(cleaned.region).toBe("横浜"); // トリム済み
      expect(cleaned.projectName).toBe("テスト 工事"); // 全角スペース正規化
      expect(cleaned.qty).toBe(1500); // カンマ除去
      expect(cleaned.price).toBe(2500.5); // 小数点対応
      expect(cleaned.floors).toBe(3); // 整数変換
    });
  });

  // ============================================
  // cleanRecords - 異常系（除外）
  // ============================================
  describe("cleanRecords - 異常系（除外）", () => {
    it("数量ゼロのレコードは除外される", () => {
      // テストデータ: 数量ゼロのレコード
      const records = [ZeroQuantityRecordFactory.build()];

      // 実行
      const result = cleanRecords(records);

      // 検証:
      // 1. クレンジング済み0件
      expect(result.cleaned).toHaveLength(0);
      // 2. 除外1件
      expect(result.rejected).toHaveLength(1);
      // 3. 除外理由が正しい
      expect(result.rejected[0].reason).toBe("ZERO_QUANTITY");
      // 4. 統計が正しい
      expect(result.stats.byReason.ZERO_QUANTITY).toBe(1);
    });

    it("業者なしのレコードは除外される", () => {
      // テストデータ: 業者なしのレコード
      const records = [NoVendorRecordFactory.build()];

      // 実行
      const result = cleanRecords(records);

      // 検証:
      expect(result.cleaned).toHaveLength(0);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reason).toBe("NO_VENDOR");
      expect(result.stats.byReason.NO_VENDOR).toBe(1);
    });

    it("無効な日付のレコードは除外される", () => {
      // テストデータ: 無効な日付のレコード
      const records = [InvalidDateRecordFactory.build()];

      // 実行
      const result = cleanRecords(records);

      // 検証:
      expect(result.cleaned).toHaveLength(0);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reason).toBe("INVALID_DATE");
      expect(result.stats.byReason.INVALID_DATE).toBe(1);
    });

    it("除外レコードに行番号が正しく設定される", () => {
      // テストデータ: 正常1件 + 除外1件 + 正常1件
      const records = [
        RawTsvRecordFactory.build(),
        ZeroQuantityRecordFactory.build(),
        RawTsvRecordFactory.build(),
      ];

      // 実行
      const result = cleanRecords(records);

      // 検証: 除外レコードの行番号はヘッダー行+1-indexedで計算
      // index=1 → lineNumber=3（ヘッダー行=1, 0-indexed→1-indexed）
      expect(result.rejected[0].lineNumber).toBe(3);
    });
  });

  // ============================================
  // cleanRecords - 混合ケース
  // ============================================
  describe("cleanRecords - 混合ケース", () => {
    it("正常レコードと除外レコードが混在する場合、正しく分類される", () => {
      // テストデータ: 正常2件 + 除外2件（理由別）
      const records = [
        RawTsvRecordFactory.build(), // 正常
        ZeroQuantityRecordFactory.build(), // 除外: ZERO_QUANTITY
        RawTsvRecordFactory.build(), // 正常
        NoVendorRecordFactory.build(), // 除外: NO_VENDOR
      ];

      // 実行
      const result = cleanRecords(records);

      // 検証:
      // 1. 正常2件
      expect(result.cleaned).toHaveLength(2);
      // 2. 除外2件
      expect(result.rejected).toHaveLength(2);
      // 3. 統計が正しい
      expect(result.stats.total).toBe(4);
      expect(result.stats.accepted).toBe(2);
      expect(result.stats.rejected).toBe(2);
      expect(result.stats.byReason.ZERO_QUANTITY).toBe(1);
      expect(result.stats.byReason.NO_VENDOR).toBe(1);
    });

    it("空の入力配列の場合、空の結果を返す", () => {
      // テストデータ: 空配列
      const records: ReturnType<typeof RawTsvRecordFactory.build>[] = [];

      // 実行
      const result = cleanRecords(records);

      // 検証:
      expect(result.cleaned).toHaveLength(0);
      expect(result.rejected).toHaveLength(0);
      expect(result.stats.total).toBe(0);
      expect(result.stats.accepted).toBe(0);
      expect(result.stats.rejected).toBe(0);
    });
  });
});
