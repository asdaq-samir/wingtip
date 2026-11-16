import { test, expect } from "@playwright/test";
import {
  airportMarks,
  chartZoom,
  drawn,
  mapStill,
  openPanel,
  settle,
  sideDrawer,
  slow,
  tapTheChart,
  grabberTo,
  controlsInSight,
  openNavLog,
  navLogSheet,
} from "./helpers";
import { routeMenuSwitch } from "./mapCard";
import { drawnMarks, markWith, tapMark } from "./marks";
import { pickAirplane } from "./startState";
test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

/**
 * The map: its popups, its zoom toggle and the dev page's zoom button,
 * own ship when the map is panned, and a route with no map to draw.
 */

test("plan page: a route from an airport to itself is a local flight: the field's briefing, and the time aloft with its fuel check", async ({
  page,
}) => {
  // The pattern, practice approaches: it was refused, the page asking for
  // two different airports.
  await page.goto("/app/plan?dep=C81&dest=C81");
  await grabberTo(page, "full");
  await expect(sideDrawer(page).getByTestId("navlog-ete")).toHaveText("1h", { timeout: slow(30000) });
  // Its name as shown, "Aloft", and in full words to a screen reader
  // (FlightLine's dt: the shorthand hidden from it, the said words beside).
  const aloft = sideDrawer(page).locator('[data-slot="section-summary"] dt').nth(1);
  await expect(aloft.locator("[aria-hidden]")).toHaveText("Aloft");
  await expect(aloft.locator(".sr-only")).toHaveText("Time aloft, one hour");
  // Its fuel required among the figures.
  await expect(page.getByTestId("navlog-fuel")).toHaveText(/^\d+\.\d\s?gal$/, { timeout: slow(30000) });

  // Longer aloft: its chip in the pill, in the address, and more fuel.
  await controlsInSight(page);
  await page.getByTestId("local-duration").click();
  await page.getByRole("menuitemradio", { name: "2h", exact: true }).click();
  await expect(page).toHaveURL(/[?&]local_min=120/);
  await expect(sideDrawer(page).getByTestId("navlog-ete")).toHaveText("2h", { timeout: slow(30000) });
});

test("plan page: every popup the map opens dismisses the same way", async ({ page }) => {
  // They did not. The airport and checkpoint popups took Leaflet's
  // defaults; the Class B card set autoClose and closeOnClick off, so
  // on the same map the same gesture -- a tap on the chart -- dismissed
  // one and left the other sitting there, over the markers underneath
  // it, swallowing their clicks. `MapPopup` gives all of them one
  // dismissal, and this is the test that says so.
  // Class B on from the start, from the route's ••• menu.
  await routeMenuSwitch(page, "class-b-toggle", true);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await expect(page.locator("[data-chart-zoom]")).toBeAttached();
  const popups = page.locator(".maplibregl-popup");
  // A tap on the chart itself, where nothing is drawn: a fixed corner
  // had a Class B chip under it once the pin had flown the map to KORD.

  // The departure marker: a tap opens its card in the panel, as every
  // airport on the chart does -- it was a weather card over the chart --
  // and a tap on the chart puts it away. The card brings the map in to
  // the field, so the wheel takes it back out before KORD can be found.
  await tapMark(page, "route-marks", "C81");
  await expect(page.getByTestId("place-card")).toBeVisible({ timeout: slow(15000) });
  await expect(popups).toHaveCount(0);
  await tapTheChart(page);
  await expect(page.getByTestId("place-card")).toHaveCount(0);
  const map = (await page.locator(".maplibregl-map").boundingBox())!;
  await page.mouse.move(map.x + map.width / 2, map.y + map.height / 3);
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(400);
  }

  await expect.poll(markWith(page, "class-b-fields", "KORD"), { timeout: slow(25000) }).not.toBeNull();
  // A Class B mark opens the field's card in the panel, as every
  // airport on the chart does, not a popup of its own on the map.
  await tapMark(page, "class-b-fields", "KORD");
  await expect(page.getByTestId("place-card")).toBeVisible({ timeout: slow(15000) });
  await expect(popups).toHaveCount(0);

  // A tap on the chart puts it away, as it does every card.
  await tapTheChart(page);
  await expect(page.getByTestId("place-card")).toHaveCount(0);
});

test(
  "plan page: a checkpoint picked on the map brings the map in to it, so there is no zoom button",
  { tag: "@smoke" },
  async ({ page }) => {
    // The map's buttons had a zoom toggle between the whole route and the
    // selected point; picking a point already does the one, and the wheel
    // or a pinch the other.
    await page.goto("/app/plan?dep=C81&dest=KDLH");
    await settle(page);
    await expect(page.locator("[data-map-controls]")).toBeVisible();
    await expect(page.locator("[data-map-controls]").getByRole("button", { name: /zoom|fit route|show selected/i })).toHaveCount(0);
    const zoomOfTiles = () => chartZoom(page);
    const before = await zoomOfTiles();
    // A checkpoint drawn at this zoom: those without room for their dots
    // wait for the map to come in (RouteMap's useSpaced), and those a
    // higher mark covers are left out until then (MapLibre's collision).
    await tapMark(page, "route-marks", /^\d+$/);
    await expect.poll(zoomOfTiles, { timeout: slow(10000) }).toBeGreaterThan(before);
    await expect.poll(async () => (await drawn(page, "route-line")).length).toBeGreaterThan(0);
  },
);

test("plan page: panning the map with own ship off leaves 'Keep the map on me' as it was", async ({ page }) => {
  // `follow` is remembered per browser. A pan at the desk -- own ship
  // off, and over plain http it cannot even be turned on -- used to
  // store it off, so in the air the map no longer kept up and the
  // checkbox that says so was disabled.
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const follow = () => page.evaluate(() => JSON.parse(localStorage.getItem("wingtip.ownship") ?? "{}").state?.follow ?? true);
  expect(await follow()).toBe(true);

  const map = await page.locator(".maplibregl-map").boundingBox();
  if (!map) throw new Error("no map");
  await page.mouse.move(map.x + map.width / 2, map.y + map.height / 2);
  await page.mouse.down();
  await page.mouse.move(map.x + map.width / 2 + 120, map.y + map.height / 2 + 60, { steps: 8 });
  await page.mouse.up();

  expect(await follow()).toBe(true);
});

test("plan page: VFR Checkpoints draws the route's checkpoints and the landmarks they were chosen from at every zoom, and off leaves the course line alone", async ({
  page,
}) => {
  // They used to start at a zoom picked from a menu (close in, by
  // default), so a route zoomed out to its region showed a line and two
  // airports; the landmarks, from zoom 7.
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  // The badges the map shows: one a higher mark covers is left out
  // (MapLibre's collision).
  const numbered = async () => (await drawnMarks(page, "route-marks")).filter((m) => m.kind === "checkpoint").length;
  await expect.poll(numbered, { timeout: slow(60000) }).toBeGreaterThan(0);

  // Out to the zoom a whole region fits at: the tiles say which.
  const zoomOfTiles = () => chartZoom(page);
  const map = (await page.locator(".maplibregl-map").boundingBox())!;
  await page.mouse.move(map.x + map.width / 2, map.y + map.height / 2);
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(400);
  }
  await expect.poll(zoomOfTiles, { timeout: slow(10000) }).toBeLessThanOrEqual(5);
  // So far out the route is a few points across: its numbered dots give
  // way to its two airports' marks (RouteMap's useSpaced, 2026-10-26),
  // the landmarks still drawn.
  // The landmarks' dim dots, in their slate outline.
  await expect.poll(async () => (await drawn(page, "candidate-marks")).length).toBeGreaterThan(0);

  // Off, from the route's ••• menu's Checkpoints, and the route again:
  // no checkpoints on the map, none asked for, and the nav log from the
  // departure to the destination alone, as the pilot asked.
  await routeMenuSwitch(page, "waypoints-toggle", false);
  const asked: string[] = [];
  page.on("request", (r) => {
    if (/\/(checkpoints|navlog)\?/.test(r.url())) asked.push(new URL(r.url()).pathname.split("/").pop()!);
  });
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await expect.poll(markWith(page, "route-marks", "KDLH"), { timeout: slow(30000) }).not.toBeNull();
  expect(await numbered()).toBe(0);
  await expect.poll(async () => (await drawn(page, "candidate-marks")).length).toBe(0);
  await openPanel(page);
  await expect(page.getByTestId("navlog-fuel")).toBeAttached({ timeout: slow(60000) });
  await openNavLog(page);
  const rows = navLogSheet(page).locator('[role="row"][data-kind]');
  await expect(navLogSheet(page).locator('[role="row"][data-kind="checkpoint"]')).toHaveCount(0);
  expect(await rows.count()).toBeGreaterThan(0);
  expect(asked).not.toContain("checkpoints");
});

test("my position is the location arrow among the map's buttons, on both pages, and over plain http it says why there is none", async ({
  page,
}) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const arrow = page.locator("[data-map-controls]").getByTestId("my-position-button");
  await expect(arrow).toHaveAccessibleName("Show my position");
  await expect(arrow).toHaveAttribute("aria-pressed", "false");
  if (!(await page.evaluate(() => window.isSecureContext))) {
    await arrow.click();
    // An alert, with OK: something the pilot just did.
    const alert = page.getByTestId("error-alert");
    await expect(alert).toContainText("No position over this connection");
    // OK from md up; on a phone the sheet's close in its title row.
    await alert.getByRole("button", { name: /^(OK|Close)$/ }).click();
    await expect(alert).toHaveCount(0);
    await expect(arrow).toHaveAttribute("aria-pressed", "false");
  }
  // The training page's as well: its map is the same (MapShell).
  await page.goto("/app/dev?dep=C81&dest=KDLH");
  await settle(page);
  await expect(page.locator("[data-map-controls]").getByTestId("my-position-button")).toBeVisible();
});

test("the chart's airports keep coming in under a finger's pan, before it lets go", async ({ page }) => {
  // The owner's ask: "can you update the map even while panning ... until
  // I let go of the finger, the airports don't show up". The fields are
  // the overlay tiles' (the suite's archive reaches west of Chicago to
  // 91.5 W, apps/web/e2e/fixtures/overlay-tiles), loaded per tile as the
  // map moves.
  // Close in on Campbell (C81), its card's zoom.
  await page.goto("/app/plan?place=C81");
  await settle(page);
  await mapStill(page);
  const idents = async () => new Set((await airportMarks(page)).map((m) => m.ident));
  await expect.poll(async () => (await idents()).size, { timeout: slow(15_000) }).toBeGreaterThan(0);
  const before = await idents();
  // A pan to the west of most of a screen, the finger still down, from
  // the left of the map's own part of the screen (clear of a card at the
  // side and the sheet at the foot).
  const viewport = page.viewportSize()!;
  const map = (await page.locator(".maplibregl-map").boundingBox())!;
  const panel = await sideDrawer(page).boundingBox();
  const left = panel && panel.width < map.width * 0.8 ? panel.x + panel.width + 20 : map.x + 20;
  const y = viewport.width < 768 ? 160 : viewport.height / 3;
  const run = (map.x + map.width - 90 - left) * 0.9;
  await page.mouse.move(left, y);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++) {
    await page.mouse.move(left + (run * i) / 30, y);
    await page.waitForTimeout(40);
  }
  // Still held: fields drawn that were not in sight before.
  await expect.poll(async () => [...(await idents())].some((i) => !before.has(i)), { timeout: slow(10_000) }).toBe(true);
  await page.mouse.up();
});
