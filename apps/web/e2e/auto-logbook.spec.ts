import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { openPanel, openProfile, pressDryRunStart, settle, sideDrawer, slow } from "./helpers";
import { pickAirplane } from "./startState";

/**
 * The automatic logbook (features/logbook-auto): own ship's GPS records
 * the flight on this device, the engine reads it here and finds the
 * airplane landed and at rest (logbook_from_track's block), the planner
 * draws the entry from it (POST /api/logbook-draft), and the pilot logs
 * it -- never saved unasked. A dry run is no flight: what it flies is
 * never recorded.
 */

/** The shared C81 to KDLH flight the engine's and the unit tests read
 *  (lib/fixtures/logbookTrack.json): taxi, a hold at CHERL, two ILS RWY
 *  27s at KDLH, a touch-and-go and a night full stop, then at rest. */
const TRACK = JSON.parse(readFileSync(new URL("../src/lib/fixtures/logbookTrack.json", import.meta.url), "utf8")) as {
  points: { t: number; lat: number; lon: number; alt_ft: number | null }[];
};
/** Where the recorder keeps the track in the browser (recorder.ts). */
const KEPT = "wingtip.autolog.track";

/** The recorded track as the recorder wrote it down, from the page. */
const keptPoints = (page: Page) =>
  page.evaluate((key) => {
    // Written down as the page goes (recorder's pagehide), whatever the half minute.
    window.dispatchEvent(new Event("pagehide"));
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { points: unknown[] }).points.length : 0;
  }, KEPT);

/** Own ship on, its GPS a fix a second at rest on C81's ramp. */
async function gpsAtRest(page: Page) {
  await page.addInitScript(() => {
    const position = () =>
      ({
        coords: {
          latitude: 42.3221,
          longitude: -88.0741,
          accuracy: 10,
          heading: null,
          speed: 0,
          altitude: 240,
          altitudeAccuracy: 10,
          toJSON() {
            return this;
          },
        },
        timestamp: Date.now(),
        toJSON() {
          return this;
        },
      }) as unknown as GeolocationPosition;
    Geolocation.prototype.watchPosition = function (success: PositionCallback) {
      window.setTimeout(() => success(position()), 0);
      return window.setInterval(() => success(position()), 1000);
    };
    Geolocation.prototype.clearWatch = function (id: number) {
      window.clearInterval(id);
    };
    Geolocation.prototype.getCurrentPosition = function (success: PositionCallback) {
      window.setTimeout(() => success(position()), 0);
    };
    localStorage.setItem(
      "wingtip.ownship",
      JSON.stringify({ state: { enabled: true, follow: false, lastFix: { lat: 42.3221, lon: -88.0741 } }, version: 0 }),
    );
  });
}

test.beforeEach(({ page }) => pickAirplane(page));

test("a flight the GPS recorded, landed and at rest, is offered as a logbook entry and logged when the pilot says", async ({ page }) => {
  // The flight as the recorder kept it, once, before the page loads.
  await page.addInitScript(
    ({ key, points }) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem(key, JSON.stringify({ points, askedTo: null }));
    },
    { key: KEPT, points: TRACK.points },
  );
  // The entry logged is the gateway's to keep: answered here, so the
  // shared pilot's logbook (logbook.spec's) is left as it was.
  const logged: Record<string, unknown>[] = [];
  await page.route(
    (url) => url.pathname === "/api/logbook",
    (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const body = route.request().postDataJSON() as Record<string, unknown>;
      logged.push(body);
      return route.fulfill({ json: { id: 9001, ...body, flightId: null } });
    },
  );
  await page.route(
    (url) => /^\/api\/flights\/\d+\/track$/.test(url.pathname),
    (route) => route.fulfill({ status: 204 }),
  );
  await page.goto("/app/plan");
  await settle(page);

  const sheet = page.getByRole("dialog", { name: "Flight Logged" });
  await expect(sheet).toBeVisible({ timeout: slow(30_000) });
  // The planner's draft, drawn from the track: the route flown and its
  // landings, each changeable before it is logged.
  await expect(sheet.getByRole("textbox", { name: "Route" })).toHaveValue(/^C81 .*KDLH$/, { timeout: slow(30_000) });
  await expect(sheet).toContainText("Night, Full Stop");
  expect(logged).toHaveLength(0); // nothing saved unasked
  await sheet.getByRole("button", { name: "Log", exact: true }).click();
  await expect.poll(() => logged.length).toBe(1);
  expect(logged[0]).toMatchObject({ fromTrack: true });
  expect(String(logged[0]!.route)).toMatch(/^C81 .*KDLH$/);
  // Logged: said so, and the track let go from this device.
  await expect(sheet).toContainText("in your logbook");
  await expect.poll(() => keptPoints(page)).toBe(0);
});

test("the GPS's fixes are recorded, and a dry run's never are", async ({ page }) => {
  await gpsAtRest(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  // The GPS's first fix is recorded at once (one each 5 s after it).
  await expect.poll(() => keptPoints(page), { timeout: slow(15_000) }).toBeGreaterThan(0);

  await openPanel(page);
  await openProfile(page);
  const start = sideDrawer(page).getByTestId("dry-run-start");
  await expect(start).toBeVisible({ timeout: slow(60_000) });
  await pressDryRunStart(page, start);
  await expect(page.locator('[data-own-ship="on"]')).toHaveCount(1);
  const before = await keptPoints(page);
  // Twelve seconds of the run, two of the recorder's beats: nothing added.
  await page.waitForTimeout(12_000);
  expect(await keptPoints(page)).toBe(before);
  // And no flight offered for the logbook from it.
  await expect(page.getByRole("dialog", { name: "Flight Logged" })).toHaveCount(0);
});
