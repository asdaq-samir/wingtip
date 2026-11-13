import { test, expect, type Page } from "@playwright/test";
import { closeProfile, openPanel, openProfile, pressDryRunStart, settle, sideDrawer, slow } from "./helpers";
import { setMap3d } from "./mapCard";
import { pickAirplane } from "./startState";
test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

/**
 * The ground under the chart (features/plan/map/terrain): its relief
 * shaded over the 2D chart, always (the owner, 2026-11-13, Flat taken
 * out), then stood up in 3D
 * by the map's round 3D button (ThreeDButton) with the
 * route drawn at its altitudes; and the dry run seen from the pilot's seat,
 * its key saying it is a view, not terrain clearance. The map's own element
 * says what is drawn (its data-layers, data-terrain, data-route-aloft,
 * data-pilot-view), as the container has no GPU to look at.
 */
const map = (page: Page) => page.getByTestId("gl-map");
const layers = (page: Page) => map(page).getAttribute("data-layers");

test("the relief is shaded over the chart, and stood up in 3D with the route at its altitudes", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await expect.poll(() => layers(page), { timeout: slow(20_000) }).toContain("terrain-hillshade");
  await expect(map(page)).not.toHaveAttribute("data-terrain", "3d");

  // 3D from the map's own button. With no route, no key to its colours.
  await setMap3d(page, true);
  await expect(page.getByTestId("clearance-key")).toHaveCount(0);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await expect(map(page)).toHaveAttribute("data-terrain", "3d", { timeout: slow(20_000) });
  // Once the legs are in, the route in the air, a piece every half mile.
  await expect
    .poll(async () => Number((await map(page).getAttribute("data-route-aloft")) ?? 0), { timeout: slow(60_000) })
    .toBeGreaterThan(100);
  // And the ground near it coloured against the plan, within the engine's
  // corridor (floor_corridor_nm), the map's key beside the 3D button
  // saying what the colours are, and its tap the whole of it.
  await expect(map(page)).toHaveAttribute("data-terrain-clearance", "5", { timeout: slow(20_000) });
  await expect.poll(() => layers(page)).toContain("terrain-clearance");
  const key = page.getByTestId("clearance-key");
  await expect(key).toContainText(/within [\d,]+ ft below/);
  await expect(key).toContainText("at or above");
  await key.click();
  await expect(page.getByTestId("clearance-key-words")).toContainText("A view of the plan, not terrain clearance.");
  await page.keyboard.press("Escape");

  // 3D off: the shaded 2D chart again, north up, and no key.
  await setMap3d(page, false);
  await expect(page.getByTestId("clearance-key")).toHaveCount(0);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await expect.poll(() => layers(page)).toContain("terrain-hillshade");
  await expect(map(page)).not.toHaveAttribute("data-terrain", "3d");
});

test("the dry run seen from the pilot's seat, its key a view and not clearance", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await openProfile(page);
  const start = sideDrawer(page).getByTestId("dry-run-start");
  await expect(start).toBeVisible({ timeout: slow(60_000) });
  await pressDryRunStart(page, start);

  const pilot = sideDrawer(page).getByTestId("dry-run-pilot-view");
  await expect(pilot).toHaveAttribute("aria-pressed", "false");
  await pilot.click();
  await expect(pilot).toHaveAttribute("aria-pressed", "true");
  await expect(map(page)).toHaveAttribute("data-terrain", "3d", { timeout: slow(20_000) });
  await expect(map(page)).toHaveAttribute("data-pilot-view", "", { timeout: slow(20_000) });
  // Coloured from the airplane's altitude as it climbs out of C81 (869 ft).
  await expect
    .poll(async () => Number((await map(page).getAttribute("data-pilot-alt-ft")) ?? 0), { timeout: slow(20_000) })
    .toBeGreaterThan(800);
  const key = sideDrawer(page).getByTestId("dry-run-pilot-key");
  await expect(key).toContainText("Ground within 1,000 ft");
  await expect(key).toContainText("A view, not terrain clearance");
  // The pilot's view's colours alone, not the plan's corridor beside them.
  await expect(map(page)).not.toHaveAttribute("data-terrain-clearance");

  // Back to the chart from above, and put away with the run.
  await pilot.click();
  await expect(map(page)).not.toHaveAttribute("data-pilot-view");
  await expect(map(page)).not.toHaveAttribute("data-terrain", "3d");
  await pilot.click();
  await sideDrawer(page).getByTestId("dry-run-close").click();
  await expect(map(page)).not.toHaveAttribute("data-pilot-view");
  await closeProfile(page);
});
