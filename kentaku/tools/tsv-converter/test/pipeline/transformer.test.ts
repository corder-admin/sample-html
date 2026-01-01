/**
 * Transformer Tests
 *
 * aggregateByMinorCode関数のテスト
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  aggregateByMinorCode,
  transformToOutput,
} from "../../src/pipeline/transformer";
import { CleanedRecordFactory, resetAllFactories } from "../factories";

describe("transformer", () => {
  beforeEach(() => {
    resetAllFactories(CleanedRecordFactory);
  });

  describe("aggregateByMinorCode", () => {
    describe("正常系", () => {
      it("単一レコードはそのまま返却", () => {
        // テストデータ: 1件のレコード
        const records = [CleanedRecordFactory.build()];

        // 実行
        const { aggregated, stats } = aggregateByMinorCode(records);

        // 検証: レコード数変化なし
        expect(aggregated).toHaveLength(1);
        expect(stats.beforeCount).toBe(1);
        expect(stats.afterCount).toBe(1);
        expect(stats.aggregatedGroups).toBe(0);
      });

      it("異なるminorCodeは集約されない", () => {
        // テストデータ: 異なるminorCodeを持つ2件
        const records = [
          CleanedRecordFactory.build({ minorCode: "001" }),
          CleanedRecordFactory.build({ minorCode: "002" }),
        ];

        // 実行
        const { aggregated, stats } = aggregateByMinorCode(records);

        // 検証: 2件のまま
        expect(aggregated).toHaveLength(2);
        expect(stats.aggregatedGroups).toBe(0);
      });

      it("同一キー（工事名+業者+発注日+minorCode）で集約される", () => {
        // テストデータ: 同一キーで工事細目連番のみ異なる2件
        const records = [
          CleanedRecordFactory.build({
            projectName: "A工事",
            vendor: "業者X",
            orderDate: "20240101",
            minorCode: "001",
            qty: 10,
            price: 1000,
            amount: 10000,
            spec: "仕様A",
          }),
          CleanedRecordFactory.build({
            projectName: "A工事",
            vendor: "業者X",
            orderDate: "20240101",
            minorCode: "001",
            qty: 20,
            price: 1500,
            amount: 30000,
            spec: "仕様B",
          }),
        ];

        // 実行
        const { aggregated, stats } = aggregateByMinorCode(records);

        // 検証: 1件に集約
        expect(aggregated).toHaveLength(1);
        expect(stats.beforeCount).toBe(2);
        expect(stats.afterCount).toBe(1);
        expect(stats.aggregatedGroups).toBe(1);

        // 集約結果の検証
        const result = aggregated[0];
        // 1. 実行数量の合算: 10 + 20 = 30
        expect(result.qty).toBe(30);
        // 2. 実行予算金額の合算: 10000 + 30000 = 40000
        expect(result.amount).toBe(40000);
        // 3. 実行単価の再計算: 40000 / 30 ≈ 1333
        expect(result.price).toBe(Math.round(40000 / 30));
        // 4. 摘要の結合
        expect(result.spec).toBe("仕様A／仕様B");
      });

      it("異なる業者は集約されない", () => {
        // テストデータ: 同一minorCodeだが業者が異なる
        const records = [
          CleanedRecordFactory.build({
            minorCode: "001",
            vendor: "業者A",
          }),
          CleanedRecordFactory.build({
            minorCode: "001",
            vendor: "業者B",
          }),
        ];

        // 実行
        const { aggregated } = aggregateByMinorCode(records);

        // 検証: 業者が異なるため集約されない
        expect(aggregated).toHaveLength(2);
      });

      it("3件以上の同一キーレコードを集約", () => {
        // テストデータ: 同一キーで3件
        const records = [
          CleanedRecordFactory.build({
            minorCode: "001",
            qty: 10,
            amount: 10000,
          }),
          CleanedRecordFactory.build({
            minorCode: "001",
            qty: 20,
            amount: 20000,
          }),
          CleanedRecordFactory.build({
            minorCode: "001",
            qty: 30,
            amount: 30000,
          }),
        ];

        // 実行
        const { aggregated, stats } = aggregateByMinorCode(records);

        // 検証
        expect(aggregated).toHaveLength(1);
        expect(aggregated[0].qty).toBe(60); // 10 + 20 + 30
        expect(aggregated[0].amount).toBe(60000); // 10000 + 20000 + 30000
        expect(aggregated[0].price).toBe(1000); // 60000 / 60
        expect(stats.aggregatedGroups).toBe(1);
      });

      it("複数グループの集約", () => {
        // テストデータ: 2つのグループ（それぞれ2件ずつ）
        const records = [
          // グループ1: minorCode 001
          CleanedRecordFactory.build({
            minorCode: "001",
            qty: 10,
            amount: 10000,
          }),
          CleanedRecordFactory.build({
            minorCode: "001",
            qty: 10,
            amount: 10000,
          }),
          // グループ2: minorCode 002
          CleanedRecordFactory.build({
            minorCode: "002",
            qty: 5,
            amount: 5000,
          }),
          CleanedRecordFactory.build({
            minorCode: "002",
            qty: 5,
            amount: 5000,
          }),
        ];

        // 実行
        const { aggregated, stats } = aggregateByMinorCode(records);

        // 検証
        expect(aggregated).toHaveLength(2);
        expect(stats.beforeCount).toBe(4);
        expect(stats.afterCount).toBe(2);
        expect(stats.aggregatedGroups).toBe(2);
      });
    });

    describe("エッジケース", () => {
      it("空配列を渡すと空配列を返却", () => {
        const { aggregated, stats } = aggregateByMinorCode([]);

        expect(aggregated).toHaveLength(0);
        expect(stats.beforeCount).toBe(0);
        expect(stats.afterCount).toBe(0);
        expect(stats.aggregatedGroups).toBe(0);
      });

      it("数量が0の場合、単価は0になる", () => {
        // テストデータ: 合計数量が0
        const records = [
          CleanedRecordFactory.build({
            minorCode: "001",
            qty: 0,
            amount: 0,
          }),
          CleanedRecordFactory.build({
            minorCode: "001",
            qty: 0,
            amount: 0,
          }),
        ];

        // 実行
        const { aggregated } = aggregateByMinorCode(records);

        // 検証: 0除算を回避して0を返す
        expect(aggregated[0].price).toBe(0);
      });

      it("同一の摘要は重複除去される", () => {
        // テストデータ: 同じ摘要を持つレコード
        const records = [
          CleanedRecordFactory.build({
            minorCode: "001",
            spec: "共通仕様",
          }),
          CleanedRecordFactory.build({
            minorCode: "001",
            spec: "共通仕様",
          }),
        ];

        // 実行
        const { aggregated } = aggregateByMinorCode(records);

        // 検証: 重複除去で1つのみ
        expect(aggregated[0].spec).toBe("共通仕様");
      });

      it("空の摘要はフィルタされる", () => {
        // テストデータ: 一方の摘要が空
        const records = [
          CleanedRecordFactory.build({
            minorCode: "001",
            spec: "有効な仕様",
          }),
          CleanedRecordFactory.build({
            minorCode: "001",
            spec: "",
          }),
        ];

        // 実行
        const { aggregated } = aggregateByMinorCode(records);

        // 検証: 空文字はフィルタされる
        expect(aggregated[0].spec).toBe("有効な仕様");
      });
    });
  });

  describe("transformToOutput", () => {
    it("CleanedRecordをOutputRecordに変換", () => {
      // テストデータ
      const cleaned = CleanedRecordFactory.build({
        minorCode: "001",
        amount: 100000,
      });

      // 実行
      const output = transformToOutput([cleaned]);

      // 検証: 新フィールドが含まれる
      expect(output[0].minorCode).toBe("001");
      expect(output[0].amount).toBe(100000);
    });
  });
});
