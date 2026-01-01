import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // グローバル API を有効化（describe, it, expect などをインポート不要に）
    globals: true,
    // テスト環境
    environment: "node",
    // テストファイルのパターン
    include: ["src/**/*.{test,spec}.ts", "test/**/*.{test,spec}.ts"],
    // 除外パターン
    exclude: ["node_modules", "dist", "output"],
    // カバレッジ設定
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.{test,spec}.ts", "src/index.ts"],
    },
    // タイムアウト設定（ミリ秒）
    testTimeout: 10000,
  },
});
