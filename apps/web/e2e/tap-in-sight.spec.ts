import { test, expect, type Page } from "@playwright/test";
import { airportMarks, drawn, frontSheet, mapStill, settle, slow } from "./helpers";
import { expectDrawnOnce, installFrameRecorder } from "./drawnOnce";

/**
 * A mark tapped low on the chart is brought into sight over the card it
 * opens once, and the map stays there (components/map/cardRoom). The owner's
 * iPhone, 2026-11-14: "When I tap the EON ... It flickers" -- the map eased
 * the VORTAC up over its card, and half a second later own ship's next GPS
 * fix eased it back to the pilot's position, as the tap had left own ship
 * followed (OwnShipGl). The GPS here is a fake one standing south of
 * Chicago, its next fix sent while the card is up. Against the planner's overlay tiles round Chicago (in CI
 * the suite's own), where Peotone's VORTAC, EON, is.
 */

test.use({ permissions: ["geolocation"] });

/** Where the fake GPS stands: over Chicago, north of EON (41.27, -87.79), so
 *  the map, opened on it, has EON low on the chart over the search's pill. */
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

/** EON's mark on the page, as NavaidsGl's probe has it; null while it is not drawn. */
async function eon(page: Page): Promise<{ x: number; y: number } | null> {
  const box = (await page.getByTestId("gl-map").first().boundingBox())!;
  const mark = (await drawn(page, "navaid-marks")).find((m) => m.ident === "EON");
  return mark ? { x: box.x + Number(mark.x), y: box.y + Number(mark.y) } : null;
}

test("a VOR tapped low on the chart is brought over its card once, and own ship's next fix leaves it there", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "a phone's card over the chart");
  await standing(page);
  await page.goto("/app/plan");
  await settle(page);
  await expect(page.locator('[data-own-ship="on"]')).toHaveCount(1, { timeout: slow(15000) });
  await mapStill(page);
  await expect.poll(() => eon(page), { timeout: slow(30000) }).not.toBeNull();
  const tapped = (await eon(page))!;
  // On the chart, under where the card comes to rest at half.
  expect(tapped.y).toBeLessThan((await frontSheet(page).boundingBox())!.y);
  // Every frame for three and a half seconds from the tap, as painted:
  // whether the chart is moving (the map's data-moving, from a move's start
  // to its end) and where its middle is (data-center, at each move's end).
  const recording = page.evaluate(
    () =>
      new Promise<{ t: number; moving: boolean; center: string }[]>((done) => {
        const out: { t: number; moving: boolean; center: string }[] = [];
        const map = document.querySelector<HTMLElement>("[data-testid=gl-map]")!;
        const start = performance.now();
        const frame = () => {
          out.push({ t: performance.now() - start, moving: "moving" in map.dataset, center: map.dataset.center ?? "" });
          if (performance.now() - start < 3500) requestAnimationFrame(frame);
          else done(out);
        };
        requestAnimationFrame(frame);
      }),
  );
  await page.mouse.click(tapped.x, tapped.y);
  // The GPS's next fix once the card is up and EON brought over it.
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window as unknown as { __nextFix: () => void }).__nextFix());
  const frames = await recording;
  const card = page.locator("[data-sheet-card][data-open]");
  await expect(card).toHaveAttribute("data-panel", "half");
  // One move, to bring EON out from under the card.
  const starts = frames.filter((f, i) => f.moving && !frames[i - 1]?.moving).length;
  expect(starts).toBe(1);
  // Where it ended held from then on, the GPS fix among it, for a second at least.
  const ended = frames.findIndex((f, i) => i > 0 && !f.moving && frames[i - 1]!.moving);
  expect(ended).toBeGreaterThan(0);
  const after = frames.slice(ended);
  expect(after[after.length - 1]!.t - after[0]!.t).toBeGreaterThan(1000);
  expect(after.every((f) => !f.moving && f.center === after[0]!.center)).toBe(true);
  // And EON in sight over the card.
  await mapStill(page);
  expect((await eon(page))!.y).toBeLessThan((await card.boundingBox())!.y);
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
