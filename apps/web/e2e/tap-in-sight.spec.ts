import { test, expect, type Page } from "@playwright/test";
import { airportMarks, drawn, frontSheet, mapStill, settle, slow } from "./helpers";
import { expectDrawnOnce, installFrameRecorder } from "./drawnOnce";

/**
 * A mark tapped low on the chart is brought into sight over the card it
 * opens once, and the map stays there (components/map/cardRoom). The owner's
 * iPhone, 2026-11-14: "When I tap the EON ... It flickers" -- the map eased
 * the VORTAC up over its card, and half a second later own ship's next GPS
 * fix eased it back to the pilot's position, as the tap had left own ship
 * followed (OwnShipGl). The GPS here is a fake one standing over
 * Chicago, its next fix sent while the card is up. The VOR tapped is
 * Chicago Heights' VORTAC, CGT, not the owner's EON: Peotone (41.27 N) is
 * south of the box CI's overlay tiles are cut to (41.4 to 43.4 N,
 * scripts/build/e2e-overlay-tiles.sh), so CI never drew it; CGT, 15 nm
 * north-east of it, is inside, and as low on the chart over the pill.
 */

test.use({ permissions: ["geolocation"] });

/** Where the fake GPS stands: over Chicago, north of CGT (41.51, -87.57), so
 *  the map, opened on it, has CGT low on the chart over the search's pill. */
const HERE = { lat: 42.2, lon: -87.85 };

async function standing(page: Page) {
  await page.addInitScript((at) => {
    // The first fix as the watch starts; each after it when the test sends
    // it (`__nextFix`), a few feet from the last, as a phone's GPS standing
    // still sends one every second or so.
    let n = 0;
    const position = () =>
      ({
        coords: {
          latitude: at.lat + (n++ % 2) * 0.00001,
          longitude: at.lon,
          accuracy: 10,
          heading: null,
          speed: 0,
          altitude: null,
          altitudeAccuracy: null,
          toJSON() {
            return this;
          },
        },
        timestamp: Date.now(),
        toJSON() {
          return this;
        },
      }) as unknown as GeolocationPosition;
    const watchers = new Map<number, PositionCallback>();
    Geolocation.prototype.watchPosition = function (success: PositionCallback) {
      const id = watchers.size + 1;
      watchers.set(id, success);
      window.setTimeout(() => success(position()), 0);
      return id;
    };
    Geolocation.prototype.clearWatch = function (id: number) {
      watchers.delete(id);
    };
    Geolocation.prototype.getCurrentPosition = function (success: PositionCallback) {
      window.setTimeout(() => success(position()), 0);
    };
    (window as unknown as { __nextFix: () => void }).__nextFix = () => watchers.forEach((w) => w(position()));
    localStorage.setItem("wingtip.ownship", JSON.stringify({ state: { enabled: true, follow: true, lastFix: at }, version: 0 }));
  }, HERE);
}

/** CGT's mark on the page, as NavaidsGl's probe has it; null while it is not drawn. */
async function vor(page: Page): Promise<{ x: number; y: number } | null> {
  const box = (await page.getByTestId("gl-map").first().boundingBox())!;
  const mark = (await drawn(page, "navaid-marks")).find((m) => m.ident === "CGT");
  return mark ? { x: box.x + Number(mark.x), y: box.y + Number(mark.y) } : null;
}

test("a VOR tapped low on the chart is brought over its card once, and own ship's next fix leaves it there", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "a phone's card over the chart");
  await standing(page);
  await page.goto("/app/plan");
  await settle(page);
  await expect(page.locator('[data-own-ship="on"]')).toHaveCount(1, { timeout: slow(15000) });
  await mapStill(page);
  await expect.poll(() => vor(page), { timeout: slow(30000) }).not.toBeNull();
  const tapped = (await vor(page))!;
  // On the chart, under where the card comes to rest at half.
  expect(tapped.y).toBeLessThan((await frontSheet(page).boundingBox())!.y);
  // Every frame from the tap till the test has seen enough, as painted:
  // whether the chart is moving (the map's data-moving, from a move's start
  // to its end) and where its middle is (data-center, at each move's end).
  // Not a fixed window: on CI's runner the card's move came late in three
  // and a half seconds, and was over too near its end to see it held.
  await page.evaluate(() => {
    const w = window as unknown as { __frames: { t: number; moving: boolean; center: string }[]; __framesOn: boolean };
    const map = document.querySelector<HTMLElement>("[data-testid=gl-map]")!;
    const start = performance.now();
    w.__frames = [];
    w.__framesOn = true;
    const frame = () => {
      w.__frames.push({ t: performance.now() - start, moving: "moving" in map.dataset, center: map.dataset.center ?? "" });
      if (w.__framesOn) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  await page.mouse.click(tapped.x, tapped.y);
  // The card up and CGT brought over it, the map at rest: then the GPS's
  // next fix, and a second and more after it to see the map hold.
  const card = page.locator("[data-sheet-card][data-open]");
  await expect(card).toHaveAttribute("data-panel", "half");
  // Its move begun and ended (the frames say so), not only a still map
  // before it has started.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const f = (window as unknown as { __frames: { moving: boolean }[] }).__frames;
        return f.some((x, i) => i > 0 && !x.moving && f[i - 1]!.moving);
      }),
    )
    .toBe(true);
  await mapStill(page);
  await page.evaluate(() => (window as unknown as { __nextFix: () => void }).__nextFix());
  await page.waitForTimeout(1200);
  const frames = await page.evaluate(() => {
    const w = window as unknown as { __frames: { t: number; moving: boolean; center: string }[]; __framesOn: boolean };
    w.__framesOn = false;
    return w.__frames;
  });
  // One move, to bring CGT out from under the card.
  const starts = frames.filter((f, i) => f.moving && !frames[i - 1]?.moving).length;
  expect(starts).toBe(1);
  // Where it ended held from then on, the GPS fix among it, for a second at least.
  const ended = frames.findIndex((f, i) => i > 0 && !f.moving && frames[i - 1]!.moving);
  expect(ended).toBeGreaterThan(0);
  const after = frames.slice(ended);
  expect(after[after.length - 1]!.t - after[0]!.t).toBeGreaterThan(1000);
  expect(after.every((f) => !f.moving && f.center === after[0]!.center)).toBe(true);
  // And CGT in sight over the card.
  await mapStill(page);
  expect((await vor(page))!.y).toBeLessThan((await card.boundingBox())!.y);
});

test("an airport tapped low on the chart below zoom 9 is eased over its card once, never flown to", async ({ page }) => {
  // The flicker audit's FL-8 (2026-11-14): below the airport card's zoom a
  // field tapped on the chart was flown to, and the flight aimed again as
  // the card's room came, two moves for one tap; now a tap never flies
  // (GlMapShell's place, the camera's owner).
  test.skip(page.viewportSize()!.width >= 768, "a phone's card over the chart");
  await installFrameRecorder(page);
  await standing(page);
  await page.goto("/app/plan");
  await settle(page);
  await expect(page.locator('[data-own-ship="on"]')).toHaveCount(1, { timeout: slow(15000) });
  await mapStill(page);
  const zoom = async () => Number(await page.getByTestId("gl-map").first().getAttribute("data-zoom"));
  const before = await zoom();
  expect(before).toBeLessThan(9);
  // A field low on the chart: above the sheet now, under the card at half.
  const sheetTop = (await frontSheet(page).boundingBox())!.y;
  const half = page.viewportSize()!.height / 2;
  const low = async () =>
    (await airportMarks(page)).filter((m) => m.y > half + 40 && m.y < sheetTop - 40 && m.x > 60 && m.x < page.viewportSize()!.width - 60);
  await expect.poll(async () => (await low()).length, { timeout: slow(30000) }).toBeGreaterThan(0);
  const field = (await low()).sort((a, b) => b.y - a.y)[0]!;
  await expectDrawnOnce(
    page,
    async () => {
      await page.mouse.click(field.x, field.y);
      await expect(page.locator("[data-sheet-card][data-open]")).toHaveAttribute("data-panel", "half");
    },
    { card: "place-card", maxMoves: 1, settleMs: 2000 },
  );
  // Eased, not flown, and in at the zoom it was tapped at.
  const moves = await page.evaluate(() => (window as unknown as { __wingtipCamera?: { call: string }[] }).__wingtipCamera ?? []);
  expect(moves.filter((m) => m.call === "flyTo")).toEqual([]);
  await mapStill(page);
  expect(Math.abs((await zoom()) - before)).toBeLessThan(0.01);
});
