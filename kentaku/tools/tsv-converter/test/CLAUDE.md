# テストコード品質規約

```yaml
記号: ✅=必須 | ❌=禁止 | ⚠️=注意 | →=参照 | ∵=理由
適用: /sc:test 実行時
目的: 一貫性/可読性/保守性
上位: プロジェクトルート CLAUDE.md（競合時優先）
```

---

## 1. 構造

```yaml
describe: サービス/関数グループ化
it: 個別ケース記述
分離: 正常/異常明確分離
エッジ: 明示指示時のみ生成
```

---

## 2. データ

### ✅ ファクトリー使用義務

```yaml
必須: ./factories 配下ファクトリー
❌禁止: オブジェクトリテラル手動作成
∵理由: 生成元一元管理→仕様変更耐性+再利用性
詳細: test/factories/CLAUDE.md
```

```typescript
// ✅ OK
const user = UserFactory.build({ role: 'admin' });

// ❌ NG
const user = { id: 1, name: 'test', role: 'admin' };
```

---

## 3. 実行

### ✅ `beforeEach` クリーンアップ

```yaml
設置: 全 describe
処理: モック+ファクトリーシーケンスリセット
∵理由: テスト間依存排除→実行順序非依存
```

```typescript
describe('Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Factory.resetSequenceNumber();
  });
});
```

---

## 4. 検証

```yaml
it名: 「何を」「どうすると」「どうなる」日本語明記
expect: 具体値検証（エラー→メッセージ含む）
∵理由: 意図明確化+失敗即理解
```

```typescript
// ✅ OK
it('無効メールで"Invalid email format"エラー', () => {
  expect(() => Service.call(user)).toThrow('Invalid email format');
});

// ❌ NG
it('エラー', () => {
  expect(() => Service.call({})).toThrow();
});
```

---

## 5. コメント

### 対象セクション

```yaml
1_データ: 役割+意図
2_モック: 目的+想定挙動
3_検証: 各 expect 確認内容
```

### 記述ルール

```yaml
セクション冒頭: 全体目的
個別要素: 役割1行
複数検証: 番号付きリスト
論理性: データ/モック/検証の理由明確
簡潔性: 必要最小限情報
一貫性: 全テスト統一スタイル
具体性: 抽象表現回避
```

### ⚠️ 注意点

```yaml
過剰禁止: コードから明らか→説明不要
意図優先: "何"より"なぜ"
パラメータ補足: 複雑モック→各パラメータ意味簡潔説明
```

### 実装例

```typescript
it('既存バッチジョブ存在時、そのバッチ結果返却', () => {
  // テストデータ: PROCESSING状態バッチキュー（処理中）
  const queue = Factory.createBatch({ status: PROCESSING });
  const expected = Result.success('既存ジョブ実行中');

  // モック: 既存ジョブ存在（重複実行防止）
  checkExisting.mockReturnValue(expected);

  // 実行+検証: 早期リターンで重複実行防止
  expect(Handler.call(queue)).toBe(expected);
  expect(checkExisting).toHaveBeenCalledWith(queue);
  expect(generateService.call).not.toHaveBeenCalled();
});
```

---

## 6. モック

```yaml
基盤: test/setup.ts の getTestMocks（SpreadsheetApp等）
カスタム: テストファイル内 vi.fn()/vi.spyOn()
```

---

## 7. デバッグ

```yaml
原則: console.log 出力抑制
手順:
  1_有効化: VITEST_CONSOLE_LOG=true npm run test -- 'path/to/test.ts'
  2_クリーンアップ: デバッグ後 console.log 削除
制御: test/setup.ts で環境変数制御
```

---

## 適用除外

```yaml
❌禁止:
  - ログ出力テスト: console.log 等の有無検証（デバッグ利用は許可）
  - 外部ライブラリテスト: Vitest/GAS自体の挙動検証（自作ロジックのみ対象）
```
