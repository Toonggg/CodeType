import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/", "coverage/", "node_modules/"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser },
    },
    rules: {
      "no-shadow": "error",
      // Only logical operators: Prettier removes parentheses around arithmetic.
      "no-mixed-operators": ["error", { groups: [["&&", "||"]] }],
      "prefer-const": "error",
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["*.config.js", "tests/**/*.js"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
