import { test, expect, type Page } from "@playwright/test";
import { settle, slow } from "./helpers";
import { setMap3d } from "./mapCard";

/**
 * The airspace stood up in 3D (features/plan/map/terrain/AirspaceVolumesGl):
 * from the map's round 3D button (ThreeDButton), the Class B, C and D, the special use
 * areas and the TFRs drawn whole with deck.gl between their floors and
 * ceilings (the planner's /api/airspace/volumes), each area named once at
 * its top and each Class B, C and D shelf's altitudes written there. The container has no GPU to look at, so the map's own element
 * says what is drawn: its data-layers (the names' layer) and
 * data-airspace3d, the volumes standing (AirspaceVolumesGl's
 * dataset.airspace3d: a digit takes no dash, so not data-airspace-3d).
 */
const map = (page: Page) => page.getByTestId("gl-map");

/** A square ring of `d` degrees from its south-west corner. */
const square = (w: number, s: number, d: number) => [
  [
    [w, s],
    [w + d, s],
    [w + d, s + d],
    [w, s + d],
    [w, s],
  ],
];

/** The planner's volumes, answered here: it reads them from the cycle pack
 *  in the shared store (wingtip.airspace_volumes), which the suite's stack
 *  has none of (infra/docker-compose.ci.yml, no cycle pack), so it says
 *  none. O'Hare's Class B core and Midway's Class C, as the NASR file has
 *  them: surface to 10,000 MSL, and surface to 4,800 MSL. */
const VOLUMES = {
  type: "FeatureCollection",
  cycle: "2026-10-29",
  features: [
    {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: square(-88.0, 41.92, 0.12) },
      properties: { layer: "airspace", class: "B", name: "CHICAGO CLASS B", floor_ft: 0, floor_ref: "SFC", ceiling_ft: 10000 },
    },
    {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: square(-87.8, 41.74, 0.1) },
      properties: { layer: "airspace", class: "C", name: "CHICAGO MIDWAY CLASS C", floor_ft: 0, floor_ref: "SFC", ceiling_ft: 4800 },
    },
  ],
};

test("in 3D the airspace stands between its floors and ceilings, and flat again it lies on the chart", async ({ page }) => {
  await page.route(
    (url) => url.pathname.endsWith("/airspace/volumes"),
    (route) => route.fulfill({ json: VOLUMES }),
  );
  await setMap3d(page, true);
  // Over Chicago: O'Hare's Class B and Midway's Class C.
  await page.goto("/app/plan?dep=KDPA&dest=KPWK");
  await settle(page);
  await expect(map(page)).toHaveAttribute("data-terrain", "3d", { timeout: slow(20_000) });
  await expect.poll(() => map(page).getAttribute("data-layers"), { timeout: slow(20_000) }).toContain("airspace-3d-labels");
  // Each shelf's altitudes at its top, as the sectional writes them ("100" over "SFC").
  await expect.poll(() => map(page).getAttribute("data-layers")).toContain("airspace-3d-shelves");
  await expect
    .poll(async () => Number((await map(page).getAttribute("data-airspace3d")) ?? 0), { timeout: slow(60_000) })
    .toBeGreaterThan(0);

  await setMap3d(page, false);
  await page.goto("/app/plan?dep=KDPA&dest=KPWK");
  await settle(page);
  await expect.poll(() => map(page).getAttribute("data-layers")).not.toContain("airspace-3d-labels");
  await expect(map(page)).not.toHaveAttribute("data-airspace3d");
});
