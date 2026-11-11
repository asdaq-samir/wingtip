import { test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { grabberTo, settle } from "./helpers";

/**
 * The installed app's pictures (vite.config.ts' SCREENSHOTS): Chrome's
 * richer install dialog shows them with the manifest's description
 * (web.dev, "Richer install UI"). Each is the app's own screen against the
 * real stack, never drawn, on the day's weather, with no airplane picked
 * (decision 0011). Taken only when asked, into public/screenshots, and
 * committed:
 *
 *   MANIFEST_SHOTS=1 npx playwright test manifest-screenshots --project=mobile --project=desktop
 *
 * The mobile project's 390 by 844 is the narrow picture, the desktop's
 * 1280 by 800 the wide one. The wide one is the planner's test route, C81
 * to KDLH. The narrow one is C81 to KDPA round Chicago's Class B, a
 * screenful of sectional on a phone; take it against a stack with the
 * whole chart set (BASE_URL at the live stack), since the CI simulation
 * draws only the test corridor's sheets and leaves most of that map blank.
 */
test.skip(!process.env.MANIFEST_SHOTS, "Taken only when asked (MANIFEST_SHOTS=1)");

test("the manifest's screenshot of the route and its plan", async ({ page }, info) => {
  const wide = info.project.name === "desktop";
  await page.goto(wide ? "/app/plan?dep=C81&dest=KDLH" : "/app/plan?dep=C81&dest=KDPA");
  await settle(page);
  if (!wide) await grabberTo(page, "half");
  await page.waitForLoadState("networkidle");
  const out = fileURLToPath(new URL(`../public/screenshots/${wide ? "wide" : "narrow"}.png`, import.meta.url));
  await page.screenshot({ path: out });
});
