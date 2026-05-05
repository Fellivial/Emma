import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import tsPlugin from "typescript-eslint";

export default [
  {
    ignores: ["node_modules", ".next", "dist"],
     linterOptions: {
      reportUnusedDisableDirectives: true,
    },
  },
  js.configs.recommended,
  ...tsPlugin.configs.recommended,
   {
    languageOptions: {
      parserOptions: {
        project: true,
      },
    },
  },

  nextPlugin.configs["core-web-vitals"],
  
  {
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "prefer-const": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
];