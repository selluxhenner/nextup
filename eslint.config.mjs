import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "legacy/**",
    ".github/ci/**",
    // Generated dc-runtime artifacts at the repo root, the pair to NextUp.dc.html. Same reason
    // legacy/** is ignored - the file says "GENERATED ... do not edit" on line 1 and nothing in
    // src/ references it. Without this, `npm run lint` fails on main. (Kevin: flagged in the PR.)
    "support.js",
    "NextUp.dc.html",
    // Browser-driven e2e scripts. Same reason .github/ci/** is ignored: they are CommonJS and
    // resolve playwright from a side install via NODE_PATH, so they are not part of the app's
    // module system and the app's rules do not apply to them.
    "tests/e2e/**",
  ]),
]);

export default eslintConfig;
