import { test, expect, type Page } from "@playwright/test";
import { closeProfile, grabberTo, openPanel, openProfile, settle, sideDrawer, slow, pressDryRunStart, frontSheet } from "./helpers";
import { pickAirplane } from "./startState";
test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

/**
 * Flying mode (useFlyingMode), the canvas's Flying screen: once own ship
 * is underway with a route -- here the planned flight's dry run, which
 * flies own ship (lib/map/position/ownShip's simulateFix) -- the next checkpoint is
 * over the map (FlyingHead), the map's buttons are 60 points with words
 * (MapControls), and the route's box and the tab bar are put away
 * (MapPanel's `flying`); the dry run closed, own ship is off and the
 * planner is back as it was. Done flying leaves it with one tap.
 */

const FLYING_PX = 60;

async function startDryRun(page: Page) {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await openProfile(page);
  const start = sideDrawer(page).getByTestId("dry-run-start");
  await expect(start).toBeVisible({ timeout: slow(60_000) });
  await pressDryRunStart(page, start);
  await expect(page.locator('[data-own-ship="on"]')).toHaveCount(1);
}

test("in flight the next checkpoint is over the map, the buttons are 60 points and the route box and tabs are away; closed, they return", async ({
  page,
}) => {
  await startDryRun(page);
  // The next checkpoint's card at the top; the sheet stays where it was,
  // a dry run's or a real flight's alike, the run's card's controls in sight.
  const head = page.getByTestId("flying-head");
  await expect(head).toBeVisible({ timeout: slow(10_000) });
  await expect(head.getByTestId("flying-next-name")).not.toBeEmpty();
  await expect(head.getByTestId("flying-next-figures")).toContainText("nm");
  await expect(frontSheet(page)).not.toHaveAttribute("data-panel", "peek");
  await expect(sideDrawer(page).getByTestId("dry-run-close")).toBeVisible();
  await expect(sideDrawer(page).getByTestId("route-box")).toBeHidden();
  await expect(sideDrawer(page).getByTestId("route-summary")).toBeHidden();
  await expect(sideDrawer(page).getByTestId("search-airports")).toBeHidden();
  await expect(page.getByTestId("done-flying")).toBeVisible();
  // The map's buttons: NRST, D→ and the location arrow at the right, the
  // microphone's circle over them in the same column (the owner,
  // 2026-11-13: the left column is the 3D's and the account button's), each 60 points.
  const buttons = [
    page.getByTestId("flying-nearest"),
    page.getByTestId("flying-direct"),
    page.locator("[data-map-controls]").getByTestId("my-position-button"),
    page.locator("[data-map-food]").getByTestId("radio-button"),
  ];
  for (const button of buttons) {
    await expect(button).toBeVisible();
    const box = (await button.boundingBox())!;
    const name = await button.getAttribute("data-testid");
    expect(Math.round(box.width), `${name}'s width`).toBe(FLYING_PX);
    expect(Math.round(box.height), `${name}'s height`).toBe(FLYING_PX);
  }
  await expect(page.getByTestId("map-settings-button")).toHaveCount(0);
  await expect(page.getByTestId("sheet-page-toggle")).toHaveCount(0);

  // The dry run closed from the Profile: on the ground at once, everything
  // back -- the small buttons, and at half FPL's page with the route's box,
  // and FPL's Search at its head's start, which goes in flight (docs/design/rules.md:
  // the search is the other page since 2026-11-13, not over the route; the
  // FPL toggle is on Search's page alone since 2026-11-21).
  await grabberTo(page, "half");
  await sideDrawer(page).getByTestId("dry-run-close").click();
  await expect(page.locator("[data-own-ship]")).toHaveCount(0);
  await expect(head).toHaveCount(0);
  await expect(page.getByTestId("flying-nearest")).toHaveCount(0);
  await expect(page.getByTestId("map-settings-button")).toBeVisible();
  const mic = (await page.locator("[data-map-food]").getByTestId("radio-button").boundingBox())!;
  expect(Math.round(mic.width)).toBeLessThan(FLYING_PX);
  await closeProfile(page);
  await grabberTo(page, "half");
  await expect(sideDrawer(page).getByTestId("route-summary").or(sideDrawer(page).getByTestId("route-box")).first()).toBeVisible();
  await expect(sideDrawer(page).getByTestId("fpl-search")).toBeVisible();
});

test("Done flying leaves flying mode with one tap while the airplane flies on", async ({ page }) => {
  await startDryRun(page);
  await expect(page.getByTestId("flying-head")).toBeVisible({ timeout: slow(10_000) });
  await page.getByTestId("done-flying").click();
  await expect(page.getByTestId("flying-head")).toHaveCount(0);
  await expect(page.getByTestId("flying-nearest")).toHaveCount(0);
  await expect(page.locator('[data-own-ship="on"]')).toHaveCount(1);
});

/** A GPS in the air at Campbell Airport (C81), going 120 kt on 090: every
 *  second the same fix, answered later as a real GPS answers. */
async function gpsFlying(page: Page) {
  await page.context().grantPermissions(["geolocation"]);
  await page.addInitScript(() => {
    const position = () =>
      ({
        coords: {
          latitude: 42.3246,
          longitude: -88.0741,
          accuracy: 10,
          heading: 90,
          speed: 120 / 1.943844, // 120 kt in m/s
          altitude: 914,
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
      JSON.stringify({ state: { enabled: true, follow: false, lastFix: { lat: 42.325, lon: -88.074 } }, version: 0 }),
    );
  });
}

test("from the GPS, the head gives the next checkpoint on the route and only Emergency off it", async ({ page }) => {
  // On the route: C81 is the departure, the airplane on its line.
  await gpsFlying(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const head = page.getByTestId("flying-head");
  await expect(head.getByTestId("flying-next-name")).not.toBeEmpty({ timeout: slow(60_000) });
  await expect(head).not.toHaveAttribute("data-off-route");

  // Off it: Rockford to Madison passes some 40 nm west of Campbell, past
  // the engine's on_route (in_flight), as the phones' instruments drop
  // their Next row. The way to Emergency stays.
  await page.goto("/app/plan?dep=KRFD&dest=KMSN");
  await settle(page);
  await expect(head).toHaveAttribute("data-off-route", "true", { timeout: slow(60_000) });
  await expect(head.getByTestId("flying-next-name")).toHaveCount(0);
  await expect(head.getByTestId("flying-next-figures")).toHaveCount(0);
  await expect(head.getByTestId("flying-emergency")).toBeVisible();
});

test("in flight the strip gives the phone's GPS altitude, to the nearest 10 ft", async ({ page }) => {
  // The fake fix is 914 m up: 2,998.7 ft, written 3,000 (the owner,
  // 2026-11-17: "true altitude of the phone from gps").
  await gpsFlying(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const gps = page.getByTestId("strip-gps-alt").first();
  await expect(gps).toContainText("3,000", { timeout: slow(60_000) });
  // No To in flight (the head over the map names the next point): the
  // distance, time, track and GPS altitude, four columns on one row, where
  // the altitude, a fifth in four, went onto a row of its own (the owner,
  // 2026-11-17).
  // The strip in sight: FPL's own copy, laid out at no width while the
  // sheet shows Search's page in flight, is not the pilot's.
  const strip = page
    .locator("dl")
    .filter({ has: page.getByTestId("strip-gps-alt") })
    .locator("visible=true")
    .first();
  await expect(strip.getByTestId("navlog-to")).toHaveCount(0);
  const tops = await strip.locator("dd").evaluateAll((dds) => dds.map((dd) => Math.round(dd.getBoundingClientRect().top)));
  expect(tops).toHaveLength(4);
  expect(new Set(tops).size).toBe(1);
  // The track in the fuel's place, magnetic: the GPS's true 090 less the
  // variation at Campbell, some 4 degrees west, so about 094, in three figures.
  await expect(strip.getByTestId("strip-track")).toHaveText(/^09[2-6]°$/);
  await expect(strip.getByTestId("navlog-fuel")).toHaveCount(0);
});
