import { test, expect, type Page } from "@playwright/test";
import { openMapSettings, settle, slow } from "./helpers";

/**
 * The radar and satellite loop (features/weather-loop, the owner's
 * 2026-11-09 ask): picked from the Map menu's Weather group, its bar over
 * the map plays the frames once they have loaded, says each one's time in
 * Zulu and its age, scrubs, and under Reduce Motion shows the newest frame
 * still. The planner's frames stubbed, and IEM's and nowCOAST's tiles
 * answered with one clear pixel, so nothing here reaches either.
 */

// A transparent 1x1 PNG, every tile's answer.
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==", "base64");

/** Twelve radar frames five minutes apart, the newest four minutes ago,
 *  as wingtip.weather_loop lists them. */
function radarLoop() {
  const newest = Math.floor((Date.now() - 4 * 60_000) / 300_000) * 300_000;
  const frames = Array.from({ length: 12 }, (_, i) => {
    const at = new Date(newest - (11 - i) * 300_000);
    const stamp = at.toISOString().slice(0, 16).replace(/[-:T]/g, "");
    return {
      valid: `${at.toISOString().slice(0, 19)}Z`,
      radar_tiles: `https://mesonet.agron.iastate.edu/c/tile.py/1.0.0/ridge::USCOMP-N0Q-${stamp}/{z}/{x}/{y}.png`,
      satellite_tiles: null,
    };
  });
  return { kind: "radar", frames, step_s: 300, old_after_s: 900, credit: "Radar: NWS NEXRAD composite via IEM. Not for navigation." };
}

async function stubLoop(page: Page) {
  const asked: string[] = [];
  await page.route(
    (url) => url.hostname === "mesonet.agron.iastate.edu" || url.hostname === "nowcoast.noaa.gov",
    (route) => route.fulfill({ body: PIXEL, contentType: "image/png" }),
  );
  await page.route(
    (url) => url.pathname.endsWith("/weather/loop"),
    (route) => {
      asked.push(new URL(route.request().url()).searchParams.get("kind") ?? "");
      return route.fulfill({ json: radarLoop() });
    },
  );
  return asked;
}

async function turnOnRadar(page: Page) {
  await openMapSettings(page);
  await page.getByTestId("weather-loop").click();
  await page.getByTestId("weather-loop-radar").click();
  await expect(page.getByTestId("weather-loop-speed")).toBeVisible();
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("map-settings")).toHaveCount(0, { timeout: 1000 });
  }).toPass({ timeout: slow(10000) });
}

test("the radar loop is turned on from the Map menu, plays once loaded, and scrubs", { tag: "@smoke" }, async ({ page }) => {
  const asked = await stubLoop(page);
  await page.goto("/app/plan");
  await settle(page);
  // Off until asked for: no bar, nothing asked of the planner.
  await expect(page.getByTestId("weather-loop-bar")).toHaveCount(0);
  expect(asked).toHaveLength(0);

  await turnOnRadar(page);
  const bar = page.getByTestId("weather-loop-bar");
  await expect(bar).toBeVisible();
  expect(asked).toContain("radar");
  // Played by itself once the frames' tiles are in.
  await expect(page.getByTestId("weather-loop-play")).toHaveAccessibleName("Pause", { timeout: slow(15000) });
  await expect(page.getByTestId("weather-loop-time")).toContainText(/\d{4}Z/);

  // Scrubbed to the first frame: paused there, an hour old, said so.
  await page.getByRole("slider", { name: "Radar frame" }).focus();
  await page.keyboard.press("Home");
  await expect(page.getByTestId("weather-loop-play")).toHaveAccessibleName("Play");
  await expect(page.getByTestId("weather-loop-time")).toContainText(/Old: \d+m ago|Old: 1h/);

  // Off again from the menu: the bar goes.
  await openMapSettings(page);
  await page.getByTestId("weather-loop").click();
  await page.getByTestId("weather-loop-off").click();
  await page.keyboard.press("Escape");
  await expect(bar).toHaveCount(0);
});

test("under Reduce Motion the loop shows the newest frame and does not play", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await stubLoop(page);
  await page.goto("/app/plan");
  await settle(page);
  await turnOnRadar(page);
  await expect(page.getByTestId("weather-loop-time")).toContainText(/\d{4}Z/);
  // The newest frame, four to nine minutes old, and still.
  await expect(page.getByTestId("weather-loop-time")).not.toContainText("Old");
  await expect(page.getByTestId("weather-loop-play")).toHaveAccessibleName("Play");
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("weather-loop-play")).toHaveAccessibleName("Play");
});
