import path from "node:path";
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";
import boundaries from "./boundaries.js";

RuleTester.describe = describe;
RuleTester.it = it;

const src = (file: string) => path.resolve(import.meta.dirname, "..", "src", file);
const tester = new RuleTester({ languageOptions: { parser: tseslint.parser, ecmaVersion: 2022, sourceType: "module" } });

tester.run("boundaries/layers", boundaries.rules.layers, {
  valid: [
    { filename: src("features/plan/PlanWorkspace.tsx"), code: `import { cn } from "cn"; import { TEXT } from "../../lib/text";` },
    { filename: src("features/plan/PlanWorkspace.tsx"), code: `import x from "./components/RouteMap";` },
    { filename: src("features/shell/MapPage.tsx"), code: `import { PlanWorkspace } from "../plan"; import { LinkSignIn } from "../pilot/index";` },
    { filename: src("features/plan/routePanelParts.tsx"), code: `const p = () => import("../pilot");` },
    { filename: src("components/MapBanners.tsx"), code: `import("../features/atc");` },
    { filename: src("components/RouteForm.tsx"), code: `import { TEXT } from "../lib/text";` },
    { filename: src("lib/briefPlan.ts"), code: `import type { Course } from "./api/types";` },
    { filename: src("main.tsx"), code: `import MapPage from "./features/shell/MapPage";` },
  ],
  invalid: [
    { filename: src("features/plan/x.tsx"), code: `import ChecklistPage from "../pilot/ChecklistPage";`, errors: 1 },
    { filename: src("features/plan/components/x.tsx"), code: `const p = lazy(() => import("../../pilot/PilotPanel"));`, errors: 1 },
    { filename: src("features/plan/x.ts"), code: `export { x } from "../pilot/thing";`, errors: 1 },
    { filename: src("features/plan/x.ts"), code: `type M = typeof import("../pilot/PilotPanel");`, errors: 1 },
    { filename: src("features/plan/x.test.ts"), code: `vi.mock("../pilot/PilotPanel");`, errors: 1 },
    { filename: src("features/plan/x.ts"), code: `import { y } from "@/features/pilot/AccountPanels";`, errors: 1 },
    { filename: src("components/RadioButton.tsx"), code: `import C from "../features/plan/components/ClearanceCard";`, errors: 1 },
    { filename: src("lib/preferences.ts"), code: `import { DEFAULT_FILTERS } from "../features/chart-labels/logic";`, errors: 1 },
    { filename: src("lib/map/gl/x.tsx"), code: `import MapControls from "../../../components/MapControls";`, errors: 1 },
    { filename: src("hooks/use-x.ts"), code: `import { y } from "../features/plan";`, errors: 1 },
  ],
});
