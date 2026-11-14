import { test, expect } from "@playwright/test";
import { frontSheet, grabberTo, mapStill, openPanel, settle, settled, sideDrawer, slow, waypointMarks, stopsAre } from "./helpers";
import { markWith } from "./marks";
import { pickAirplane } from "./startState";
test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

/**
 * A VFR waypoint as a stop, typed in the route's box or tapped on the
 * chart (split from stops.spec at its size budget). VPBNG, by Bangs Lake,
 * 4 nm south-west of Campbell (C81), is in the suite's overlay tiles.
 */

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("a stop may be a VFR waypoint, offered after the airports as it is typed and flown through", async ({ page }) => {
  // Nothing of the route through it is asked of the planner past its
  // course: its two hops' chart would be read on CI's runner.
  await page.route(
    (url) => /\/(checkpoints|navlog|briefing)$/.test(url.pathname) && url.searchParams.get("stops") === "VPBNG",
    (route) => route.abort(),
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);

  await sideDrawer(page).getByRole("button", { name: "Add a stop between C81 and KDLH" }).click();
  await page.getByTestId("search-airports").fill("VPBNG");
  const waypoint = page.getByTestId("search-waypoint").filter({ hasText: "VPBNG" }).first();
  await expect(waypoint).toBeVisible({ timeout: slow(10000) });
  await waypoint.click();
  await expect(page).toHaveURL(stopsAre("VPBNG"));

  // On the map in the sectional's magenta, not as an airport's chip. With
  // the whole route in sight it lies under C81's mark, 4 nm off, and
  // MapLibre's collision leaves it out: the map zoomed in on C81, the sheet
  // down out of its way, until the two are drawn apart.
  await grabberTo(page, "peek");
  await expect(async () => {
    const departure = await markWith(page, "route-marks", "C81")();
    expect(departure, "C81 drawn").not.toBeNull();
    if (!(await markWith(page, "route-marks", "VPBNG")())) {
      await page.mouse.move(departure!.x, departure!.y);
      await page.mouse.wheel(0, -1000);
      await mapStill(page);
    }
    expect((await markWith(page, "route-marks", "VPBNG")())?.kind).toBe("fix");
  }).toPass({ timeout: slow(15000) });
});

test("a VFR waypoint on the chart is a magenta triangle with its ident, and its card adds it as a stop", async ({ page }) => {
  // The planner's own, through the gateway: Chicago's VFR waypoints.
  const answer = await page.request.get("/api/planner/waypoints/in-view?south=41.5&west=-88.5&north=42.5&east=-87.5");
  expect(answer.ok()).toBe(true);
  expect((await answer.json()).waypoints.map((w: { ident: string }) => w.ident)).toContain("VPBNG");

  // VPBNG, by Campbell, from the map's overlay tiles. In close enough for
  // the waypoints' marks -- the wheel over C81, a level at a time.
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await expect.poll(markWith(page, "route-marks", "C81"), { timeout: slow(30000) }).not.toBeNull();
  const departure = (await markWith(page, "route-marks", "C81")())!;
  // C81 dragged to the middle of the map first: the route's fit leaves it
  // near the screen's foot, and VPBNG, 4 nm south-west, was zoomed in to
  // past it, under the bottom edge (2026-11-03).
  const map = (await page.locator(".maplibregl-map").boundingBox())!;
  const middle = { x: map.x + map.width / 2, y: map.y + map.height / 2 };
  await page.mouse.move(departure.x, departure.y);
  await page.mouse.down();
  await page.mouse.move(middle.x, middle.y, { steps: 12 });
  await page.mouse.up();
  await mapStill(page);
  // A level at a time until it is drawn, from 10 as the GPS waypoints
  // are, and on the screen: further in, 4 nm off C81 is off the map.
  const inSight = async () =>
    (await waypointMarks(page)).filter(
      (w) => w.x > map.x + 20 && w.x < map.x + map.width - 20 && w.y > map.y + 20 && w.y < map.y + map.height - 20,
    );
  // Round the pointer, put on C81 each time (the map coasts on after the
  // drag): MapLibre zooms a wheel's step by its size, up to a level a turn,
  // and steps of 60 left the map at 7, short of the waypoints' 10.
  const seen = async () => (await inSight()).some((w) => w.ident === "VPBNG");
  for (let i = 0; i < 8 && !(await seen()); i++) {
    const at = (await markWith(page, "route-marks", "C81")()) ?? middle;
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, -1000);
    await mapStill(page);
  }
  // The waypoint drawn, its magenta triangle and ident (WaypointsLayer).
  await expect.poll(async () => (await inSight()).map((w) => w.ident), { timeout: slow(20000) }).toContain("VPBNG");
  // Once the map has stopped: a tap as the zoom eases in landed where the
  // mark had been.
  let was = "";
  await expect(async () => {
    const now = JSON.stringify(await waypointMarks(page));
    const still = now === was;
    was = now;
    await page.waitForTimeout(300);
    expect(still).toBe(true);
  }).toPass({ timeout: slow(10_000) });
  // Tapped again until its card is up: on CI's runner the plan's stream
  // finishing could move the map under the first tap.
  const add = page.getByTestId("waypoint-add-stop");
  await expect(async () => {
    if (!(await add.isVisible())) {
      // VPBNG's own: further in, others are drawn with it.
      const mark = (await waypointMarks(page)).find((w) => w.ident === "VPBNG");
      await page.mouse.click(mark!.x, mark!.y);
    }
    await expect(add).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: slow(15000) });
  // What it is beside its ident, where it is on a line of its own: in its popup over the chart, or
  // on a phone its card in the map's sheet (MapPopup), its name and line in its head beside its close.
  const popup = page.locator(".maplibregl-popup, [data-sheet-card]");
  await expect(popup.getByText("VFR waypoint", { exact: true })).toBeVisible();
  // Where: off the nearest VOR, as a controller places it (WaypointCard's
  // fixRadialDistance); the overlay tiles' waypoints carry no description,
  // and the stubbed "3 nm SW of Campbell" went with the in-view layer.
  await expect(popup.getByTestId("waypoint-frd")).toHaveText(/^[A-Z]{3} \d{3}° \d+ nm$/);
  // And the map holds still under the open card, once it has panned it
  // into sight: it crept a point a second as the card was drawn again. The
  // pan comes as the card's drawer comes to rest, half a second in.
  await settled(frontSheet(page));
  await mapStill(page);
  const pane = () => page.evaluate(() => document.querySelector<HTMLElement>("[data-testid=gl-map]")!.dataset.center);
  const before = await pane();
  await page.waitForTimeout(2000);
  expect(await pane()).toBe(before);
  await add.click();
  await expect(page).toHaveURL(/[?&]stops=VPBNG/);
});
