import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { drawn, settle, slow } from "./helpers";
import { drawnMarks } from "./marks";

/**
 * An approach's FAA plate on the map, ForeFlight's way (the owner's
 * screenshots, 2026-11-11; features/plates): with KOSH's ILS RWY 36 picked,
 * the whole page is laid on the chart, the approach's fixes are tagged as
 * the engine answers (approach_fix_tags), and a tap on the page opens the
 * plate's card, whose Show Annotations takes the tags off and whose Hide
 * Plate takes the plate away with the approach still on the route.
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

test("a tap on the plate opens its card; Show Annotations and Hide Plate change the map", async ({ page }) => {
  await page.route(
    (url) => /\/airport\/KOSH\/procedures\/I36$/.test(url.pathname),
    (route) => route.fulfill({ json: KOSH.drawings["I36:OSH"] }),
  );
  await page.route(
    (url) => /\/airport\/KOSH\/procedures\/I36\/plate$/.test(url.pathname),
    (route) => route.fulfill({ json: PLATE }),
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
  await expect.poll(() => tag("POBER"), { timeout: slow(20_000) }).not.toBeNull();
  expect(String((await tag("POBER"))!.lines)).toContain("GS 2,610'");
  expect(String((await tag("RW36"))!.lines)).toContain("TCH 53'");

  // A tap on the page west of the final, half way to its edge, clear of
  // the marks: its card. Where that is on the screen is worked out from
  // two tags' fixes, as the route is fitted at whatever zoom the sheet
  // leaves room for (Web Mercator: a degree of longitude is a degree of
  // latitude's pixels times the cosine of the latitude).
  const a = (await tag("POBER"))!;
  const b = (await tag("RW36"))!;
  const perDegree = (a.y - b.y) / (FIX.RW36!.lat - FIX.POBER!.lat);
  const west = (FIX.RW36!.lon - PLATE.page.top_left.lon) / 2;
  await page.mouse.click(b.x - west * perDegree * Math.cos((FIX.RW36!.lat * Math.PI) / 180), (a.y + b.y) / 2);
  const card = page.getByTestId("plate-card");
  await expect(card).toBeVisible({ timeout: slow(10_000) });
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
