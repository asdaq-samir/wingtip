import { test, expect } from "@playwright/test";
import { openNavLog, navLogSheet, settle, sideDrawer, slow } from "./helpers";

/**
 * With no airplane picked, the plan shows what the route is -- its
 * destination, its miles, its legs' courses and checkpoints -- and none of
 * what an airplane would make of it: no time, fuel, groundspeed, arrival
 * or tops of climb and descent. The owner (2026-11-08): "If no airplane is
 * entered, only show the distance and the things you can without airplane
 * profile, don't assume." It was a C172 at 40 gal, unsaid (the FPL audit's
 * A14).
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const kept = JSON.parse(localStorage.getItem("wingtip.preferences") ?? '{"state":{},"version":6}');
    localStorage.setItem(
      "wingtip.preferences",
      JSON.stringify({ ...kept, version: 6, state: { ...kept.state, aircraft: { profile: "", label: "", none: true } } }),
    );
  });
});

test("no airplane picked: the strip is To and Dist, the nav log its courses and miles, and nothing of a C172", async ({ page }) => {
  await page.goto("/app/plan?dep=KUGN&dest=KOSH");
  await settle(page);
  const strip = sideDrawer(page).getByTestId("flight-line");
  await expect(strip).toContainText(/DIST/i, { timeout: slow(60000) });
  await expect(strip.getByTestId("navlog-ete")).toHaveCount(0);
  await expect(strip.getByTestId("navlog-fuel")).toHaveCount(0);
  await openNavLog(page);
  const log = navLogSheet(page).getByTestId("navlog-list");
  await expect(log.locator('[role="row"][data-kind="destination"]')).toBeVisible({ timeout: slow(60000) });
  await expect(log.locator('[role="row"][data-kind="toc"], [role="row"][data-kind="tod"]')).toHaveCount(0);
  await expect(log).not.toContainText(/\d min\b/);
  await expect(log.getByTestId("navlog-list-heads")).not.toContainText("ETA");
  await expect(log.getByTestId("navlog-row-dist").first()).toContainText(/nm/);
});
