import { expect, type Locator, type Page } from "@playwright/test";
import { airportMark, mapStill, sideDrawer, slow } from "./helpers";
import { courseBox } from "./mapProbes";
import { middleOfMap, shipAt } from "./ownShipProbes";

// Geolocation is a secure origin's only: the suite's address must be one
// (CI's is localhost; locally, a localhost port forwarded to the stack).
export const origin = new URL(process.env.BASE_URL ?? "http://localhost:8080").origin;

/** Nothing of `a` under `b`. */
const apart = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1 || a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1;

/** The route clear of the panel, and filling much of what the panel
 *  leaves of the map: fitted there, not just somewhere out from under it. */
export async function fittedClearOf(page: Page, panel: Locator) {
  const viewport = page.viewportSize()!;
  await expect(async () => {
    const line = await courseBox(page);
    const sheet = (await panel.boundingBox())!;
    expect(apart(line, sheet), `route ${JSON.stringify(line)} under the panel ${JSON.stringify(sheet)}`).toBe(true);
    expect(line.y).toBeGreaterThanOrEqual(0);
    expect(line.y + line.height).toBeLessThanOrEqual(viewport.height);
    // What the panel leaves: above a phone's sheet; beside a desktop's card out, under it at rest.
    const out = (await panel.getAttribute("data-panel")) !== "peek";
    const free =
      viewport.width < 660
        ? { w: viewport.width, h: viewport.height - sheet.height }
        : out
          ? { w: viewport.width - sheet.x - sheet.width, h: viewport.height }
          : { w: viewport.width, h: viewport.height - sheet.y - sheet.height };
    // Fitted, not lost in the room: at the capsule the route keeps the size it had above the half sheet, a little under half the screen.
    expect(Math.max(line.width / free.w, line.height / free.h)).toBeGreaterThan(0.35);
  }).toPass({ timeout: slow(10_000) });
  return courseBox(page);
}

/** Own ship in the middle of what the panel leaves, give or take the
 *  marker's own size. */
export async function shipInTheMiddle(page: Page) {
  await expect(async () => {
    const at = await shipAt(page),
      middle = await middleOfMap(page);
    expect(Math.abs(at.x - middle.x)).toBeLessThan(40);
    expect(Math.abs(at.y - middle.y)).toBeLessThan(40);
  }).toPass({ timeout: slow(15_000) });
}

/** Where the map's pane and the sheet's top are, for a turn of the sheet
 *  to be checked against (slidWithSheet). */
export const paneAndSheet = (page: Page) =>
  page.evaluate(() => ({
    pane: Number(document.querySelector<HTMLElement>("[data-testid=gl-map]")!.dataset.offset!.split(",")[1]),
    top: document.querySelector('[data-slot="map-panel"]')!.getBoundingClientRect().top,
  }));

/** On a phone the map slid with the sheet, what was in the middle of the
 *  room above it still in the middle (half the sheet's move, within the
 *  difference between the sheet's edge and the strip it reports to the
 *  map), as Apple Maps' does; from `md` up, where the card comes out at the side, left where it was. */
export async function slidWithSheet(page: Page, before: { pane: number; top: number }) {
  await mapStill(page);
  const after = await paneAndSheet(page);
  if (page.viewportSize()!.width >= 660) expect(after.pane).toBeCloseTo(before.pane, 0);
  else expect(Math.abs(after.pane - before.pane - (after.top - before.top) / 2)).toBeLessThan(20);
}

const mapAt = (page: Page) => page.getByTestId("gl-map").getAttribute("data-offset");

/** The map's zoom at rest (GlMapShell's data-zoom). */
export const mapZoom = async (page: Page) => (await mapStill(page), page.getByTestId("gl-map").getAttribute("data-zoom"));

/** A drag on the chart, from a point clear of the panel and the map's
 *  buttons, by `dx`, `dy`. */
export async function drag(page: Page, dx: number, dy: number) {
  const viewport = page.viewportSize()!;
  const from = { x: viewport.width / 2, y: viewport.width < 660 ? 150 : viewport.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 10 });
  await page.mouse.up();
  // Until the map has stopped: it carries a drag on a little.
  let was = "";
  await expect(async () => {
    const now = await mapAt(page);
    const still = now === was;
    was = now;
    await page.waitForTimeout(250);
    expect(still).toBe(true);
  }).toPass({ timeout: 5_000 });
}

/** Counts the page's asks for the position, on window.__asks. */
export async function countAsks(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __asks: number };
    w.__asks = 0;
    for (const name of ["watchPosition", "getCurrentPosition"] as const) {
      const own = Geolocation.prototype[name];
      Geolocation.prototype[name] = function (this: Geolocation, ...args: Parameters<typeof own>) {
        w.__asks++;
        return (own as (...a: unknown[]) => number | void).apply(this, args);
      } as typeof own;
    }
  });
  return () => page.evaluate(() => (window as unknown as { __asks: number }).__asks);
}

/** The field's mark on the screen and not under the card: in the map's
 *  box is not enough, the card covers part of it. The chart's fields are
 *  drawn on a canvas (AirportsGl), each said on its hook, its dot 12 points across. */
export async function fieldClearOfCard(page: Page, ident: string) {
  const viewport = page.viewportSize()!;
  await expect(async () => {
    const drawn = await airportMark(page, ident);
    expect(drawn, `${ident} drawn`).not.toBeNull();
    const mark = { x: drawn!.x - 6, y: drawn!.y - 6, width: 12, height: 12 };
    expect(mark.x >= 0 && mark.y >= 0 && mark.x + 12 <= viewport.width && mark.y + 12 <= viewport.height, `${ident} on the screen`).toBe(
      true,
    );
    const sheet = (await sideDrawer(page).boundingBox())!;
    expect(apart(mark, sheet), `field ${JSON.stringify(mark)} under the card ${JSON.stringify(sheet)}`).toBe(true);
  }).toPass({ timeout: slow(10_000) });
}
