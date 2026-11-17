import { expect, type Locator, type Page } from "@playwright/test";
import { slow } from "./sheetHelpers";

/** Once the map has stopped moving: not moving now nor 300 ms before
 *  (GlMapShell's data-moving). A route being fitted, or a card
 *  moving the map to keep the route clear of the panel, moves it after
 *  the page looks settled. */
export async function mapStill(page: Page) {
  await expect
    .poll(
      () =>
        page
          .getByTestId("gl-map")
          .first()
          .evaluate(async (map) => {
            const before = (map as HTMLElement).dataset.moving;
            await new Promise((r) => setTimeout(r, 300));
            return before === undefined && (map as HTMLElement).dataset.moving === undefined;
          }),
      { timeout: slow(10000) },
    )
    .toBe(true);
}

/** A tap on the chart itself, somewhere nothing else is: not a marker,
 *  a popup, the panel over the map or its buttons -- found by asking the
 *  browser what is under each candidate point. */
export async function tapTheChart(page: Page) {
  // Once the map is still: a spot found empty in a move had a field's
  // chip slide under it before the tap (KCWI, on CI's desktop).
  await mapStill(page);
  const at = await page
    .locator(".maplibregl-map")
    .first()
    .evaluate((map) => {
      const r = map.getBoundingClientRect();
      // Clear of every mark by more than a near miss (a 44-point target),
      // which a tap there would select: the markers' (own ship), and those drawn on the canvas -- the airports, the VORs
      // and fixes, the route's own marks, the weather's -- each a mark's 26
      // across round where its probe says it is (useGlProbe).
      const marks = [...map.querySelectorAll(".maplibregl-marker")].map((m) => m.getBoundingClientRect());
      for (const probe of map.querySelectorAll<HTMLElement>("[data-gl-probe]")) {
        const name = probe.dataset.glProbe!;
        for (const m of JSON.parse(probe.getAttribute(`data-${name}`) ?? "[]") as { x?: number; y?: number }[]) {
          if (typeof m.x === "number" && typeof m.y === "number") marks.push(new DOMRect(r.left + m.x - 13, r.top + m.y - 13, 26, 26));
        }
      }
      // And clear of the course, whose legs a tap within 22 opens (RouteGl's
      // route-legs probe: each leg's ends on the screen).
      const legs = (
        JSON.parse(map.querySelector("[data-route-legs]")?.getAttribute("data-route-legs") ?? "[]") as {
          legs: { ends: [number, number][] }[];
        }[]
      )
        .flatMap((row) => row.legs)
        .map((l) => l.ends.map(([x, y]) => ({ x: r.left + x, y: r.top + y })));
      const offLine = (x: number, y: number) =>
        legs.every(([a, b]) => {
          const dx = b!.x - a!.x,
            dy = b!.y - a!.y,
            l2 = dx * dx + dy * dy;
          const t = l2 ? Math.max(0, Math.min(1, ((x - a!.x) * dx + (y - a!.y) * dy) / l2)) : 0;
          return Math.hypot(x - (a!.x + t * dx), y - (a!.y + t * dy)) > 30;
        });
      const clear = (x: number, y: number) =>
        offLine(x, y) && marks.every((m) => x < m.left - 30 || x > m.right + 30 || y < m.top - 30 || y > m.bottom + 30);
      for (let fy = 0.85; fy > 0.1; fy -= 0.1) {
        for (let fx = 0.15; fx < 0.9; fx += 0.1) {
          const x = r.left + r.width * fx,
            y = r.top + r.height * fy;
          const hit = document.elementFromPoint(x, y);
          if (hit && map.contains(hit) && clear(x, y) && hit.matches("canvas.maplibregl-canvas")) return { x, y };
        }
      }
      return null;
    });
  expect(at, "somewhere on the chart with nothing on it").not.toBeNull();
  await page.mouse.click(at!.x, at!.y);
}

/** A tap on the chart a little off a mark: 16 points from its middle,
 *  inside a near miss's 22 (AirportsLayer) and clear of the mark's own 26,
 *  on a side with nothing else under the finger. Not to the right, where
 *  an airport's ident is. Measured and tapped again until the address is
 *  `opens`: a card opening flies the map to its field and moves it again
 *  as the panel settles, and on CI's runners the mark moved from under a
 *  tap measured between the two (PR #238, three tries of three). */
export async function tapNear(page: Page, mark: Locator | (() => Promise<{ x: number; y: number } | null>), opens: RegExp) {
  await expect(async () => {
    await mapStill(page);
    // A drawn airport's point (airportMark), or a marker's middle.
    let middle: { x: number; y: number };
    if (typeof mark === "function") {
      const point = await mark();
      expect(point, "the mark drawn").not.toBeNull();
      middle = point!;
    } else {
      const box = (await mark.boundingBox())!;
      middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }
    const at = await page.evaluate(
      ([x, y]) => {
        // Then a ring of points 14 and 18 out: what is drawn round a route's
        // field -- its traffic pattern, from the first plan since the planner
        // picks its runway -- covered all seven fixed ones round C81 on CI's
        // runners (places.spec, both projects, three tries of three).
        const ring: number[][] = [
          [0, 16],
          [-16, 0],
          [0, -16],
          [-11, 11],
          [-11, -11],
          [11, 11],
          [11, -11],
        ];
        for (const r of [14, 18])
          for (let a = 0; a < 360; a += 30)
            ring.push([Math.round(r * Math.sin((a * Math.PI) / 180)), Math.round(r * Math.cos((a * Math.PI) / 180))]);
        for (const [dx, dy] of ring) {
          const hit = document.elementFromPoint(x! + dx!, y! + dy!);
          if (hit?.matches("canvas.maplibregl-canvas")) return { x: x! + dx!, y: y! + dy! };
        }
        return null;
      },
      [middle.x, middle.y],
    );
    expect(at, "the chart beside the mark, nothing else there").not.toBeNull();
    await page.mouse.click(at!.x, at!.y);
    await expect(page).toHaveURL(opens, { timeout: 2000 });
  }).toPass({ timeout: slow(20_000) });
}

/** A chart airport as the map drew it (AirportsGl's probe,
 *  `data-airport-marks`): its ident, where it is on the page, whether it
 *  wears its mark (`chip`) and the mark's airspace, use and weather colour. */
interface DrawnAirport {
  ident: string;
  x: number;
  y: number;
  chip: boolean;
  space: string;
  use: string;
  weather: string;
}

/** Every chart airport drawn now, on the page's own pixels: the Class B,
 *  C and D fields' canvas and the others' (AirportsLayer). */
export async function airportMarks(page: Page): Promise<DrawnAirport[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-airport-marks]")].flatMap((c) => {
      const r = c.closest(".maplibregl-map")!.getBoundingClientRect();
      const drawn = JSON.parse(c.getAttribute("data-airport-marks") ?? "[]") as { x: number; y: number }[];
      return drawn.map((m) => ({ ...m, x: m.x + r.left, y: m.y + r.top }));
    }),
  ) as Promise<DrawnAirport[]>;
}

/** The VFR waypoints drawn on the map (WaypointsGl's probe), in the page's own points. */
export async function waypointMarks(page: Page): Promise<{ ident: string; x: number; y: number }[]> {
  return page.evaluate(() => {
    const out: { ident: string; x: number; y: number }[] = [];
    for (const c of document.querySelectorAll<HTMLElement>("[data-navaid-marks]")) {
      const r = c.closest(".maplibregl-map")!.getBoundingClientRect();
      for (const m of JSON.parse(c.getAttribute("data-navaid-marks") ?? "[]") as { ident: string; kind: string; x: number; y: number }[]) {
        if (m.kind === "vfr") out.push({ ident: m.ident, x: m.x + r.left, y: m.y + r.top });
      }
    }
    return out;
  });
}

/** One chart airport drawn, by its ident; null while it is not. */
export async function airportMark(page: Page, ident: string): Promise<DrawnAirport | null> {
  return (await airportMarks(page)).find((m) => m.ident === ident) ?? null;
}

/** What a map layer has drawn now, as its probe records it (useGlProbe):
 *  each feature's fields and, for a point or an area, where it is on the
 *  map in the map's own points. */
export async function drawn(page: Page, name: string): Promise<Record<string, unknown>[]> {
  return page.evaluate(
    (n) =>
      [...document.querySelectorAll<HTMLElement>(`[data-gl-probe="${n}"]`)].flatMap(
        (p) => JSON.parse(p.getAttribute(`data-${n}`) ?? "[]") as Record<string, unknown>[],
      ),
    name,
  );
}

/** The level of the chart's tiles the map draws now (ChartGl's
 *  data-chart-zoom), NaN before the chart is up. */
export async function chartZoom(page: Page): Promise<number> {
  return Number(await page.getByTestId("gl-map").first().getAttribute("data-chart-zoom"));
}
