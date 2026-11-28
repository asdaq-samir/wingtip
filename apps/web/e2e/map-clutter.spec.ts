import { test, expect, type Page } from "@playwright/test";
import { mapStill, settle } from "./helpers";
import { drawnMarks } from "./marks";
import { pickAirplane } from "./startState";
test.beforeEach(({ page }) => pickAirplane(page)); // its tops of climb and descent

/**
 * The map over the whole country with a coast-to-coast route (the owner's
 * iPhone screenshot, 2026-11-23: KUGN west to KLAS, its TOD's pill, a
 * plate's tags and every Class B field's ring and ident piled on the
 * route's own names). Out there the route is its line, its ends and its
 * stops, named clear of each other and of own ship; its tops of climb and
 * descent from map.zoom.route-tags (6), the Class B fields named from
 * class-b-named (5).
 */

const ROUTE = "/app/plan?dep=KUGN&dest=KLAS&stops=KAHQ,KLXV";

/** The map put at an app level over a point, as a pinch would leave it
 *  (the app's level is MapLibre's plus one, glStyle's glZoom). */
async function zoomTo(page: Page, level: number, lon: number, lat: number) {
  await page.evaluate(
    ([z, x, y]) => {
      const maps = (window as unknown as { __wingtipMaps?: { jumpTo: (o: object) => void }[] }).__wingtipMaps ?? [];
      maps.at(-1)?.jumpTo({ zoom: z! - 1, center: [x, y] });
    },
    [level, lon, lat],
  );
  await mapStill(page);
}

const fieldIdents = async (page: Page) =>
  (await drawnMarks(page, "route-marks")).filter((m) => m.kind === "field").map((m) => String(m.text));

test("over the whole country the route's ends are named and its tops of climb and descent are not", async ({ page }) => {
  await page.goto(ROUTE);
  await settle(page);
  await zoomTo(page, 4, -98, 38);
  // Each end named, each on its pill clear of the others (MapLibre leaves
  // out a pill it cannot place; an end's is placed first).
  await expect.poll(() => fieldIdents(page)).toEqual(expect.arrayContaining(["KUGN", "KLAS"]));
  expect(await drawnMarks(page, "leg-points")).toEqual([]);
  // Closer in, a leg long enough to read: its TOC and TOD come back.
  await zoomTo(page, 7, -100, 41);
  await expect.poll(async () => (await drawnMarks(page, "leg-points")).length).toBeGreaterThan(0);
});

test("a route field's pill goes outside the course's turn, off the leg", async ({ page }) => {
  await page.goto(ROUTE);
  await settle(page);
  await zoomTo(page, 6, -96.6, 41.2);
  // Wahoo, where the course from Waukegan bends south-west: the pill
  // above the field, not east of it along the leg it came in on.
  // A field's mark carries `out`, the angle outside the turn (degrees
  // clockwise from up), and its ident goes on the nearest of four sides
  // (routeMarks' fieldSide, its one line here).
  const side = (deg: number) => (["bottom", "left", "top", "right"] as const)[Math.round((((deg % 360) + 360) % 360) / 90) % 4];
  await expect
    .poll(async () => {
      const out = (await drawnMarks(page, "route-marks")).find((m) => m.text === "KAHQ")?.out;
      return out == null ? null : side(Number(out));
    })
    .toBe("bottom");
});
