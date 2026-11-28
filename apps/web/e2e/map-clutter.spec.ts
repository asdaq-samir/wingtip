import { test, expect, type Page } from "@playwright/test";
import { mapStill, settle, slow } from "./helpers";
import { drawnMarks } from "./marks";
import { noCheckpoints, pickAirplane } from "./startState";
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
  // The checkpoints off, as a pilot has them (lib/preferences; the suite's
  // session turns them on): each splits the legs at its own mark, which a
  // top of climb or descent gives way to (LegPointsGl), as in the owner's
  // screenshot they were not there.
  await noCheckpoints(page);
  await page.goto(ROUTE);
  await settle(page);
  // The map put there again until it holds: the planner adds the C172's
  // fuel stops to the route once its first plan is in (KFEP, KIML ...), and
  // the route's new points fit the map to it again, a second or two on here
  // and tens of seconds on CI's runner, where the fit came after the zoom
  // in and took the map out past where the tops are drawn (PR #591's run).
  const at = (level: number, lon: number, lat: number, drawn: () => Promise<unknown>) =>
    expect(async () => {
      await zoomTo(page, level, lon, lat);
      await drawn();
    }).toPass({ timeout: slow(60_000) });
  // Closer in, a leg long enough to read: its TOC and TOD are drawn, the
  // C172's round KAHQ, once the plan has them.
  await at(7, -98.5, 41, async () => expect((await drawnMarks(page, "leg-points")).length).toBeGreaterThan(0));
  // Out over the country: each end named, each on its pill clear of the
  // others (MapLibre leaves out a pill it cannot place; an end's is placed
  // first), and none of the tops.
  await at(4, -98, 38, async () => expect(await fieldIdents(page)).toEqual(expect.arrayContaining(["KUGN", "KLAS"])));
  expect(await drawnMarks(page, "leg-points")).toEqual([]);
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
