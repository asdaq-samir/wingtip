import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { drawn, mapStill, settle, slow } from "./helpers";
import { drawnMarks } from "./marks";

/**
 * An approach's FAA plate on the map, ForeFlight's way (the owner's
 * screenshots, 2026-11-11; features/plates): with KOSH's ILS RWY 36 picked,
 * the whole page is laid on the chart, the approach's fixes are tagged as
 * the engine answers (approach_fix_tags), and a tap on the page opens the
 * plate's card, whose Show Annotations takes the tags off and whose Hide
 * Plate takes the plate away with the approach still on the route; full
 * screen, the pilot's position is on the plate's plan view.
 */

const KOSH = JSON.parse(readFileSync(new URL("../src/lib/fixtures/approachKosh.json", import.meta.url), "utf8")) as {
  drawings: Record<string, { fixes: { ident: string; lat: number; lon: number }[] }>;
};
const FIX = Object.fromEntries(KOSH.drawings["I36:OSH"]!.fixes.map((f) => [f.ident, f]));

// The page between four corners round the final, as the planner places it
// (PlateOverlay.page): wide enough that its middle is clear of every mark.
const PLATE = {
  cycle: "2611",
  name: "ILS OR LOC RWY 36",
  south: 43.75,
  west: -88.7,
  north: 44.02,
  east: -88.4,
  fixes: ["POBER", "CFBSM", "RW36"],
  circling: true,
  page: {
    width: 1275,
    height: 1650,
    top_left: { lat: 44.12, lon: -88.82 },
    top_right: { lat: 44.12, lon: -88.28 },
    bottom_right: { lat: 43.6, lon: -88.28 },
    bottom_left: { lat: 43.6, lon: -88.82 },
  },
};

// A white pixel for the page's picture: what is drawn is not under test.
const WHITE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");

/** KOSH's ILS RWY 36 on the route, its plate as `plate`, and a tap on its
 *  page opening the plate's card: the card. */
async function openPlateCard(page: Page, plate: typeof PLATE) {
  await page.route(
    (url) => /\/airport\/KOSH\/procedures\/I36$/.test(url.pathname),
    (route) => route.fulfill({ json: KOSH.drawings["I36:OSH"] }),
  );
  await page.route(
    (url) => /\/airport\/KOSH\/procedures\/I36\/plate$/.test(url.pathname),
    (route) => route.fulfill({ json: plate }),
  );
  await page.route(
    (url) => /\/approach-plate(-page)?\/2611\/KOSH\/I36\.png$/.test(url.pathname),
    (route) => route.fulfill({ body: WHITE, contentType: "image/png" }),
  );
  await page.goto("/app/plan?dep=C81&dest=KOSH&procs=KOSH:I36:OSH");
  await settle(page);

  // The fixes tagged: POBER at or above 2,700 (underlined) with the glide
  // slope's 2,610; the runway its TCH and TDZE.
  // Drawn on the map's canvas, as the tags' probe says (PlateTagsGl).
  const tags = () => drawnMarks(page, "plate-tags");
  const tag = async (ident: string) => (await tags()).find((t) => t.ident === ident) ?? null;
  // The tags are drawn from the procedures' words' zoom (map.zoom.
  // procedure-words, 9; PlatesGl, the owner's iPhone, 2026-11-23): where
  // the route is fitted farther out, a phone's whole C81-KOSH, the map is
  // zoomed in on Oshkosh, as a pilot pinches in on the field.
  await expect(async () => {
    if (await tag("POBER")) return;
    const kosh = (await drawnMarks(page, "route-marks")).find((m) => m.text === "KOSH");
    expect(kosh, "KOSH's mark on the map").toBeTruthy();
    await page.mouse.move(kosh!.x, kosh!.y);
    await page.mouse.wheel(0, -400);
    await mapStill(page);
    expect(await tag("POBER")).not.toBeNull();
  }).toPass({ timeout: slow(30_000) });

  // A tap on the page west of the final, half way to its edge, clear of
  // the marks: its card. Where that is on the screen is worked out from
  // two tags' fixes, as the route is fitted at whatever zoom the sheet
  // leaves room for (Web Mercator: a degree of longitude is a degree of
  // latitude's pixels times the cosine of the latitude).
  const a = (await tag("POBER"))!;
  const b = (await tag("RW36"))!;
  const perDegree = (a.y - b.y) / (FIX.RW36!.lat - FIX.POBER!.lat);
  const west = (FIX.RW36!.lon - plate.page.top_left.lon) / 2;
  await page.mouse.click(b.x - west * perDegree * Math.cos((FIX.RW36!.lat * Math.PI) / 180), (a.y + b.y) / 2);
  const card = page.getByTestId("plate-card");
  await expect(card).toBeVisible({ timeout: slow(10_000) });
  return card;
}

test("a tap on the plate opens its card; Show Annotations and Hide Plate change the map", async ({ page }) => {
  const card = await openPlateCard(page, PLATE);
  const tags = () => drawnMarks(page, "plate-tags");
  const tag = async (ident: string) => (await tags()).find((t) => t.ident === ident) ?? null;
  // Each figure as every map tag writes one: no unit, no tick.
  expect(String((await tag("POBER"))!.lines)).toContain("GS 2,610");
  expect(String((await tag("RW36"))!.lines)).not.toContain("'");
  expect(String((await tag("RW36"))!.lines)).toContain("TCH 53");
  // Each fix tagged once: the plate's tag, the procedure's own fix left
  // with its diamond (the owner's pick, 2026-11-18).
  expect((await drawn(page, "procedure-fixes")).find((f) => f.ident === "POBER")?.tag).toBe("");
  await expect(page.getByRole("heading", { name: "KOSH ILS or LOC rwy 36" })).toBeVisible();
  await expect(card.getByRole("slider", { name: "Plate transparency" })).toBeVisible();

  // Show Annotations off takes the tags away, on puts them back.
  await card.getByTestId("plate-annotations").click();
  await expect.poll(async () => (await tags()).length).toBe(0);
  await card.getByTestId("plate-annotations").click();
  await expect.poll(() => tag("POBER")).not.toBeNull();

  // Hide Plate: the card put away, the plate and its tags gone, the
  // approach's own fixes still drawn on the route.
  await card.getByTestId("plate-hide").click();
  await expect(card).toHaveCount(0);
  await expect.poll(async () => (await tags()).length).toBe(0);
  await expect.poll(async () => (await drawn(page, "procedure-fixes")).filter((f) => f.ident === "POBER").length).toBe(1);
});

// The plate's own georeference as the planner gives it
// (PlateOverlay.page.georeference): a d-TPP page, 396 by 612 points, at the
// plan view's 1:500,000 (72 / 0.0254 / 500,000 points a metre), its
// projection's origin at 43.9 N 88.557 W drawn at the page's middle.
const SCALE = 72 / 0.0254 / 500_000;
const PLATE_PLACED = {
  ...PLATE,
  page: {
    ...PLATE.page,
    georeference: {
      lat_0: 43.9,
      lon_0: -88.557,
      lat_1: 46.666667,
      lat_2: 41.333333,
      to_page: [SCALE, 0, 198, 0, SCALE, 306],
      width_pt: 396,
      height_pt: 612,
      plan_view: { left: 9, bottom: 200, right: 387, top: 560 },
      insets: [],
    },
  },
};
/** Where the fake GPS is: on the final, 3 nm north of the origin, so on the
 *  page's middle line 0.4485 of the way down (5,560 m north is 31.5
 *  points over its middle: 1 - 337.5 / 612). */
const ON_FINAL = { lat: 43.95, lon: -88.557, y: 1 - (306 + 5560 * SCALE) / 612 };
/** The FAA chart's one page, as the planner draws it (/api/faa-chart/page). */
const SHEET = { width: 1980, height: 3060 };

/** A GPS answering later, as a real one does, flying north up the final
 *  (ON_FINAL); the field listing the plate's chart, its one page drawn
 *  white; and the plate's card open. */
async function openPlacedPlate(page: Page) {
  await page.addInitScript(
    ([lat, lon]) => {
      const position = () =>
        ({
          coords: {
            latitude: lat,
            longitude: lon,
            accuracy: 5,
            heading: 0,
            speed: 45,
            altitude: 600,
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
      localStorage.setItem("wingtip.ownship", JSON.stringify({ state: { enabled: true, follow: false, lastFix: null }, version: 0 }));
    },
    [ON_FINAL.lat, ON_FINAL.lon] as const,
  );
  // The field lists the plate's chart, its one page drawn white.
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airport/KOSH"),
    async (route) => {
      const answer = await route.fetch();
      await route.fulfill({
        response: answer,
        json: {
          ...(await answer.json()),
          procedures: [{ kind: "IAP", name: PLATE.name, url: "https://aeronav.faa.gov/d-tpp/2611/00078IL36.PDF" }],
        },
      });
    },
  );
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/faa-chart"),
    (route) => route.fulfill({ json: { pages: [{ source: "dtpp", edition: "2611", pdf: "00078IL36.PDF", page: 1, ...SHEET }] } }),
  );
  await page.route(
    (url) => url.pathname.includes("/api/planner/faa-chart/page/"),
    (route) => route.fulfill({ body: WHITE, contentType: "image/png" }),
  );
  return openPlateCard(page, PLATE_PLACED);
}

test.describe("own ship on the plate full screen", () => {
  test.use({ permissions: ["geolocation"] });

  test("the position is on the plate's plan view where its georeference puts it, and stays there through a zoom", async ({ page }) => {
    const card = await openPlacedPlate(page);
    await card.getByTestId("plate-full-screen").click();
    const viewer = page.getByTestId("airport-diagram-viewer");
    const mark = viewer.getByTestId("chart-own-ship");
    await expect(mark).toBeVisible({ timeout: slow(10_000) });
    await expect(mark.locator("[data-own-ship='on']")).toHaveCount(1);

    // The page whole in the viewer, centred: the mark on its middle line,
    // 0.4485 of the way down it.
    const centre = async () => {
      const b = (await mark.boundingBox())!;
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    // Measured again until the viewer is at rest: the stock Dialog opens
    // from a little smaller (its own motion), and the page measured on its
    // way in put the mark 10 points off where it lands.
    const off = async () => {
      const frame = (await viewer.locator("[data-pages]").boundingBox())!;
      const scale = Math.min(frame.width / SHEET.width, frame.height / SHEET.height);
      const top = frame.y + frame.height / 2 - (SHEET.height * scale) / 2;
      const c = await centre();
      return Math.max(Math.abs(c.x - (frame.x + frame.width / 2)), Math.abs(c.y - (top + ON_FINAL.y * SHEET.height * scale)));
    };
    await expect.poll(off, { timeout: slow(5_000) }).toBeLessThan(3);

    // A double tap beside it zooms in twice about the tap: the mark goes
    // twice as far from that point, on its place on the page.
    const before = await centre();
    const at = { x: before.x + 40, y: before.y + 60 };
    await page.mouse.dblclick(at.x, at.y);
    await expect
      .poll(
        async () => {
          const now = await centre();
          return Math.hypot(now.x - (at.x + 2 * (before.x - at.x)), now.y - (at.y + 2 * (before.y - at.y)));
        },
        { timeout: slow(5_000) },
      )
      .toBeLessThan(3);
  });
});

// At an 11-inch iPad's width on its side the plate is in its card beside
// the map, own ship on it, the map still in sight to its left: the
// layout an IFR pilot flies (the market-gap report's item 4, 2026-11-21).
test.describe("the plate beside the map at a tablet's width", () => {
  test.use({ permissions: ["geolocation"], viewport: { width: 1194, height: 834 } });

  test("the card holds the plate with own ship on it, the map beside it", async ({ page }) => {
    const card = await openPlacedPlate(page);
    const beside = card.getByTestId("plate-beside");
    await expect(beside).toBeVisible({ timeout: slow(10_000) });
    await expect(beside.getByTestId("chart-own-ship")).toBeVisible({ timeout: slow(10_000) });
    await expect(beside).toHaveAttribute("data-own-ship", "shown");
    // The map's room still wide beside the card: the two side by side.
    const box = (await beside.boundingBox())!;
    expect(box.width).toBeGreaterThan(250);
    const map = (await page.locator("#content").boundingBox())!;
    expect(map.width - box.width).toBeGreaterThan(400);
  });
});
