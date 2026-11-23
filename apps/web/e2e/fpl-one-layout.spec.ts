import { test, expect, type Page } from "@playwright/test";
import {
  clearTheRoute,
  controlsInSight,
  emptyPlan,
  foldRoute,
  grabberTo,
  inSheet,
  openPanel,
  routeOptionsItem,
  settle,
  sideDrawer,
  slow,
  suggestedRoutes,
} from "./helpers";
import { planFromSearch } from "./oneSearch";
import { fromRest } from "./startState";

/**
 * FPL's one layout (decision 0047, the owner's two-row timeline of
 * 2026-11-17): the route a timeline, read and edited at once with the
 * sheet where the pilot left it, the figures and the Routes' chips under
 * it. A line a point, Apple Maps' Directions' look: its mark (its menu),
 * its ident (a link to its card), its time and its grip; no city. A new
 * plan is the same card, its two ends to pick and the route to type; a
 * route typed in has the route's field open under it till Done. Show Route As and its three layouts are gone, and the opened
 * Directions list with them.
 */
/**
 * The suggested routes answered at once with one way besides the route as
 * typed (with As typed alone there is nothing to suggest and Routes is
 * greyed, useRouteLine's routeLine). Routes is asked once the route's plan
 * is in (useRouteWays), so these tests fly C81 to KDLH, the suite's own
 * corridor, whose charts and checkpoints CI keeps: KORD to KDEN, read cold
 * on each shard, was still "Finding Checkpoints…" at the 60 s Routes is
 * waited on (validate-wave3's rerun 45107108914; main's night took 55 s).
 */
async function oneWay(page: Page) {
  const way = {
    kind: "fastest",
    kinds: ["fastest"],
    title: "Fastest",
    stops: ["KOSH"],
    fuel: [],
    path: [
      [42.43, -88.08],
      [43.98, -88.56],
      [46.84, -92.19],
    ],
    distance_nm: 352.4,
    air_min: 171,
    ground_min: 0,
    fuel_gal: 24.3,
    landings: 0,
    crosses: [],
    marginal: [],
    bands: [{ kind: "vfr", min: 171 }],
    tail_kt: 0,
    floor_ft: 2000,
  };
  await page.route(
    (url) => url.pathname.endsWith("/route-options"),
    (route) =>
      route.fulfill({
        json: {
          options: [way],
          own: null,
          direct: [0],
          ends: [],
          current: [],
          current_marginal: [],
          current_along: { bands: [], tail_kt: 0, floor_ft: 0 },
          chips: [
            { key: "none", label: "As typed", stops: [], fuel: [], crosses: [] },
            { key: "fastest", label: "Fastest", stops: ["KOSH"], fuel: [], crosses: [] },
          ],
          hazards: [],
          unchecked: [],
        },
      }),
  );
}

test.describe("/app/plan", () => {
  // auth.setup starts every test with the fields open (wingtip.fieldsOpen),
  // which also lists every stop; here they start as a pilot's do.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.removeItem("wingtip.fieldsOpen");
      } catch {
        /* no storage */
      }
    });
  });

  test("the route is its timeline at half, no list to open: ident, time and grip a line, the figures and the Routes under it", async ({
    page,
  }) => {
    await oneWay(page);
    await page.goto("/app/plan?dep=C81&stops=KMSN&dest=KDLH");
    await settle(page);
    await fromRest(page);
    await openPanel(page);
    const drawer = sideDrawer(page);

    // The first row's fields bare, no captions (the owner, 2026-11-17: "No
    // need for airplane and cruise labels"), their names VoiceOver's.
    await expect(drawer.getByTestId("aircraft-select-caption")).toHaveCount(0);
    await expect(drawer.getByTestId("altitude-group-caption")).toHaveCount(0);
    await expect(drawer.getByTestId("aircraft-input")).toHaveAccessibleName(/^Airplane, N-number/);

    const timeline = drawer.getByTestId("route-summary");
    await expect(timeline).toBeVisible({ timeout: slow(30_000) });
    // One stop is its own row at half, no stops' row for it.
    await expect(timeline.getByTestId("timeline-ident")).toHaveText(["C81", "KMSN", "KDLH"], { timeout: slow(30_000) });
    await expect(timeline.getByTestId("timeline-stops")).toHaveCount(0);
    // No city on a line (the owner: "We don't need to say the city name").
    await expect(timeline).not.toContainText("Madison");
    await expect(timeline.getByTestId("timeline-line")).toHaveCount(3);
    // No grip's three lines nor a chevron at a field's end (the owner,
    // 2026-11-19); the drag buttons kept for the keyboard.
    await expect(timeline.getByTestId("timeline-chevron")).toHaveCount(0);
    await expect(timeline.getByTestId("route-grip")).toHaveCount(3);
    // Each line one 44-point row while folded.
    for (const line of await timeline.getByTestId("timeline-line").all()) expect((await line.boundingBox())!.height).toBeLessThan(46);
    await expect(timeline.getByTestId("timeline-add-stop")).toBeVisible();
    await expect(drawer.getByTestId("flight-line")).toBeVisible();
    // The suggested routes behind the bar's Routes, out above the stops.
    await expect(drawer.getByTestId("route-group")).toHaveCount(0);
    await (await suggestedRoutes(page)).first().waitFor();
    await expect(drawer.getByTestId("route-group")).toBeVisible();
    await (await routeOptionsItem(page)).click();
    await expect(drawer.getByTestId("route-box")).toHaveCount(0);
    await expect(drawer.getByTestId("route-done")).toHaveCount(0);
    await expect(drawer.getByTestId("route-summary-open")).toHaveCount(0);

    // The box's lower-left toggle turns the same box into the route's
    // field, no "Route" row or Done, and back (the owner, 2026-11-22).
    // Measured as the toggle is tapped, its controls in sight first.
    await controlsInSight(page);
    const before = (await timeline.boundingBox())!;
    await drawer.getByTestId("route-type-open").click();
    await expect(drawer.getByTestId("route-box")).toBeVisible();
    // The same box in the same place, its size and shape, the route wrapped
    // in it (the owner, 2026-11-22: "Route box moves down when toggled").
    const typed = (await drawer.getByTestId("route-box").boundingBox())!;
    for (const k of ["x", "y", "width", "height"] as const) expect(Math.abs(typed[k] - before[k]), `the box's ${k}`).toBeLessThanOrEqual(1);
    await expect(drawer.getByTestId("route-box")).toHaveAttribute("data-wrapped", "true");
    await expect(timeline).toHaveCount(0);
    await expect(drawer.getByTestId("route-done")).toHaveCount(0);
    await expect(drawer.getByTestId("route-head")).toHaveCount(0);
    const toggle = drawer.getByTestId("route-type-open");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    // Its 44-point area, by what a tap there lands on (elementFromPoint).
    const hit = await toggle.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const mid = box.top + box.height / 2;
      const lands = (y: number) => el.contains(document.elementFromPoint(x, y));
      return lands(mid - 21.5) && lands(mid + 21.5) ? 44 : box.height;
    });
    expect(hit, "a 44-point area").toBeGreaterThanOrEqual(44);
    await foldRoute(page);
    await expect(drawer.getByTestId("route-box")).toHaveCount(0);
    const back = (await timeline.boundingBox())!;
    for (const k of ["x", "y", "width", "height"] as const)
      expect(Math.abs(back[k] - before[k]), `back, the box's ${k}`).toBeLessThanOrEqual(1);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(toggle).toBeFocused();

    // A line opened leaves the sheet where it is: at half again, where
    // More's menu took it all the way up for the route's field (openRoute).
    await grabberTo(page, "half");
    await expect(drawer).toHaveAttribute("data-panel", "half");
    await timeline.locator('[data-testid="timeline-line"][data-ident="KMSN"]').getByTestId("timeline-toggle").click();
    await expect(drawer).toHaveAttribute("data-panel", "half");

    // All the way up on a phone, the same timeline: no list of its own.
    if (test.info().project.name === "mobile") {
      await grabberTo(page, "full");
      await expect(timeline).toBeVisible();
      await expect(drawer.getByTestId("route-done")).toHaveCount(0);
      await grabberTo(page, "half");
    }

    // A stop's name tapped is the one search, asked what goes in its place
    // (the owner, 2026-11-19: "when the stop is tapped it should be
    // editable with suggestions"), and the pick takes its place.
    await timeline.getByTestId("timeline-ident").nth(1).click();
    const field = page.getByTestId("search-airports");
    // As Apple Maps' Change Stop: its title, the stop's name in the field.
    await expect(page.getByTestId("search-pick-title")).toHaveText("Change Stop");
    await expect(field).toHaveValue("KMSN");
    await field.fill("KJVL");
    await page.keyboard.press("Enter");
    await expect(timeline.getByTestId("timeline-ident")).toHaveText(["C81", "KJVL", "KDLH"], { timeout: slow(30_000) });
  });

  test("below full the stops are one row between the ends, a tap taking the sheet up where each is its own row", async ({ page }) => {
    // The owner, 2026-11-18: "let's just show the stops as another row in
    // between. And when the card is full, no need to show that because it
    // expands to show all the stops".
    await page.goto("/app/plan?dep=KORD&stops=KDSM,KOMA,KLNK,KGRI&dest=KDEN");
    await settle(page);
    await openPanel(page);
    const drawer = sideDrawer(page);
    const timeline = drawer.getByTestId("route-summary");
    // From md up the side panel is the window's height at half too, so
    // every stop is listed there.
    if (test.info().project.name !== "mobile") {
      await expect(timeline.getByTestId("timeline-ident")).toHaveText(["KORD", "KDSM", "KOMA", "KLNK", "KGRI", "KDEN"], {
        timeout: slow(30_000),
      });
      await expect(timeline.getByTestId("timeline-stops")).toHaveCount(0);
      return;
    }
    await expect(drawer).toHaveAttribute("data-panel", "half");
    await expect(timeline.getByTestId("timeline-ident")).toHaveText(["KORD", "KDEN"], { timeout: slow(30_000) });
    const stops = timeline.getByTestId("timeline-stops");
    await expect(stops).toHaveAccessibleName("4 stops: KDSM, KOMA, KLNK, KGRI. Show all");
    await expect(stops).toContainText("4 Stops");
    // A row as tall as a point's.
    expect((await stops.boundingBox())!.height).toBeLessThan(46);
    await stops.click();
    await expect(drawer).toHaveAttribute("data-panel", "full");
    await expect(timeline.getByTestId("timeline-ident")).toHaveText(["KORD", "KDSM", "KOMA", "KLNK", "KGRI", "KDEN"]);
    await expect(stops).toHaveCount(0);
    // Lowered to half again, they are one row again.
    await grabberTo(page, "half");
    await expect(timeline.getByTestId("timeline-ident")).toHaveText(["KORD", "KDEN"]);
    await expect(stops).toBeVisible();
  });

  test('a Direct To from where the airplane is reads "My Location", its Direct to line and Cancel folded and open', async ({ page }) => {
    // The owner's iPhone, 2026-11-17: the folded line read "POS0" over
    // "Present position". One name, Apple Maps' "My Location", everywhere.
    await page.goto("/app/plan?dep=@42.2333,-87.9883&dest=KUGN&direct=KUGN&was=C81%7C%7CKUGN");
    await settle(page);
    await fromRest(page);
    await openPanel(page);
    const drawer = sideDrawer(page);
    const timeline = drawer.getByTestId("route-summary");
    await expect(timeline.getByTestId("timeline-ident")).toHaveText(["My Location", "KUGN"], { timeout: slow(30_000) });
    await expect(timeline).not.toContainText("POS0");
    // The Direct to line over the figures.
    const direct = drawer.getByTestId("direct-strip");
    await expect(direct).toBeVisible();
    await expect(drawer).not.toContainText("POS0");
    // Cancel gives the route back as it was; brought into sight first, the
    // airplane's strip over the route since FPL's title took the first row
    // (the owner, 2026-11-19), so at half it can be under the floating bar.
    const cancel = direct.getByRole("button", { name: /Cancel/ });
    await inSheet(page, cancel);
    await cancel.click();
    await expect(page).toHaveURL(/[?&]dep=C81(&|$)/);
    await expect(page).not.toHaveURL(/[?&]direct=/);
  });

  test("a new plan is the timeline's card, its two ends to pick, no head; a route typed in keeps its field till Done", async ({ page }) => {
    await page.goto("/app/plan");
    await settle(page);
    await openPanel(page);
    await planFromSearch(page);
    const drawer = sideDrawer(page);
    // The empty route drawn as a whole one is (the owner, 2026-11-18): the
    // two ends in a placeholder's words, the route to type last, its field
    // folded till asked for, no "Route" over it and no Done.
    const empty = drawer.getByTestId("route-empty");
    await expect(empty).toBeVisible();
    await expect(empty.getByRole("button", { name: "Pick the departure" })).toBeVisible();
    await expect(empty.getByRole("button", { name: "Pick the destination" })).toBeVisible();
    await expect(empty.getByTestId("route-type-open")).toBeVisible();
    await expect(drawer.getByTestId("route-head")).toHaveCount(0);
    await expect(drawer.getByTestId("route-done")).toHaveCount(0);
    await expect(drawer.getByTestId("route-type")).toHaveCount(0);

    // The box's toggle, at the Destination's end, turns the card into the
    // field in its place, focused; a whole route
    // pasted into it keeps it open, the pilot still at it, till the toggle turns it back.
    await empty.getByTestId("route-type-open").click();
    await expect(drawer.getByTestId("route-type")).toBeFocused();
    await page.keyboard.insertText("KORD KOMA KDEN");
    await page.keyboard.press("Enter");
    await expect(drawer.locator('[data-testid="route-type-open"][aria-pressed="true"]')).toBeVisible({ timeout: slow(30_000) });
    await foldRoute(page);
    // The route as pasted, its timeline back (its stops one row below full).
    await expect(page).toHaveURL(/dep=KORD.*dest=KDEN|dest=KDEN.*dep=KORD/, { timeout: slow(30_000) });
    await expect(page).toHaveURL(/stops=KOMA/);
    await expect(drawer.getByTestId("route-summary")).toBeVisible();
    await expect(drawer.getByTestId("route-box")).toHaveCount(0);

    // The route's ••• keeps three items, and no Show Route As.
    await controlsInSight(page);
    await drawer.getByTestId("share-route").locator("visible=true").first().click();
    await expect(page.getByTestId("share-link")).toBeVisible();
    await expect(page.getByText("Show Route As")).toHaveCount(0);
  });

  test("My Location cannot be moved into the middle: its point menu offers no Move Down", async ({ page }) => {
    // A Direct To's start is where the airplane is; a stop made ahead of it
    // would have the route leave a point that is not a place to leave from.
    await page.goto("/app/plan?dep=@42.2333,-87.9883&stops=KMSN&dest=KDLH");
    await settle(page);
    await openPanel(page);
    const drawer = sideDrawer(page);
    const here = drawer.getByTestId("timeline-line").first();
    await expect(here.getByTestId("timeline-ident")).toHaveText("My Location", { timeout: slow(30_000) });
    await here.getByTestId("point-menu").click();
    await expect(page.getByTestId("point-menu-change")).toBeVisible();
    await expect(page.getByTestId("point-menu-move-down")).toHaveCount(0);
    await expect(page.getByTestId("point-menu-move-up")).toHaveCount(0);
  });

  test("the routes button resets with the route: pills out, the route cleared, a new route's pills hidden", async ({ page }) => {
    await oneWay(page);
    await page.goto("/app/plan?dep=C81&dest=KDLH");
    await settle(page);
    await openPanel(page);
    const drawer = sideDrawer(page);
    await suggestedRoutes(page);
    await expect(drawer.getByTestId("route-group")).toBeVisible();
    await clearTheRoute(page);
    await expect(page).not.toHaveURL(/[?&]dest=/);
    // A new route typed in the same page, no reload: its suggested routes
    // behind the button again, the button not pressed, no pills.
    await emptyPlan(page);
    await drawer.getByTestId("route-type").click();
    await page.keyboard.insertText("KORD KMSP");
    await page.keyboard.press("Enter");
    await expect(drawer.locator('[data-testid="route-type-open"][aria-pressed="true"]')).toBeVisible({ timeout: slow(30_000) });
    await foldRoute(page);
    await expect(page).toHaveURL(/[?&]dest=KMSP(&|$)/);
    await expect(async () => {
      const item = await routeOptionsItem(page);
      await expect(item).toBeVisible({ timeout: 2000 });
      await expect(item).toHaveAttribute("aria-pressed", "false");
    }).toPass({ timeout: slow(30_000) });
    await expect(drawer.getByTestId("route-group")).toHaveCount(0);
  });
});
