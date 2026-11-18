import { test, expect, type Page } from "@playwright/test";
import { airportMarks, drawn, mapStill, settle, slow, tapTheChart } from "./helpers";
import { drawnMarks, markWith, tapMark } from "./marks";

/**
 * One thing picked on the map at a time, in one selection colour (the
 * selection audit, the owner's picks of 2026-11-18; docs/design/rules.md
 * §13): a ring goes with its card, a point the route turns at opens a card,
 * a new pick puts the last card away, and own ship opens a card of its own,
 * as Apple Maps' My Location does. The rings are MapLibre's, read through
 * their probes (RouteExtrasGl's picked-ring, AirportsGl's selected-airport).
 */

const rings = async (page: Page) => (await drawn(page, "picked-ring")).length;
const openCard = (page: Page) => page.locator("[data-sheet-card]").filter({ visible: true }).last();

test("a checkpoint's ring goes with its card: its ✕ and a tap on the chart each take it off", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await tapMark(page, "route-marks", /^\d+$/);
  await expect(openCard(page)).toContainText("nm along", { timeout: slow(10000) });
  await expect.poll(() => rings(page), { timeout: slow(10000) }).toBeGreaterThan(0);
  // Its ✕: the card and its ring both gone, where the ring stayed on.
  await page.getByTestId("sheet-card-close").filter({ visible: true }).last().click();
  await expect.poll(() => rings(page), { timeout: slow(10000) }).toBe(0);
  // Again, and a tap on the chart itself.
  await tapMark(page, "route-marks", /^\d+$/);
  await expect.poll(() => rings(page), { timeout: slow(10000) }).toBeGreaterThan(0);
  await tapTheChart(page);
  await expect.poll(() => rings(page), { timeout: slow(10000) }).toBe(0);
});

test("a point the route turns at opens its card, ringed, where it only brought the map in", async ({ page }) => {
  // Nothing of the route through it asked of the planner past its course.
  await page.route(
    (url) => /\/(checkpoints|navlog|briefing)$/.test(url.pathname) && url.searchParams.get("stops") === "VPBNG",
    (route) => route.abort(),
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH&stops=VPBNG");
  await settle(page);
  await expect.poll(async () => (await drawnMarks(page, "route-turns")).map((t) => t.name), { timeout: slow(15000) }).toContain("VPBNG");
  // Closer in on C81 till VPBNG's name is drawn clear of the field's.
  await expect(async () => {
    if (!(await markWith(page, "route-marks", "VPBNG")())) {
      const departure = (await markWith(page, "route-marks", "C81")())!;
      await page.mouse.move(departure.x, departure.y);
      await page.mouse.wheel(0, -1000);
      await mapStill(page);
    }
    expect(await markWith(page, "route-marks", "VPBNG")()).not.toBeNull();
  }).toPass({ timeout: slow(15000) });
  await tapMark(page, "route-marks", "VPBNG");
  const card = openCard(page);
  await expect(card.getByRole("heading", { name: "VPBNG" })).toBeVisible({ timeout: slow(10000) });
  await expect(card.getByTestId("card-sub")).toHaveText("Route point");
  await expect(card.getByTestId("point-where")).toBeVisible();
  await expect.poll(() => rings(page), { timeout: slow(10000) }).toBeGreaterThan(0);
});

test("a new pick puts the last card away: a field tapped closes a VOR's card and its ring", async ({ page }) => {
  await page.goto(`/app/plan?navaid=${encodeURIComponent("OBK@42.2214,-87.9517")}`);
  await expect(openCard(page).getByRole("heading", { name: "OBK" })).toBeVisible({ timeout: slow(20000) });
  await expect.poll(() => rings(page), { timeout: slow(10000) }).toBeGreaterThan(0);
  // A field drawn on the open chart above the card.
  await mapStill(page);
  const sheetTop = (await openCard(page).boundingBox())!.y;
  const width = page.viewportSize()!.width;
  const open = async () => (await airportMarks(page)).find((m) => m.y > 90 && m.y < sheetTop - 30 && m.x > 30 && m.x < width - 70) ?? null;
  await expect.poll(open, { timeout: slow(20000) }).not.toBeNull();
  const field = (await open())!;
  await page.mouse.click(field.x, field.y);
  await expect(page.getByTestId("place-card").filter({ visible: true })).toBeVisible({ timeout: slow(15000) });
  // The VOR's card, its key and its ring gone; the field's ring alone.
  await expect.poll(() => new URL(page.url()).searchParams.get("navaid")).toBeNull();
  await expect(page.getByRole("heading", { name: "OBK" })).toHaveCount(0);
  await expect.poll(() => rings(page), { timeout: slow(10000) }).toBe(0);
  await expect.poll(async () => (await drawn(page, "selected-airport")).length, { timeout: slow(10000) }).toBe(1);
});

test.describe("own ship", () => {
  test.use({ permissions: ["geolocation"] });

  test("a tap on own ship opens its card, as Maps' My Location: where it is, Nearest and Direct To", async ({ page }) => {
    // A GPS on the ground at Campbell Airport (C81), a fix a second.
    await page.addInitScript(() => {
      const position = () =>
        ({
          coords: { latitude: 42.3246, longitude: -88.0741, accuracy: 10, heading: null, speed: 0, altitude: null, altitudeAccuracy: null },
          timestamp: Date.now(),
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
        JSON.stringify({ state: { enabled: true, follow: true, lastFix: { lat: 42.3246, lon: -88.0741 } }, version: 0 }),
      );
    });
    await page.goto("/app/plan");
    await settle(page);
    const ship = page.locator('[data-own-ship="on"]');
    await expect(ship).toBeVisible({ timeout: slow(15000) });
    await mapStill(page);
    const at = (await ship.boundingBox())!;
    await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
    const card = openCard(page);
    await expect(card.getByRole("heading", { name: "My Location" })).toBeVisible({ timeout: slow(10000) });
    await expect(card.getByTestId("card-sub")).toContainText("N42°");
    await expect(card.getByTestId("own-ship-direct-to")).toBeVisible();
    // Nearest: the fields nearest it, its card put away.
    await card.getByTestId("own-ship-nearest").click();
    await expect(page.getByTestId("nearest-card").filter({ visible: true })).toBeVisible({ timeout: slow(15000) });
    await expect(page.getByRole("heading", { name: "My Location" })).toHaveCount(0);
  });
});
