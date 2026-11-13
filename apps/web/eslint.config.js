import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
// The maintained fork of eslint-plugin-jsx-a11y (the same rules, as
// jsx-a11y-x/...), which runs on ESLint 10; the original stops at 9.
import jsxA11y from "eslint-plugin-jsx-a11y-x";
import vitest from "@vitest/eslint-plugin";
import testingLibrary from "eslint-plugin-testing-library";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

// The bans, each saying which stock part to use.
const STOCK_BANS = [
  {
    selector: "JSXOpeningElement[name.name='button']",
    message: "A raw <button>: use components/ui's Button (stock, with its own states and focus; decision 0016).",
  },
  {
    selector: "JSXOpeningElement[name.name='details']",
    message: "A raw <details>: use components/ui's Collapsible or Accordion (decision 0016).",
  },
  {
    selector: "JSXAttribute[name.name='role'][value.value='alert']",
    message: 'A hand-set role="alert": show the problem where it happens with lib/problems and components/ui\'s Alert.',
  },
];
// The hand-built parts the simplicity audit of 2026-11-12 kept, each where
// no stock part does the job: the route box (RouteBox.tsx, an editable row
// of route pills with inline arrows no combobox draws), the map's control
// group (MapControls.tsx, one glass group of ghost buttons over the map,
// Apple Maps' own), the listening pill (RadioLayer.tsx, the mic that widens
// into live words, the owner's pick of 2026-11-09) and the scale bar
// (ZoomBanner.tsx, drawn to the map's zoom).
const HAND_BUILT_KEPT = [
  "src/features/plan/components/RouteBox.tsx",
  "src/components/MapControls.tsx",
  "src/components/RadioLayer.tsx",
  "src/components/ZoomBanner.tsx",
];

export default defineConfig(
  // No warnings (the owner's rule): a disable comment that disables
  // nothing is an error, and the lint runs with --max-warnings 0, so a
  // rule a plugin's preset sets to "warn" fails it too.
  { linterOptions: { reportUnusedDisableDirectives: "error" } },
  { ignores: ["dist", "node_modules", "playwright-report", "test-results", "src/lib/api/schema.d.ts", "src/lib/engine/contract.ts"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat["recommended-latest"],
      jsxA11y.configs.recommended,
    ],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { "react-refresh": reactRefresh },
    rules: {
      "react-refresh/only-export-components": ["error", { allowConstantExport: true }],
      // Test/setup files intentionally export non-component helpers
      // alongside components; the rule above is for app source only.

      // Matches this codebase's existing convention (Button.tsx,
      // usePlanState.ts) of destructuring a field out just to discard
      // it, prefixed with `_` to say so on purpose -- rather than
      // rewriting that pattern to please the linter.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  // The layers (lib/ and hooks/ under components/, under the features, a
  // feature reached only through its index.ts) are dependency-cruiser's,
  // .dependency-cruiser.cjs.
  //
  // Stock components over hand-rolled ones (decision 0016; CLAUDE.md,
  // "Simplicity rules"): a control is components/ui's Button, a disclosure
  // its Collapsible or Accordion, a problem lib/problems' Alert, each with
  // the platform's own states, focus and announcements. Today's hand-built
  // ones are held in eslint-suppressions.json (ESLint's bulk suppressions:
  // an unused one fails the lint, so the list only shrinks;
  // `npx eslint --prune-suppressions` drops them). Never add to it to pass.
  {
    files: ["src/**/*.tsx"],
    ignores: ["src/components/ui/**", "src/**/*.test.tsx", ...HAND_BUILT_KEPT],
    rules: { "no-restricted-syntax": ["error", ...STOCK_BANS] },
  },
  { files: ["e2e/**/*.ts", "**/*.test.ts", "**/*.test.tsx"], languageOptions: { globals: globals.node } },
  // The usual causes of a flaky test, caught as it is written (docs/CI.md,
  // "Flaky tests"). Vitest's own plugin (@vitest/eslint-plugin, which
  // replaced eslint-plugin-vitest) on the unit tests: its recommended
  // rules, and a test.only or describe.only fails the lint rather than
  // quietly running one test of the suite.
  {
    files: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      "vitest/no-focused-tests": "error",
      // expect(value, "what it is") is vitest's own way to name a check.
      "vitest/valid-expect": ["error", { maxArgs: 2 }],
      // A fixture's cases branch on their expected answer (null, or the
      // figures), and each branch asserts: not the skipped check this
      // rule is after.
      "vitest/no-conditional-expect": "off",
    },
  },
  // Testing Library's own rules for the files that render React: async
  // queries and events awaited, no side effects in waitFor, no real
  // waits for what findBy and waitFor wait on.
  {
    files: ["src/**/*.test.tsx"],
    ...testingLibrary.configs["flat/react"],
    rules: {
      ...testingLibrary.configs["flat/react"].rules,
      // A file that unstubs globals in its afterEach unmounts first, by
      // hand, since the setup's cleanup runs after the file's own hooks;
      // and a test that renders three ways unmounts between them.
      "testing-library/no-manual-cleanup": "off",
      // Style, not flakiness: which object a query is read from, how a
      // render's result is named, a node reached directly, an act() more
      // than needed. Each works the same in any order.
      "testing-library/prefer-screen-queries": "off",
      "testing-library/render-result-naming-convention": "off",
      "testing-library/no-node-access": "off",
      "testing-library/no-unnecessary-act": "off",
    },
  },
  // And no .only in the browser specs (Playwright's forbidOnly catches it
  // in CI too; this catches it before the push).
  {
    files: ["e2e/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "test", property: "only", message: "A focused test runs alone: remove .only before committing." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.object.name='test'][object.property.name='describe'][property.name='only']",
          message: "A focused test runs alone: remove .only before committing.",
        },
      ],
    },
  },
  {
    // shadcn's generated primitives export their cva variants
    // (buttonVariants, badgeVariants) beside the component, which is
    // how the registry ships them and how other components compose
    // them -- kept stock rather than split to please Fast Refresh.
    files: ["src/components/ui/**"],
    rules: { "react-refresh/only-export-components": "off" },
  },
);
