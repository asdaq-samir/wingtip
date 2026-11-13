import { expect, type Page } from "@playwright/test";
import { airportMarks, mapStill, settle, sideDrawer, slow } from "./helpers";
import { mapZoom, wheelIn } from "./mapZoom";
import { appMarks, markWith } from "./marks";

/* The airport card's specs' own parts (places.spec): the card, its answer
 * stubbed with the weather a test gives, a TAF made for the hour, the
 * private fields drawn, and an airport on the chart clear to tap. */

export const card = (page: Page) => sideDrawer(page).getByTestId("place-card");

/** The card's answer for `ident` with its weather as given: its own
 *  report, or none and the nearest station's; its TAF too where the test gives one, none where it gives null. */
export async function cardWeather(
  page: Page,
  ident: string,
  weather: { metar?: object | null; nearby_metar?: object | null; modelled_weather?: object | null; taf?: string | null },
) {
  await page.route(
    (url) => url.pathname.endsWith(`/api/planner/airport/${ident}`),
    async (route) => {
      const answer = await route.fetch();
      // Nothing modelled unless the test says: NOMADS' hour is not the suite's.
      await route.fulfill({
        response: answer,
        json: { ...(await answer.json()), weather_unavailable: false, modelled_weather: null, ...weather },
      });
    },
  );
}

/** A TAF for KDLH issued this hour, for a day: fair until an FM group in
 *  three hours brings a broken layer at 2,500 ft, 5 sm in rain and gusts
 *  to 22 kt (MVFR), and another three hours on fair again. Its times are
 *  day and hour in UTC, as a TAF's are. */
export function tafFromNow(now = new Date()): string {
  const two = (n: number) => String(n).padStart(2, "0");
  const hour = Math.floor(now.getTime() / 3_600_000) * 3_600_000;
  const at = (h: number) => {
    const d = new Date(hour + h * 3_600_000);
    return `${two(d.getUTCDate())}${two(d.getUTCHours())}`;
  };
  return `TAF KDLH ${at(0)}00Z ${at(0)}/${at(24)} 27010KT P6SM SCT050 FM${at(3)}00 29015G22KT 5SM -RA BKN025 FM${at(6)}00 31010KT P6SM SCT040`;
}

/** The private fields drawn as well, off by default since 2026-10-27:
 *  round C81 most of the fields on the chart are private strips. */
export async function withPrivateFields(page: Page) {
  await page.addInitScript(() => {
    const kept = JSON.parse(localStorage.getItem("wingtip.preferences") ?? "null") ?? { state: {}, version: 1 };
    localStorage.setItem("wingtip.preferences", JSON.stringify({ ...kept, state: { ...kept.state, privateFields: true } }));
  });
}

/** Closer in over the departure, where the chart's airports are drawn big
 *  enough to tap -- the wheel over its marker, a level at a time (Leaflet
 *  zooms about the cursor, so C81 stays under it) -- and where one is
 *  whose middle nothing else covers: not the route's own marker, not the
 *  panel. */
export async function airportToTap(page: Page) {
  // Once the map has stopped: the panel coming back to rest fits the route
  // again (MapShell), and a wheel turned while it flies is lost to it.
  await mapStill(page);
  const departure = markWith(page, "route-marks", "C81");
  await expect.poll(departure, { timeout: slow(30000) }).not.toBeNull();
  // The departure to the middle of the map first: with the whole route
  // fitted to a phone it sits just above the capsule, and the airports
  // round it closer in were under the capsule and the route's markers.
  const viewport = page.viewportSize()!;
  let box = (await departure())!;
  const middle = { x: viewport.width / 2, y: viewport.height * 0.4 };
  const from = { x: box.x, y: box.y };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(middle.x, middle.y, { steps: 10 });
  await page.mouse.up();
  await mapStill(page);
  box = (await departure())!;
  await page.mouse.move(box.x, box.y);
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, -60);
    await page.waitForTimeout(400);
  }
  // Its chip, or this close in, its grey one for no report; further out
  // the field's place on the chart, which a tap opens all the same (the
  // canvas's marks, AirportCanvas).
  await expect.poll(async () => (await airportMarks(page)).length, { timeout: slow(20000) }).toBeGreaterThan(1);
  // And until they have all come: the view's own answer redraws them, and
  // a tap as it does lands on the chart.
  let drawn = -1;
  await expect(async () => {
    const now = (await airportMarks(page)).length;
    const still = now === drawn;
    drawn = now;
    await page.waitForTimeout(500);
    expect(still).toBe(true);
  }).toPass({ timeout: slow(15_000) });
  // One whose middle nothing else covers -- the chart itself under it, no
  // marker, control or route mark -- asked again while the map draws.
  const find = async () => {
    const own = await appMarks(page);
    const marks = (await airportMarks(page)).filter((m) => m.x > 20 && m.y > 20 && own.every((o) => Math.hypot(o.x - m.x, o.y - m.y) > 30));
    return page.evaluate(
      (points) => {
        for (const { x, y } of points) {
          // The chart under it, or a line a tap passes through to the map
          // (the course line's): no marker, control, popup or panel, which
          // would take the tap.
          // The map's canvas answers where nothing is drawn over it.
          const hit = document.elementFromPoint(x, y);
          if (
            hit?.closest(".maplibregl-map") &&
            !hit.closest(".maplibregl-marker, .maplibregl-ctrl, [data-slot=map-panel], [data-map-controls]")
          )
            return { x, y };
        }
        return null;
      },
      marks.map((m) => ({ x: m.x, y: m.y })),
    );
  };
  await expect.poll(find, { timeout: slow(10000), message: "an airport on the chart with nothing over it" }).not.toBeNull();
  const at = await find();
  expect(at, "an airport on the chart with nothing over it").not.toBeNull();
  return at!;
}

/** A field's card opened from the address, and the map brought in round
 *  it to `level`, the wheel over the map's middle above the sheet (or
 *  beside the side panel): the card opens the map at 9 (GlMapShell's
 *  PLACE_ZOOM) wherever it was. */
export async function closeInOn(page: Page, ident: string, level: number) {
  await page.goto(`/app/plan?place=${ident}`);
  await settle(page);
  await mapStill(page);
  const map = (await page.locator(".maplibregl-map").boundingBox())!;
  const at = await page.evaluate(() => {
    const panel = document.querySelector('[data-slot="map-panel"]')?.getBoundingClientRect();
    const m = document.querySelector(".maplibregl-map")!.getBoundingClientRect();
    if (panel && panel.width > m.width * 0.8) return { x: m.left + m.width / 2, y: m.top + (panel.top - m.top) / 2 };
    if (panel) return { x: panel.right + (m.right - panel.right) / 2, y: m.top + m.height / 2 };
    return { x: m.left + m.width / 2, y: m.top + m.height / 2 };
  });
  expect(at.x).toBeGreaterThan(map.x);
  await wheelIn(
    page,
    async () => at,
    async () => (await mapZoom(page)) >= level,
  );
}

/** The planner's answer to the one search held back until the release
 *  returned: the one search asks it for the waypoints too (fixes=true),
 *  and its answer brings its own airports with it (useAirportSearch), so
 *  held, what shows is the answer the phone gives as it is typed. */
export async function holdPlannerSearch(page: Page): Promise<() => void> {
  let release = () => {};
  const held = new Promise<void>((go) => {
    release = go;
  });
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airports/search"),
    async (route) => {
      await held;
      await route.abort();
    },
  );
  return release;
}
