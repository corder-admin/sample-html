# ファクトリ規約

```yaml
記号: ✅=必須 | ❌=禁止 | ⚠️=注意
適用: test/factories/
ライブラリ: factory.ts ^1.4.2
目的: 型安全性 / 一貫性 / 保守性
```

---

## §1 アーキテクチャ

```yaml
base.factory.ts: 共通ユーティリティ
  - createFactoryWrapper    # オブジェクト生成ラッパー
  - createRowValuesWrapper  # 行配列生成ラッパー
  - toRowValues             # オブジェクト→行配列変換
  - resetAllFactories       # シーケンスリセット
  - FieldOrder<T>           # 列順序型

[domain].factory.ts: ドメイン別ファクトリ定義
```

```text
test/factories/
├── CLAUDE.md           # 本規約
├── base.factory.ts     # 共通基盤
└── [domain].factory.ts # ドメイン別 (例: user.factory.ts)
```

---

## §2 ファクトリ作成

### §2.1 標準テンプレート

```typescript
import * as Factory from 'factory.ts';
import {
  createFactoryWrapper,
  createRowValuesWrapper,
  toRowValues,
  type FieldOrder,
} from './base.factory';

// 1. 型定義
export interface MyEntity {
  id: number;
  name: string;
}

// 2. 列順序（行配列が必要な場合のみ）
const FIELD_ORDER: FieldOrder<MyEntity> = ['id', 'name'] as const;

// 3. ベースファクトリ
const baseFactory = Factory.Sync.makeFactory<MyEntity>({
  id: 1,
  name: 'デフォルト名',
});

// 4. エクスポート
export const MyEntityFactory = createFactoryWrapper(baseFactory);
export const MyEntityRowValuesFactory = createRowValuesWrapper(
  baseFactory,
  FIELD_ORDER
);
```

### §2.2 派生ファクトリ

異常系・バリエーション用。`extend()` または `_factory` を使用:

```typescript
// 方法1: ベースファクトリから直接
const invalidFactory = baseFactory.extend({ date: '無効な日付' });
export const InvalidEntityFactory = createFactoryWrapper(invalidFactory);

// 方法2: ラッパーの _factory から
const errorFactory = MyEntityFactory._factory.extend({ status: 'error' });
export const ErrorEntityFactory = createFactoryWrapper(errorFactory);
```

---

## §3 factory.ts API

### §3.1 `Factory.each()` - シーケンス番号

```typescript
const factory = Factory.Sync.makeFactory<User>({
  id: Factory.each(i => i), // 1, 2, 3, ...
  email: Factory.each(i => `user${i}@test.com`),
});
```

### §3.2 `withDerivation()` - 導出値

```typescript
const factory = baseFactory.withDerivation2(
  ['firstName', 'lastName'],
  'fullName',
  (first, last) => `${first} ${last}`
);
```

### §3.3 `combine()` - ファクトリ合成

```typescript
const timestampFactory = makeFactory({
  createdAt: new Date(),
  updatedAt: new Date(),
});
const myFactory = baseFactory.combine(timestampFactory);
```

---

## §4 使用方法

### §4.1 オブジェクト生成

```typescript
const entity = EntityFactory.build(); // デフォルト値
const entity = EntityFactory.build({ status: 'active' }); // 一部上書き
const entities = EntityFactory.buildList(3, { type: 'A' }); // 複数生成
```

### §4.2 行配列生成

```typescript
// RowValuesファクトリ経由
const rowValues = EntityRowValuesFactory.build({ id: 100 });

// toRowValues 直接使用（既存オブジェクトから変換）
const entity = EntityFactory.build();
const rowValues = toRowValues(entity, FIELD_ORDER);
```

### §4.3 シーケンスリセット

```typescript
import { resetAllFactories } from './base.factory';

beforeEach(() => {
  resetAllFactories(EntityFactory, EntityRowValuesFactory);
});
```

---

## §5 禁止事項

| ルール                              | 理由                     |
| ----------------------------------- | ------------------------ |
| ❌ オブジェクトリテラル手動作成     | 生成元一元管理のため     |
| ❌ 重複フィールド定義               | base.factory.ts 活用     |
| ❌ `any` 型使用                     | `unknown[]` を使用       |
| ❌ クラスベース静的メソッド新規作成 | IIFE + `as const` を使用 |

---

## §6 後方互換

既存クラスベースファクトリは移行完了まで維持:

```typescript
// ⚠️ 非推奨
LegacyFactory.buildObj({ status: 'active' });

// ✅ 推奨
EntityFactory.build({ status: 'active' });
```

---

## §7 参照

- [factory.ts GitHub](https://github.com/willryan/factory.ts)
- [factory.ts npm](https://www.npmjs.com/package/factory.ts)
- テスト規約: `test/CLAUDE.md`
