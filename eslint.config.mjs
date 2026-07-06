import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";
import eslintConfigPrettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // eslint-config-next already registers the "jsx-a11y" plugin instance; redeclaring
  // it via jsxA11y.flatConfigs.recommended would conflict, so only merge its rules.
  { rules: jsxA11y.flatConfigs.recommended.rules },
  eslintConfigPrettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated test/mutation/e2e report artifacts:
    "coverage/**",
    ".stryker-tmp/**",
    "reports/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
