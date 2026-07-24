import nextConfig from "eslint-config-next/core-web-vitals";

export default [
  { ignores: ["node_modules", ".next", "dist"] },
  ...nextConfig,
  {
    rules: {
      // TypeScript
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],

      // General
      "prefer-const": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],

      // React
      "react/no-unescaped-entities": "warn",

      // React Hooks — keep classic rules, downgrade React Compiler rules to warn
      // (project does not use the React Compiler)
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/use-memo": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/globals": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/config": "warn",
      "react-hooks/gating": "warn",
    },
  },
  {
    // Provider boundary (ADR-0013, Technical Design §11.1): provider
    // implementations are internal to the Brain Gateway. Everything outside
    // src/core/brain/ must go through gateway.ts's exported functions.
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["src/core/brain/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/core/brain/providers/*"],
              message:
                "Provider implementations are internal to the Brain Gateway (ADR-0003 Principle 1, ADR-0013). Import from @/core/brain/gateway instead.",
            },
          ],
        },
      ],
    },
  },
];
