// @ts-check

import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import eslintPluginPrettier from "eslint-plugin-prettier";

export default defineConfig(
  // グローバル除外設定
  globalIgnores(["dist/**", "node_modules/**", "output/**"]),

  // ESLint 推奨ルール
  eslint.configs.recommended,

  // TypeScript ESLint 推奨ルール
  tseslint.configs.recommended,

  // TypeScript ファイル設定
  {
    name: "typescript-files",
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      prettier: eslintPluginPrettier,
    },
    rules: {
      // Prettier ルール
      "prettier/prettier": "error",
      // TypeScript ルール
      "@typescript-eslint/explicit-function-return-type": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      // 一般ルール
      "no-console": "off",
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
      "no-var": "error",
    },
  },

  // テストファイル設定
  {
    name: "test-files",
    files: ["src/**/*.test.ts", "src/**/*.spec.ts", "tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },

  // Prettier との競合回避（最後に配置）
  eslintConfigPrettier
);
