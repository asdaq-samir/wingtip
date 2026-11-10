import { expect, type Page } from "@playwright/test";
import { mapStill, searchAirports, settle, showTabs, sideDrawer, slow } from "./helpers";
import type { Back } from "./cardTable";

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
  await page.getByTestId("search-airports").fill(typed);
  const rows = row === "airport" ? searchAirports(page) : sideDrawer(page).getByTestId("search-waypoint");
  await expect(rows.first()).toBeVisible({ timeout: slow(10_000) });
  await rows.first().click();
}

/** The route's last leg tapped beside its line (route-leg.spec's way). */
export async function tapLeg(page: Page) {
  await go(page, ROUTE);
  const legs = () =>
    page
      .locator(".maplibregl-map")
      .first()
      .evaluate((map) => {
        const r = map.getBoundingClientRect();
        const rows = JSON.parse(map.querySelector("[data-route-legs]")?.getAttribute("data-route-legs") ?? "[]") as {
          legs: { ends: number[][] }[];
        }[];
        return (rows[0]?.legs ?? []).map((l) => ({
          a: [r.left + l.ends[0]![0]!, r.top + l.ends[0]![1]!],
          b: [r.left + l.ends[1]![0]!, r.top + l.ends[1]![1]!],
        }));
      });
  await expect.poll(async () => (await legs()).length, { timeout: slow(30_000) }).toBeGreaterThan(0);
  await expect(async () => {
    await mapStill(page);
    const { a, b } = (await legs()).at(-1)!;
    const len = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!) || 1;
    const nx = -(b[1]! - a[1]!) / len,
      ny = (b[0]! - a[0]!) / len;
    await page.mouse.click((a[0]! + b[0]!) / 2 + nx * 16, (a[1]! + b[1]!) / 2 + ny * 16);
    await expect(page.getByTestId("route-leg-card")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: slow(20_000) });
}

/** A card's close back where it came from. */
export async function expectBack(page: Page, back: Back) {
  const panel = sideDrawer(page);
  if (back === "search") await expect(page.getByTestId("search-airports")).toBeVisible();
  if (back === "search-home") await expect(panel.getByTestId("search-home").or(page.getByTestId("search-airports")).first()).toBeVisible();
  if (back === "plan") await expect(panel.getByTestId("route-box").or(panel.getByTestId("route-line")).first()).toBeVisible();
  if (back === "console") await expect(page.getByTestId("console-sheet")).toBeVisible();
}

/** The scroller of a card: the card itself or the first element in it that scrolls up and down. */
export async function scrollOf(page: Page, card: string, to?: number | "end") {
  return page.getByTestId(card).evaluate((root, y) => {
    const all = [root, ...root.querySelectorAll<HTMLElement>("*")];
    const box =
      all.find((el) => ["auto", "scroll"].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1) ?? null;
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
