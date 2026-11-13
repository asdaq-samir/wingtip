import { test, expect, type Page } from "@playwright/test";
import { grabberTo, openMapSettings, settle, slow } from "./helpers";

/**
 * The radar and satellite loop (features/weather-loop, the owner's
 * 2026-11-09 ask): picked from the Map menu's Weather group, its bar over
 * the map plays the frames once they have loaded, says each one's time in
 * Zulu and its age, scrubs, and under Reduce Motion shows the newest frame
 * still. Its bar is the map's one playback bar (components/PlaybackBar):
 * a toolbar, Play a toggle (aria-pressed), the scrubber's keys, Space and
 * Now (docs/design/web.md §7). The planner's frames stubbed, and IEM's and nowCOAST's tiles
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
  // The Map card opens half way, as every card does (e7bb15ec8): pulled all the way up, its rows in reach.
  await grabberTo(page, "full");
  await page.getByTestId("weather-loop").click();
  await page.getByTestId("weather-loop-radar").click();
  // With a loop on, its speed is a second group of the tile's menu.
  await page.getByTestId("weather-loop").click();
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
  await expect(page.getByTestId("weather-loop-play")).toHaveAttribute("aria-pressed", "true", { timeout: slow(15000) });
  await expect(page.getByTestId("weather-loop-time")).toContainText(/\d{4}Z/);

  // Scrubbed to the first frame: paused there, an hour old, said so.
  // End, then Home: a key that leaves the frame where it is changes
  // nothing, and the playing loop may be on the first frame already.
  await page.getByRole("slider", { name: "Radar frame" }).focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Home");
  await expect(page.getByTestId("weather-loop-play")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("weather-loop-time")).toContainText(/Old: \d+m ago|Old: 1h/);

  // Off again from the menu: the bar goes.
  await openMapSettings(page);
  await grabberTo(page, "full");
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
  await expect(page.getByTestId("weather-loop-play")).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("weather-loop-play")).toHaveAttribute("aria-pressed", "false");
});

test("the loop bar's keys: arrows step a frame, Space plays, one pass stops on the newest, Now goes back to it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await stubLoop(page);
  await page.goto("/app/plan");
  await settle(page);
  await turnOnRadar(page);
  const play = page.getByTestId("weather-loop-play");
  const time = page.getByTestId("weather-loop-time");
  await expect(time).toContainText(/\d{4}Z/);
  await expect(play).toHaveAttribute("aria-pressed", "false");
  const slider = page.getByRole("slider", { name: "Radar frame" });
  await slider.focus();
  // ← steps back a frame: the newest no longer shown.
  const newest = await time.textContent();
  await page.keyboard.press("ArrowLeft");
  await expect(time).not.toHaveText(newest ?? "");
  // Now takes it back to the newest frame.
  await page.getByTestId("weather-loop-now").click();
  await expect(time).toHaveText(newest ?? "");
  // Space from the scrubber plays a pass from the oldest frame (Reduce
  // Motion only keeps it from starting by itself), which ends still on
  // the newest: twelve frames at half a second each.
  await slider.focus();
  await page.keyboard.press(" ");
  await expect(play).toHaveAttribute("aria-pressed", "true");
  await expect(play).toHaveAttribute("aria-pressed", "false", { timeout: slow(15000) });
  await expect(time).toHaveText(newest ?? "");
  // The bar is one toolbar: Play and Now its buttons.
  await expect(page.getByRole("toolbar", { name: "Radar loop" })).toBeVisible();
});

test("the scrubber is live while the frames' tiles still load: a key then moves the frame", async ({ page }) => {
  // Under Reduce Motion, so nothing plays by itself once the tiles are in
  // (PRELOAD_CAP_MS at the latest) and the frame is the key's alone.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await stubLoop(page);
  // IEM's tiles held unanswered (the later route is asked first): the
  // frames not in, the loop not ready (WeatherLoopGl). A scrubber disabled
  // until they were dropped the key (LoopBar).
  let release = () => {};
  const held = new Promise<void>((done) => (release = done));
  await page.route(
    (url) => url.hostname === "mesonet.agron.iastate.edu",
    async (route) => {
      await held;
      await route.fulfill({ body: PIXEL, contentType: "image/png" });
    },
  );
  await page.goto("/app/plan");
  await settle(page);
  await turnOnRadar(page);
  const time = page.getByTestId("weather-loop-time");
  await expect(time).toContainText(/\d{4}Z/);
  await expect(time).not.toContainText("Old");
  const slider = page.getByRole("slider", { name: "Radar frame" });
  await expect(slider).toBeEnabled();
  await slider.focus();
  await page.keyboard.press("Home");
  // The oldest frame, an hour old, said so, its tiles still coming.
  await expect(time).toContainText(/Old: \d+m ago|Old: 1h/);
  release();
});

test("on a desktop a mouse over the scrubber shows that frame and says its time, and leaving goes back", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "a mouse's hover, a desktop's");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await stubLoop(page);
  await page.goto("/app/plan");
  await settle(page);
  await turnOnRadar(page);
  const time = page.getByTestId("weather-loop-time");
  await expect(time).toContainText(/\d{4}Z/);
  const newest = await time.textContent();
  // The oldest frame under the pointer, at the scrubber's start: an hour
  // old, said in the time; the loop itself not moved (docs/design/web.md §7).
  const peek = page.getByTestId("weather-loop-peek");
  const box = (await peek.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await expect(time).toContainText(/Old: \d+m ago|Old: 1h/);
  // Away from it: the frame the loop is on again.
  await page.mouse.move(box.x + box.width / 2, box.y - 200);
  await expect(time).toHaveText(newest ?? "");
});
