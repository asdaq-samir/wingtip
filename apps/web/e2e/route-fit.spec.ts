import { test, expect } from "@playwright/test";
import {
  airportSearch,
  closeSidebarWithTheStockKey,
  expectDrawerClosed,
  grabberTo,
  sheetUpToType,
  mapStill,
  openPanel,
  searchAirports,
  settle,
  settled,
  sideDrawer,
  slow,
} from "./helpers";
import { fromRest } from "./startState";
import { ownHomeBase } from "./oneSearch";
import { courseBox } from "./mapProbes";
import {
  origin,
  fittedClearOf,
  shipInTheMiddle,
  paneAndSheet,
  slidWithSheet,
  mapZoom,
  drag,
  countAsks,
  fieldClearOfCard,
} from "./routeFitProbes";

/**
 * The map and the sheet move together, as in Maps: opened fresh, the map
 * is on the pilot's position in the middle of what the half sheet leaves,
 * and kept there as the sheet goes down and up; a route entered is flown
 * to and fitted above the sheet; as the sheet goes down and up the map is
 * only slid with it at the zoom it has, never fitted again, as Apple Maps'
 * map under its sheet (the owner, 2026-11-11: "I like the stock
 * behavior"): the map moves itself only for something the pilot picked.
 */

test("opened fresh, the map is on the pilot's position in the middle of what the half sheet leaves, kept there as the sheet goes down, and left alone once panned off it", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"], { origin });
  await context.setGeolocation({ latitude: 42.3247, longitude: -88.0742 });
  await page.goto("/app/plan");
  await settle(page);
  // Opened as the one search alone on a phone (the owner's ask); a desktop's side panel put away to start from the same rest.
  await fromRest(page);
  // The position shown: the arrow offers to hide or follow it, not to show it (a plain button named by its tap).
  await expect(page.getByTestId("my-position-button")).not.toHaveAccessibleName("Show my position");
  await shipInTheMiddle(page);
  await closeSidebarWithTheStockKey(page);
  await expectDrawerClosed(page);
  await shipInTheMiddle(page);

  // Panned until the position is off the screen: the sheet raised, the map slides with it on a phone, at the zoom the pilot put it.
  const viewport = page.viewportSize()!;
  for (let i = 0; i < 3; i++) await drag(page, -viewport.width * 0.45, -60);
  const before = await paneAndSheet(page);
  await page.getByTestId("sidebar-trigger-button").click();
  await expect(sideDrawer(page)).not.toHaveAttribute("data-collapsed", "true");
  await settled(sideDrawer(page));
  await slidWithSheet(page, before);

  // Turned off from the location arrow: the dot stays at its last place, grey, as Maps' does.
  await closeSidebarWithTheStockKey(page);
  await expectDrawerClosed(page);
  const arrow = page.locator("[data-map-controls]").getByTestId("my-position-button");
  await arrow.click();
  await expect(arrow).toHaveAccessibleName("Hide my position");
  await expect(page.locator('[data-own-ship="on"]')).toBeVisible();
  await arrow.click();
  await expect(arrow).toHaveAccessibleName("Show my position");
  await expect(page.locator('[data-own-ship="off"]')).toBeVisible();
  await expect(page.locator('[data-own-ship="on"]')).toHaveCount(0);
});

test("reloaded where it was, the map opens on the position in the middle of what the pill leaves, and does not slide there as the first fix comes", async ({
  page,
  context,
}) => {
  // The pill's: a desktop's side panel opens out (the one-search design's Desktop, 2026-11-09), and route-fit's first test has it.
  test.skip(page.viewportSize()!.width >= 1024, "a phone's pill; a desktop opens with its side panel out");
  // The owner's notice: "On a reload why is there animation in the maps
  // and the pill? It seems they are settling to their desired position".
  await context.grantPermissions(["geolocation"], { origin });
  await context.setGeolocation({ latitude: 42.3247, longitude: -88.0742 });
  // Where the position last was, as an earlier visit keeps it (ownShip's lastFix): the page opens on it.
  await page.addInitScript(() =>
    localStorage.setItem(
      "wingtip.ownship",
      JSON.stringify({ state: { enabled: true, follow: true, lastFix: { lat: 42.325, lon: -88.074 } }, version: 0 }),
    ),
  );
  // Every place the map's pane is put from the frame it is shown (its loading mark lifted, GlMapShell's data-revealed): it moves when the
  // map does, and only then. Before that the pilot sees the mark, not the map, as it takes the sheet's room.
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __panes: string[] }).__panes = seen;
    const look = () => {
      const map = document.querySelector<HTMLElement>("[data-testid=gl-map]");
      const at = map?.dataset.revealed !== undefined ? map?.dataset.offset : undefined;
      if (at && at !== seen[seen.length - 1]) seen.push(at);
      if (performance.now() < 20_000) requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  await page.goto("/app/plan");
  await settle(page);
  await expect(sideDrawer(page)).toHaveAttribute("data-panel", "peek");
  await shipInTheMiddle(page);
  // Watched for a while from the frame the map is shown, which comes with its tiles in, after the pill and the ship are placed.
  await expect(page.getByTestId("gl-map")).toHaveAttribute("data-revealed", "", { timeout: slow(10_000) });
  await page.waitForTimeout(1500);
  // Made there, and never moved: the first fix was put, not panned to. The
  // fix a few metres from the kept one may set the map a fraction of a
  // point over (MapLibre's offset to a tenth), which no eye sees as a slide.
  const panes = await page.evaluate(() => (window as unknown as { __panes: string[] }).__panes);
  expect(panes.length, "the map shown").toBeGreaterThan(0);
  const [x0, y0] = panes[0]!.split(",").map(Number);
  for (const pane of panes) {
    const [x, y] = pane.split(",").map(Number);
    expect(Math.hypot(x! - x0!, y! - y0!), `the map moved: ${panes.join(" → ")}`).toBeLessThan(1);
  }
});

test("opened fresh on a first visit, the position is asked for as the page opens, and nothing complains", async ({ page }) => {
  const asks = await countAsks(page);
  await page.goto("/app/plan");
  await settle(page);
  // The map opens on the pilot's position by default (ownShip's locateOnOpen, the owner's ask, 2026-11-04), so a first visit is asked
  // as it opens; a refusal leaves no error over the map.
  await expect.poll(asks, { timeout: slow(10_000) }).toBe(1);
  await expect(page.getByTestId("error-alert")).toHaveCount(0);
});

test("opened on the whole country, land and water lie under the charts where they end, not the page's grey", async ({ page }) => {
  // The design review, 2026-10-28: grey bands over and under the sectionals on a phone. The USGS's tiles answered here, a pixel each.
  const asked: string[] = [];
  await page.route(
    (url) => url.hostname === "basemap.nationalmap.gov",
    (route) => {
      asked.push(route.request().url());
      return route.fulfill({
        body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64"),
        contentType: "image/png",
      });
    },
  );
  await page.goto("/app/plan");
  await settle(page);
  await expect.poll(() => asked.filter((u) => u.includes("/USGSHydroCached/")).length, { timeout: slow(10_000) }).toBeGreaterThan(0);
  // Under every chart layer, the sectional's included. The map's layers bottom to top (GlMapShell's data-layers).
  // Both read in one look, as the probe writes the layers as each is added.
  const order = async () => ((await page.getByTestId("gl-map").getAttribute("data-layers")) ?? "").split(" ");
  // The base chart's layer is "chart:<kind>" (glStyle's chartId), the last base picked kept beside it.
  await expect
    .poll(async () => (await order()).filter((id) => id === "land-water" || id.startsWith("chart:")).slice(0, 2))
    .toEqual(["land-water", "chart:sec"]);
});

test("opened fresh where the position was given before, it is asked for again as the page opens", async ({ page }) => {
  // A fix kept from an earlier visit, as Safari, which asks again on a later day, leaves the permission at "prompt".
  await page.addInitScript(() =>
    localStorage.setItem(
      "wingtip.ownship",
      JSON.stringify({ state: { enabled: false, follow: true, lastFix: { lat: 42.325, lon: -88.074 } }, version: 0 }),
    ),
  );
  const asks = await countAsks(page);
  await page.goto("/app/plan");
  await settle(page);
  await expect.poll(asks, { timeout: slow(10_000) }).toBe(1);
});

test("a route entered is fitted above the half sheet, and only slid with the sheet as it goes down and up", async ({ page }) => {
  // Home from a link, so Fly Here has somewhere to fly from; this page's
  // own, not the shared account's.
  await ownHomeBase(page);
  await page.goto("/app/plan?home=C81");
  await expect(page).not.toHaveURL(/[?&]home=/, { timeout: slow(10_000) });
  const search = await airportSearch(page);
  await sheetUpToType(page); // typing leaves the sheet where it is (5db1f8b10)
  await search.click();
  await search.fill("KDLH");
  await searchAirports(page).filter({ hasText: "KDLH" }).first().click();
  await page.getByTestId("place-card").getByTestId("fly-here").click();
  await expect(page).toHaveURL(/dep=C81.*dest=KDLH|dest=KDLH.*dep=C81/);
  // The route at the height the card was: half, as every card opens.
  await expect(sideDrawer(page)).toHaveAttribute("data-panel", "half");
  await fittedClearOf(page, sideDrawer(page));
  await mapStill(page);
  const zoom = await mapZoom(page);

  // Lowered and raised again: slid with the sheet at the same zoom, the route fitted once, at the pick.
  const before = await paneAndSheet(page);
  await closeSidebarWithTheStockKey(page);
  await expectDrawerClosed(page);
  await slidWithSheet(page, before);
  expect(await mapZoom(page)).toBe(zoom);
  await openPanel(page);
  await settled(sideDrawer(page));
  await mapStill(page);
  expect(await mapZoom(page)).toBe(zoom);
  await fittedClearOf(page, sideDrawer(page));
});

test("a route the pilot has moved is slid with the sheet as it goes up and down, never fitted again", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await fittedClearOf(page, sideDrawer(page));
  // Moved, the route part off the screen: slid with the sheet, never
  // fitted again at a turn (the owner, 2026-11-04 and 2026-11-11).
  await drag(page, 120, 80);
  const zoom = await mapZoom(page);
  const moved = await paneAndSheet(page);
  await openPanel(page);
  await settled(sideDrawer(page));
  await slidWithSheet(page, moved);
  expect(await mapZoom(page)).toBe(zoom);

  // Panned right off it: still only slid.
  await closeSidebarWithTheStockKey(page);
  await expectDrawerClosed(page);
  await mapStill(page);
  const viewport = page.viewportSize()!;
  for (let i = 0; i < 4; i++) await drag(page, Math.min(300, viewport.width * 0.7), 0);
  const before = await paneAndSheet(page);
  await openPanel(page);
  await settled(sideDrawer(page));
  await slidWithSheet(page, before);
  expect(await mapZoom(page)).toBe(zoom);
});

test("panned off the route, the location arrow turns to the route, and a tap fits the course again", async ({ page }) => {
  // The owner's ask: "When the route is entered, and map is panned away from the route, have the locator icon change to fit the course".
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await closeSidebarWithTheStockKey(page);
  await expectDrawerClosed(page);
  await fittedClearOf(page, sideDrawer(page));
  const arrow = page.locator("[data-map-controls]").getByTestId("my-position-button");
  // The whole route in sight: the arrow, for the position.
  await expect(arrow).toHaveAttribute("data-face", "position");

  const viewport = page.viewportSize()!;
  for (let i = 0; i < 3; i++) await drag(page, Math.min(300, viewport.width * 0.7), 0);
  await expect(arrow).toHaveAttribute("data-face", "route");
  await expect(arrow).toHaveAccessibleName("Show the whole route");

  await arrow.click();
  await fittedClearOf(page, sideDrawer(page));
  await expect(arrow).toHaveAttribute("data-face", "position");
});

test("with a route drawn, the location arrow goes only between the position and the whole route", async ({ page, context }) => {
  // The owner's ask: "when the route is drawn then only toggle between the current location and the fit route".
  await context.grantPermissions(["geolocation"], { origin });
  await context.setGeolocation({ latitude: 42.3247, longitude: -88.0742 });
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  // The route drawn and fitted first, as the test's title has it. Tapped
  // while the route was still coming, the arrow was own ship's alone, and
  // a tap on a position followed puts it away, as it should: own ship
  // was hidden, the route then fitted, and the ship 111 px off the middle
  // (CI run 44621875032; 3 of 3 here with three workers).
  await fittedClearOf(page, sideDrawer(page));
  const arrow = page.locator("[data-map-controls]").getByTestId("my-position-button");
  await expect(arrow).toHaveAttribute("data-face", "position");
  for (let i = 0; i < 2; i++) {
    await arrow.click();
    await shipInTheMiddle(page);
    // On the position, the arrow offers the route, never "Hide my position".
    await expect(arrow).toHaveAttribute("data-face", "route");
    await arrow.click();
    await fittedClearOf(page, sideDrawer(page));
    await expect(arrow).toHaveAttribute("data-face", "position");
  }
});

test("an airport's card keeps its field in sight: the next position the GPS gives does not take the map back to own ship", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"], { origin });
  await context.setGeolocation({ latitude: 42.3247, longitude: -88.0742 });
  await page.goto("/app/plan");
  await settle(page);
  // The position shown: the arrow offers to hide or follow it, not to show it (a plain button named by its tap).
  await expect(page.getByTestId("my-position-button")).not.toHaveAccessibleName("Show my position");
  await shipInTheMiddle(page);

  // A field far from the position, from the search: the map goes to it (Madison, in the overlay tiles' box).
  const search = await airportSearch(page);
  await sheetUpToType(page); // typing leaves the sheet where it is (5db1f8b10)
  await search.click();
  await search.fill("KMSN");
  await searchAirports(page).filter({ hasText: "KMSN" }).first().click();
  await expect(sideDrawer(page).getByTestId("place-card")).toBeVisible();
  await fieldClearOfCard(page, "KMSN");

  // The GPS moves on: the map stays on the field, as Maps' does once a place is picked, until the location arrow is tapped.
  await context.setGeolocation({ latitude: 42.33, longitude: -88.08 });
  await page.waitForTimeout(2000);
  await fieldClearOfCard(page, "KMSN");
});

test("a route fitted at the pill and untouched is slid, not fitted again, as the sheet rises to half", async ({ page }) => {
  // The FPL audit's A13 (2026-11-08) had the route fitted again above the half sheet; the owner's stock rule (2026-11-11) has the map
  // move itself only for a pick, so the sheet's rise slides it at its zoom, as Apple Maps' does.
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "a phone's sheet");
  await page.goto("/app/plan?dep=KUGN&dest=KOSH");
  await settle(page);
  await expect(sideDrawer(page)).toHaveAttribute("data-panel", "peek");
  await fittedClearOf(page, sideDrawer(page));
  await mapStill(page);
  const zoom = await mapZoom(page);
  const before = await paneAndSheet(page);
  await grabberTo(page, "half");
  await settled(sideDrawer(page));
  await slidWithSheet(page, before);
  expect(await mapZoom(page)).toBe(zoom);
});

test("from half way to all the way up and back, the map stays exactly where it is", async ({ page }) => {
  // The owner's ask: "when going from half card to full card, map should not move or zoom" -- only the pill to half and back moves it.
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await expect(sideDrawer(page)).toHaveAttribute("data-panel", "half");
  await mapStill(page);
  const before = await courseBox(page);
  await grabberTo(page, "full");
  await settled(sideDrawer(page));
  await mapStill(page);
  expect(await courseBox(page)).toEqual(before);
  await grabberTo(page, "half");
  await settled(sideDrawer(page));
  await mapStill(page);
  expect(await courseBox(page)).toEqual(before);
});
