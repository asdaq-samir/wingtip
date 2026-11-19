import { test, expect, type Page, type Route } from "@playwright/test";
import { grabberTo, mapStill, openMapSettings, sideDrawer, slow, tapNear } from "./helpers";
import { mapZoom } from "./mapZoom";
import { markWith, tapMark } from "./marks";

/**
 * The Class B airports on the map.
 *
 * Mocked rather than live wherever the assertion is about what is
 * shown: the real endpoint returns whatever the weather is doing right
 * now, and a test that passes only while Chicago is VFR is not a test.
 * The count and the terminal-chart tap run against the real planner,
 * because those are about the map rather than the numbers.
 */

// Nothing is drawn at the map's corner any more; the assertions that
// used to live there are in layout.spec.ts against the map's settings.
// The mocks below apply because playwright.config.ts blocks the app's
// service worker for the whole suite.

const PLAN = "/app/plan?dep=C81&dest=KDLH";
// The Class B fields' marks (ClassBGl), every one given, in sight or
// not, with its weather's colour: the map's data-class-b-fields.
const chips = async (page: Page) =>
  JSON.parse((await page.getByTestId("gl-map").first().getAttribute("data-class-b-fields")) ?? "[]") as {
    ident: string;
    weather: string;
  }[];
const chip = async (page: Page, ident: string) => (await chips(page)).find((c) => c.ident === ident) ?? null;
/** KORD's mark drawn on the map's canvas, where it is on the page. */
const ord = (page: Page) => markWith(page, "class-b-fields", "KORD");

/** KORD's mark on the screen. On a desktop the route's whole view runs the
 *  window's height, and O'Hare, south of C81, is drawn just past its foot
 *  (MapLibre places a mark a little out of the view): dragged up into
 *  sight first, as a pilot would, where a tap or the wheel off the window
 *  was lost. A phone's view, narrower, is further out and has it in sight. */
async function ordInSight(page: Page) {
  const viewport = page.viewportSize()!;
  const at = (await ord(page)())!;
  if (at.y <= viewport.height - 60) return at;
  const from = { x: viewport.width - 200, y: viewport.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y - (at.y - viewport.height * 0.6), { steps: 10 });
  await page.mouse.up();
  await mapStill(page);
  return (await ord(page)())!;
}

/** The route on the map: its destination drawn, which is after the
 *  course has arrived and the marks laid out. It used to be a flat four
 *  seconds a test. */
async function routeDrawn(page: Page) {
  await expect.poll(markWith(page, "route-marks", "KDLH"), { timeout: 20000 }).not.toBeNull();
}

const FIXTURE = {
  airports: [
    {
      ident: "KORD",
      name: "Chicago O'Hare International Airport",
      lat: 41.978,
      lon: -87.908,
      floor_ft_msl: 0,
      shelves: 12,
      flight_category: "IFR",
      metar: "METAR KORD 221451Z 08014KT 1SM BR OVC004",
      ceiling_ft: 400,
      visibility_sm: 1,
      wind_dir_true_deg: 80,
      wind_speed_kt: 14,
      taf: "TAF KORD 221500Z 2215/2318 07012G20KT 2SM",
      taf_ceiling_ft: 800,
      taf_visibility_sm: 2,
    },
    {
      ident: "KMSP",
      name: "Minneapolis St Paul International Airport",
      lat: 44.882,
      lon: -93.222,
      floor_ft_msl: 0,
      shelves: 9,
      flight_category: null,
      metar: null,
      ceiling_ft: null,
      visibility_sm: null,
      wind_dir_true_deg: null,
      wind_speed_kt: null,
      taf: null,
      taf_ceiling_ft: null,
      taf_visibility_sm: null,
    },
  ],
};

/** The client rewrites every planner path through the gateway
 *  (/api/x -> /api/planner/x) in a middleware, so the URL the network
 *  actually sees is not the one the call site wrote. Matching on the
 *  tail is what survives that. */
async function mockClassB(page: Page) {
  await page.route(
    (url) => url.pathname.endsWith("/class-b"),
    (route: Route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FIXTURE) }),
  );
}

test("every Class B is on the map by name, always: no switch, the owner's 2026-11-17 word", { tag: "@smoke" }, async ({ page }) => {
  await page.goto(PLAN);
  await routeDrawn(page);
  // The real planner: thirty is what the FAA's own shapefile yields.
  await expect.poll(async () => (await chips(page)).length, { timeout: 20000 }).toBe(30);
  expect((await chips(page)).filter((c) => c.ident === "KORD")).toHaveLength(1);
});

test("the marker's weather dot is the field's own flight category", async ({ page }) => {
  await mockClassB(page);
  await page.goto(PLAN);
  await routeDrawn(page);

  // IFR is red. A field with no report is grey, deliberately not the
  // green one: "unknown" must not look like "fine".
  await expect.poll(async () => (await chip(page, "KORD"))?.weather.toLowerCase(), { timeout: 15000 }).toBe("#b3261e");
  expect((await chip(page, "KMSP"))?.weather.toLowerCase()).toBe("#8fa3b0");
});

test("tapping one opens its card in the panel, with Fly Here, as any airport on the chart does", async ({ page }) => {
  // It had a card of its own on the map, the METAR and the TAF raw and a
  // pin for its terminal chart; the field's card in the panel has the
  // weather, the radio and the runways, and the settings' TAC the chart.
  await mockClassB(page);
  await page.goto(PLAN);
  await routeDrawn(page);

  // At the route's whole view O'Hare's mark is little more than a finger
  // from C81's chip, which the map's one tap takes first within its reach
  // (TAP.rank): closer in round O'Hare, so the tap is plainly its.
  await expect.poll(ord(page), { timeout: slow(30000) }).not.toBeNull();
  const at = await ordInSight(page);
  await page.mouse.move(at.x, at.y);
  await page.mouse.wheel(0, -600);
  await tapMark(page, "class-b-fields", "KORD");
  await expect(page).toHaveURL(/[?&]place=KORD/);
  // The live card, unmocked: the class-b fixture is only the chips.
  await expect(page.getByTestId("place-full-name")).toContainText("O'Hare", { timeout: 15000 });
  await expect(page.getByTestId("fly-here")).toBeVisible();
  await expect(page.locator(".maplibregl-popup")).toHaveCount(0);
});

test("a tap a little off one's mark opens its card, as off any airport on the chart", async ({ page }) => {
  // A tap near KORD's chip opens O'Hare's card. It put the card away,
  // where near any other field it opened that field's. (The chart's own
  // O'Hare, from the overlay tiles, is under the chip, and opens the same.)
  await mockClassB(page);
  // Chicago Executive's card, O'Hare's chip some 65 points south of it.
  await page.goto("/app/plan?place=KPWK");
  await expect(sideDrawer(page).getByTestId("place-card")).toBeVisible({ timeout: slow(15000) });
  await expect.poll(ord(page), { timeout: 15000 }).not.toBeNull();
  await tapNear(page, ord(page), /[?&]place=KORD(&|$)/);
});

test("on the training map, which has no card, a tap brings the field to the map's middle at the pilot's zoom", async ({ page }) => {
  // The terminal chart is drawn over the sectional at every zoom (the
  // owner, 2026-11-16: "just keep the TAC all the time"), so the tap no
  // longer goes in to where it starts, and a thing tapped keeps the
  // pilot's zoom (docs/design/rules.md §14, 5): O'Hare comes to the
  // middle, the TAC drawn there, the zoom the pilot's.
  await mockClassB(page);
  await page.goto("/app/dev?dep=C81&dest=KDLH");
  await expect.poll(ord(page), { timeout: 20000 }).not.toBeNull();
  await expect(page.getByTestId("gl-map")).toHaveAttribute("data-chart-kinds", "sec tac");

  await mapStill(page);
  await ordInSight(page);
  const before = await mapZoom(page);
  await tapMark(page, "class-b-fields", "KORD");
  // GlMapShell's data-center, the map's middle once at rest.
  const middle = async () => (await page.getByTestId("gl-map").getAttribute("data-center"))!.split(",").map(Number);
  await expect
    .poll(
      async () => {
        const [lat, lon] = await middle();
        return Math.hypot(lat - 41.978, lon + 87.908);
      },
      { timeout: 20000 },
    )
    .toBeLessThan(0.05);
  expect(await mapZoom(page)).toBeCloseTo(before, 2);
  await expect(page.locator(".maplibregl-popup")).toHaveCount(0);
});

test("on an IFR base, the IFR area chart is drawn at a Class B field", async ({ page }) => {
  // The terminal sheet over an IFR chart is the IFR area chart, always
  // drawn where it exists (the owner, 2026-11-14: no switch).
  const areaTiles: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/ifr_area/")) areaTiles.push(r.url());
  });
  await mockClassB(page);
  await page.goto("/app/dev?dep=C81&dest=KDLH");
  await openMapSettings(page);
  await grabberTo(page, "full");
  await page.getByTestId("base-chart-select").getByRole("button", { name: "IFR low" }).click();
  await page.keyboard.press("Escape");

  await mapStill(page);
  await ordInSight(page);
  await tapMark(page, "class-b-fields", "KORD");
  await expect.poll(() => areaTiles.length, { timeout: 20000 }).toBeGreaterThan(0);
});
