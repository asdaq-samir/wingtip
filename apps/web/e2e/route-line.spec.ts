import { test, expect, type Page } from "@playwright/test";
import { drawn, openPanel, settle, sideDrawer, slow } from "./helpers";
import { stopsAre } from "./stopsParam";
import { pickAirplane } from "./startState";
import { expectDrawnOnce, installFrameRecorder } from "./drawnOnce";
test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

/**
 * FPL's route line, at the owner's ask ("make it more like the runway
 * folding with the route symbol, and no need for accept or not buttons.
 * You can simply have none in the beginning", 2026-10-26): under the
 * departure, the route's glyph and the chip picked, "As typed" at first; a tap
 * on it the planner's ways as chips, a tap on one the route at once,
 * planned, and "As typed" the route as typed again. No Routes button.
 *
 * The ways are the planner's (wingtip.route_options, its chips app.routers.
 * route_options, tested there); here /api/route-options is answered, so
 * the page is tried without the day's weather.
 */

const WAYS = {
  options: [
    {
      kind: "fastest",
      kinds: ["fastest", "stops"],
      title: "Fastest",
      stops: ["DLH/180/40.0"],
      fuel: [],
      path: [
        [42.23, -88.0],
        [46.0, -92.2],
        [46.84, -92.19],
      ],
      distance_nm: 352.4,
      air_min: 181,
      ground_min: 0,
      fuel_gal: 25.6,
      landings: 0,
      crosses: [],
      marginal: [],
      bands: [{ kind: "vfr", min: 181 }],
      tail_kt: 12,
      floor_ft: 2200,
    },
    {
      kind: "weather",
      kinds: ["weather"],
      title: "Best weather",
      stops: ["KEAU"],
      fuel: ["KEAU"],
      path: [
        [42.23, -88.0],
        [44.87, -91.48],
        [46.84, -92.19],
      ],
      distance_nm: 371.2,
      air_min: 190,
      ground_min: 30,
      fuel_gal: 27.0,
      landings: 1,
      crosses: [],
      marginal: [1],
      bands: [
        { kind: "vfr", min: 90 },
        { kind: "mvfr", min: 40 },
        { kind: "vfr", min: 60 },
      ],
      tail_kt: 4,
      floor_ft: 2400,
    },
  ],
  own: null,
  direct: [0],
  ends: [],
  current: [],
  current_marginal: [],
  current_along: {
    bands: [
      { kind: "vfr", min: 60 },
      { kind: "storm", min: 30 },
      { kind: "vfr", min: 82 },
    ],
    tail_kt: 6,
    floor_ft: 2100,
  },
  chips: [
    { key: "none", label: "As typed", stops: [], fuel: [], crosses: [0] },
    { key: "weather", label: "Avoid Weather", stops: ["KEAU"], fuel: ["KEAU"], crosses: [] },
    { key: "fastest", label: "Fastest", stops: ["DLH/180/40.0"], fuel: [], crosses: [] },
  ],
  hazards: [
    { kind: "storm", name: "Thunderstorms forecast at KCWA" },
    { kind: "marginal", name: "KRHI forecast marginal (ceiling 2,500 ft)" },
  ],
  unchecked: [],
};

async function ways(page: Page) {
  await page.route(
    (url) => url.pathname.endsWith("/route-options"),
    (route) => route.fulfill({ json: WAYS }),
  );
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("FPL's route line folds to the way picked, As typed at first, and a chip tapped is the route at once", async ({ page }) => {
  await ways(page);
  const planned: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/navlog")) planned.push(new URL(request.url()).searchParams.get("stops") ?? "");
  });
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  // No Routes button: the line does its job.
  await expect(sideDrawer(page).getByTestId("route-routes")).toHaveCount(0);
  const line = sideDrawer(page).getByTestId("route-line");
  const picked = line.getByTestId("route-line-picked");
  // Folded to one row over the fields (the owner's K1, 2026-10-29): None,
  // the route as typed, planned at once, with its time; what it meets said.
  await expect(picked).toHaveText(/^As typed/, { timeout: slow(30_000) });
  // What it shows first, then what it is (WCAG 2.5.3, Label in Name: RouteLine's label).
  await expect(line.getByTestId("route-line-toggle")).toHaveAccessibleName(
    /^As typed .*2 more, Routes: As typed, the route as typed, .*crosses storms/,
  );
  // Over the route's fields, not among them.
  const lineBox = (await line.boundingBox())!,
    fields = (await sideDrawer(page).getByTestId("procedures").boundingBox())!;
  expect(lineBox.y + lineBox.height).toBeLessThanOrEqual(fields.y + 1);
  await expect.poll(() => planned.length, { timeout: slow(15_000) }).toBeGreaterThan(0);

  // Opened: every way a card, its time over its name, and drawn on the
  // chart beside the course.
  await picked.click();
  const chips = line.getByTestId("route-line-chip");
  // Each its miles and fuel under its name, as ForeFlight's and Garmin's
  // cards (the owner, 2026-11-08): the planner's, the route as typed's
  // from its nav log.
  await expect(chips).toHaveText([/As typed\d+ nm/, /Avoid Weather/, /Fastest/]);
  await expect(chips.nth(1).getByTestId("route-line-figures")).toHaveText(/\d+ nm · \d+\.\d gal/);
  // On the map's canvas, as the chips' probe says (WaysGl).
  await expect.poll(async () => (await drawn(page, "route-way-chips")).length).toBe(2);

  // A chip tapped: the route at once, its fuel stop named, and planned.
  await chips.filter({ hasText: "Avoid Weather" }).click();
  await expect(page).toHaveURL(stopsAre("KEAU"));
  await expect(page).toHaveURL(/[?&]fuel=KEAU(&|$)/);
  await expect.poll(() => planned.some((stops) => stops.includes("KEAU")), { timeout: slow(15_000) }).toBe(true);
  await expect(chips.filter({ hasText: "Avoid Weather" })).toHaveAttribute("data-pressed", "");

  // As typed: the route as typed again.
  await chips.filter({ hasText: "As typed" }).click();
  await expect(page).not.toHaveURL(/[?&]stops=/);
  await expect(chips.filter({ hasText: "As typed" })).toHaveAttribute("data-pressed", "");
});

test("the routes stay open until their row folds them, to the way picked", async ({ page }) => {
  await ways(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  const line = sideDrawer(page).getByTestId("route-line");
  await line.getByTestId("route-line-picked").click({ timeout: slow(30_000) });
  await line.getByTestId("route-line-chip").filter({ hasText: "Fastest" }).click();
  // Left alone, it stays open, its ways on the chart (the owner,
  // 2026-10-28: "Keep the routes and runway opened until folded"); it
  // folded after two seconds.
  await page.waitForTimeout(3000);
  await expect(line.getByTestId("route-line-chip")).toHaveCount(3);
  await expect.poll(async () => (await drawn(page, "route-way-chips")).length).toBeGreaterThan(0);
  await line.getByTestId("route-line-toggle").click();
  await expect(line.getByTestId("route-line-picked")).toHaveText(/^Fastest/);
  await expect(line.getByTestId("route-line-chip")).toHaveCount(0);
  await expect.poll(async () => (await drawn(page, "route-way-chips")).length).toBe(0);
});

test("another airplane picked keeps the Routes row in its place, dimmed, till its own ways come", async ({ page }) => {
  // The first airplane's ways at once, the next one's a second late, as the
  // planner's grid is for an airplane it has not planned.
  let asked = 0;
  await page.route(
    (url) => url.pathname.endsWith("/route-options"),
    async (route) => {
      if (asked++ > 0) await new Promise((done) => setTimeout(done, 1200));
      await route.fulfill({ json: WAYS });
    },
  );
  await page.route(
    (url) => url.pathname.endsWith("/traffic/registered"),
    (route) => route.fulfill({ json: { n_number: "N181PA", mode_s_hex: "A1B2C3", manufacturer: "Piper", model: "PA-28-181", year: 1999 } }),
  );
  await installFrameRecorder(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  const line = sideDrawer(page).getByTestId("route-line");
  await expect(line.getByTestId("route-line-picked")).toHaveText(/^As typed/, { timeout: slow(30_000) });
  // Whether the row is on the page, every frame from the pick on: it went
  // for half a second at every change of airplane, the list under it
  // jumping up and back (the flicker audit's FL-12).
  await page.evaluate(() => {
    const w = window as unknown as { routeLineGone: number };
    w.routeLineGone = 0;
    const until = performance.now() + 3000;
    const look = () => {
      if (!document.querySelector('[data-testid="route-line"]')) w.routeLineGone++;
      if (performance.now() < until) requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  const picker = page.getByTestId("aircraft-input");
  await expectDrawnOnce(
    page,
    async () => {
      await picker.fill("N181PA");
      await picker.press("Enter");
      // Kept, dimmed and not to be picked, while the new airplane's come.
      await expect(line).toHaveAttribute("data-stale", "");
      await expect(line).not.toHaveAttribute("data-stale", { timeout: slow(10_000) });
    },
    // Nothing moves but the figures' own widths as the plan comes in.
    { maxMoves: 0, shiftBudget: 0.005, settleMs: 1000 },
  );
  expect(await page.evaluate(() => (window as unknown as { routeLineGone: number }).routeLineGone)).toBe(0);
});
