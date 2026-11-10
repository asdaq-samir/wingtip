import { test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { grabberTo, settle } from "./helpers";

/**
 * The installed app's pictures (vite.config.ts' SCREENSHOTS): Chrome's
 * richer install dialog shows them with the manifest's description
 * (web.dev, "Richer install UI"). Each is the app's own screen against the
 * real stack, never drawn: the planner's test route, C81 to KDLH, on the
 * day's weather, with no airplane picked (decision 0011). Taken only when
 * asked, into public/screenshots, and committed:
 *
 *   MANIFEST_SHOTS=1 npx playwright test manifest-screenshots --project=mobile --project=desktop
 *
 * The mobile project's 390 by 844 is the narrow picture, the desktop's
 * 1280 by 800 the wide one.
 */
test.skip(!process.env.MANIFEST_SHOTS, "Taken only when asked (MANIFEST_SHOTS=1)");

test("the manifest's screenshot of the route and its plan", async ({ page }, info) => {
  const wide = info.project.name === "desktop";
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  if (!wide) await grabberTo(page, "half");
  await page.waitForLoadState("networkidle");
  const out = fileURLToPath(new URL(`../public/screenshots/${wide ? "wide" : "narrow"}.png`, import.meta.url));
  await page.screenshot({ path: out });
});
