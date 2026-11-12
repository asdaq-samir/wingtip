import { test, expect, type Page } from "@playwright/test";
import { beforeTheRoute, settle, slow } from "./helpers";

/**
 * The airspace stood up in 3D (features/plan/map/terrain/AirspaceVolumesGl):
 * from the Map menu's Terrain, 3D, the Class B, C and D, the special use
 * areas and the TFRs drawn as volumes between their floors and ceilings,
 * each lifted over the ground as its heights say. The container has no
 * GPU to look at, so the map's own element says what is drawn: its
 * data-layers and data-airspace-3d, the volumes lifted.
 */
const map = (page: Page) => page.getByTestId("gl-map");

test("in 3D the airspace stands between its floors and ceilings, and flat again it lies on the chart", async ({ page }) => {
  await beforeTheRoute(page, () => page.getByTestId("terrain-select").getByRole("button", { name: "3D" }).click());
  // Over Chicago: O'Hare's Class B and Midway's Class C.
  await page.goto("/app/plan?dep=KDPA&dest=KPWK");
  await settle(page);
  await expect(map(page)).toHaveAttribute("data-terrain", "3d", { timeout: slow(20_000) });
  await expect.poll(() => map(page).getAttribute("data-layers"), { timeout: slow(20_000) }).toContain("airspace-3d-B");
  await expect
    .poll(async () => Number((await map(page).getAttribute("data-airspace-3d")) ?? 0), { timeout: slow(60_000) })
    .toBeGreaterThan(0);

  await beforeTheRoute(page, () => page.getByTestId("terrain-select").getByRole("button", { name: "Flat" }).click());
  await page.goto("/app/plan?dep=KDPA&dest=KPWK");
  await settle(page);
  await expect.poll(() => map(page).getAttribute("data-layers")).not.toContain("airspace-3d-B");
  await expect(map(page)).not.toHaveAttribute("data-airspace-3d");
});
