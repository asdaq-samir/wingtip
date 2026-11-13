import { expect, type Page } from "@playwright/test";
import { mapStill, searchAirports, settle, sheetUpToType, showTabs, sideDrawer, slow } from "./helpers";
import type { Back } from "./cardTable";
import { noCheckpoints } from "./startState";

/* The ways cardTable's rows open their cards, the stubs they need, and the
 * checks' own probes: where a close went back to, a card's scroller, and
 * whether a control is on screen and takes a tap. */

export const ROUTE = "/app/plan?dep=C81&dest=KDLH";

/** The traffic and an airliner's flight, stubbed (tracking.spec's sky, the few fields a card needs). */
export async function sky(page: Page) {
  const ual = {
    hex: "a0b7d8",
    callsign: "UAL2088",
    registration: "N14511",
    type: "A21N",
    lat: 42.35,
    lon: -88.0,
    altitude_ft: 7000,
    pressure_altitude: false,
    track_deg: 90,
    speed_kt: 250,
    vertical_fpm: -1200,
    seen_s: 0.5,
    squawk: "3324",
  };
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/traffic"),
    (route) => route.fulfill({ json: { aircraft: [ual], age_s: 2, source: "adsb.lol", license: "ODbL 1.0" } }),
  );
  await page.route(
    (url) => url.pathname.startsWith("/api/planner/traffic/flight/"),
    (route) => route.fulfill({ json: { hex: "a0b7d8", registration: "N14511", type: "A21N", trail: [] } }),
  );
  await page.route(
    (url) => url.hostname === "api.planespotters.net",
    (route) => route.fulfill({ json: { photos: [] } }),
  );
}

/** Find Nearby's answer, stubbed: one field (stops-sheet.spec's shape). */
export async function nearbyStops(page: Page) {
  const field = {
    ident: "KAAA",
    name: "ALPHA MUNI",
    city: "ALPHA",
    lat: 42.4,
    lon: -88.0,
    distance_nm: 12.4,
    bearing_deg: 10,
    departure: "C81",
    added_nm: 2,
    off_nm: 1,
    phone: null,
    fuel_types: ["100LL"],
    airframe_repair: null,
    powerplant_repair: null,
    food: [],
    training: [],
    places_known: true,
  };
  await page.route(
    (url) => url.pathname.endsWith("/stops/near") || url.pathname.endsWith("/stops/along"),
    (route) => route.fulfill({ json: { pending: 0, fields: [field] } }),
  );
}

export async function go(page: Page, url: string) {
  await page.goto(url);
  await settle(page);
}

/** The one search typed, and its first row of `group`'s picked. */
export async function pick(page: Page, typed: string, row: "airport" | "waypoint") {
  await go(page, "/app/plan");
  await showTabs(page);
  await sheetUpToType(page);
  await page.getByTestId("search-airports").fill(typed);
  const rows = row === "airport" ? searchAirports(page) : sideDrawer(page).getByTestId("search-waypoint");
  await expect(rows.first()).toBeVisible({ timeout: slow(10_000) });
  await rows.first().click();
}

/** A route leg tapped beside its line (route-leg.spec's way: 16 off it,
 *  inside the finger's 22), at a place on it clear of the route's marks --
 *  its fields and checkpoints, each a marker of its own whose tap opens
 *  its own card, and the middle of the last leg is often one. */
export async function tapLeg(page: Page) {
  await noCheckpoints(page);
  await go(page, ROUTE);
  const spots = () =>
    page.evaluate(() => {
      const map = document.querySelector<HTMLElement>(".maplibregl-map")!;
      const r = map.getBoundingClientRect();
      const rows = JSON.parse(map.querySelector("[data-route-legs]")?.getAttribute("data-route-legs") ?? "[]") as {
        legs: { ends: number[][] }[];
      }[];
      // The marks a tap would take: the markers' (own ship), and the app's
      // own drawn on the canvas, each a mark's 26 across round its point
      // (useGlSymbols' probes; one MapLibre's collision left out is not).
      const marks = [...map.querySelectorAll<HTMLElement>(".maplibregl-marker")]
        .map((m) => m.getBoundingClientRect())
        .filter((b) => b.width > 0);
      for (const name of ["route-marks", "leg-points", "fuel-stops", "stop-fields", "procedure-fixes", "route-way-chips", "wx-marks"]) {
        const probe = map.querySelector<HTMLElement>(`[data-gl-probe="${name}"]`);
        for (const m of JSON.parse(probe?.getAttribute(`data-${name}`) ?? "[]") as { x: number; y: number }[])
          marks.push(new DOMRect(r.left + m.x - 13, r.top + m.y - 13, 26, 26));
      }
      // And the chart's airports (AirportsGl's probe), within a near
      // miss's reach: a tap by one opened its card under the leg's, which
      // then took the tap on the head.
      const fields = (
        JSON.parse(map.querySelector("[data-airport-marks]")?.getAttribute("data-airport-marks") ?? "[]") as { x: number; y: number }[]
      ).map((m) => ({ x: r.left + m.x, y: r.top + m.y }));
      // What of the map is not under the panel: a phone's sheet, a desktop's side panel.
      const panel = document.querySelector<HTMLElement>('[data-slot="map-panel"]')?.getBoundingClientRect();
      const under = (x: number, y: number) =>
        !!panel && x > panel.left - 8 && x < panel.right + 8 && y > panel.top - 8 && y < panel.bottom + 8;
      const out: { x: number; y: number }[] = [];
      // The longest legs first: a short one's middle is within a reach of its ends.
      const legs = (rows[0]?.legs ?? []).map((leg) => ({
        a: [r.left + leg.ends[0]![0]!, r.top + leg.ends[0]![1]!],
        b: [r.left + leg.ends[1]![0]!, r.top + leg.ends[1]![1]!],
      }));
      legs.sort((p, q) => Math.hypot(q.b[0]! - q.a[0]!, q.b[1]! - q.a[1]!) - Math.hypot(p.b[0]! - p.a[0]!, p.b[1]! - p.a[1]!));
      for (const { a, b } of legs) {
        const len = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!) || 1;
        const nx = -(b[1]! - a[1]!) / len,
          ny = (b[0]! - a[0]!) / len;
        for (const f of [0.5, 0.35, 0.65, 0.2, 0.8]) {
          const x = a[0]! + (b[0]! - a[0]!) * f + nx * 16,
            y = a[1]! + (b[1]! - a[1]!) * f + ny * 16;
          if (x < 8 || x > innerWidth - 8 || y < 8 || y > innerHeight - 8 || under(x, y)) continue;
          // Clear of each by more than a near miss's reach (22) round its box.
          if (
            marks.every((m) => x < m.left - 30 || x > m.right + 30 || y < m.top - 30 || y > m.bottom + 30) &&
            fields.every((m) => Math.hypot(x - m.x, y - m.y) > 24)
          )
            out.push({ x, y });
        }
      }
      return out;
    });
  await expect.poll(async () => (await spots()).length, { timeout: slow(30_000) }).toBeGreaterThan(0);
  await expect(async () => {
    await mapStill(page);
    const at = (await spots())[0]!;
    await page.mouse.click(at.x, at.y);
    await expect(page.getByTestId("route-leg-card")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: slow(20_000) });
}

/** A card's close back where it came from. */
export async function expectBack(page: Page, back: Back) {
  const panel = sideDrawer(page);
  if (back === "search") await expect(page.getByTestId("search-airports")).toBeVisible();
  if (back === "search-home") await expect(panel.getByTestId("search-home").or(page.getByTestId("search-airports")).first()).toBeVisible();
  // FPL: its route's row, or at the pill its figures in the row's place
  // (the owner, 2026-11-11, the canvas's b; sheet-page-toggle.spec).
  if (back === "plan")
    await expect(
      panel
        .getByTestId("route-box")
        .or(panel.getByTestId("route-line"))
        .or(page.getByTestId("panel-foot"))
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
  if (back === "console") await expect(page.getByTestId("console-sheet")).toBeVisible();
  if (back === "traffic") await expect(page.getByTestId("aircraft-search")).toBeVisible();
  if (back === "profile") await expect(page.getByTestId("profile-card")).toBeVisible();
}

/** The scroller of a card: the first element in it that scrolls up and
 *  down (a list of its own, StopsCard's), else the one scroller it is laid
 *  out in -- its own drawer's (CardStack's data-sheet-scroll, inside the
 *  card's popup where the test id is on the popup, a SheetCard's), or the
 *  sheet's for a page of the plan (SheetParts'). */
export async function scrollOf(page: Page, card: string, to?: number | "end") {
  return page.getByTestId(card).evaluate((root, y) => {
    const all = [root, ...root.querySelectorAll<HTMLElement>("*")];
    const box =
      all.find((el) => ["auto", "scroll"].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1) ??
      root.closest<HTMLElement>("[data-sheet-scroll]") ??
      root.querySelector<HTMLElement>("[data-sheet-scroll]");
    if (!box) return { top: -1, max: 0 };
    if (y != null) box.scrollTo({ top: y === "end" ? box.scrollHeight : y });
    return { top: box.scrollTop, max: box.scrollHeight - box.clientHeight };
  }, to ?? null);
}

/** Whether one of the test ids is on screen and the topmost thing at its middle (a tap lands on it). */
export async function hittable(page: Page, ids: string[]) {
  return page.evaluate((testIds) => {
    for (const id of testIds) {
      for (const el of document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.bottom <= 0 || r.top >= innerHeight) continue;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (hit && el.contains(hit)) return id;
      }
    }
    return null;
  }, ids);
}

/** The top of the scroller a card is laid out in (scrollOf's), where its
 *  pinned head sticks: its own drawer's, or the sheet's. */
export async function contentTop(page: Page, card: string) {
  return page
    .getByTestId(card)
    .first()
    .evaluate((root) => {
      const box = root.closest("[data-sheet-scroll]") ?? root.querySelector("[data-sheet-scroll]");
      return box ? box.getBoundingClientRect().y : Number.NaN;
    });
}

/** Whether a card is a nested drawer over the map's sheet: in a card's
 *  popup (CardStack's data-sheet-card) inside the sheet's, which Base UI
 *  marks while a nested drawer is open. */
export async function nestedOverSheet(page: Page, card: string) {
  return page
    .getByTestId(card)
    .first()
    .evaluate((root) => {
      const frame = root.closest("[data-sheet-card]");
      const sheet = frame?.parentElement?.closest('[data-slot="map-panel"]');
      return !!frame && !!sheet && sheet.hasAttribute("data-nested-drawer-open");
    });
}
