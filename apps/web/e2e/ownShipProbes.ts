import type { Page } from "@playwright/test";
import { sideDrawer } from "./helpers";

/* Where own ship is drawn and where the map's room is (dry-run.spec,
 * route-fit.spec). */

/** Own ship's marker, on screen; `on`, only while own ship is on (the dry
 *  run's airplane), else its marker however it is drawn. */
export async function shipAt(page: Page, on = false) {
  const box = (await page
    .locator(".maplibregl-marker")
    .filter({ has: page.locator(on ? '[data-own-ship="on"]' : "[data-own-ship]") })
    .last()
    .boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The middle of what the panel leaves of the map: above a phone's sheet,
 *  beside a desktop's card out, under it at rest. */
export async function middleOfMap(page: Page) {
  const viewport = page.viewportSize()!;
  const sheet = (await sideDrawer(page).boundingBox())!;
  if (viewport.width < 768) return { x: viewport.width / 2, y: sheet.y / 2 };
  return (await sideDrawer(page).getAttribute("data-panel")) !== "peek"
    ? { x: (sheet.x + sheet.width + viewport.width) / 2, y: viewport.height / 2 }
    : { x: viewport.width / 2, y: (sheet.y + sheet.height + viewport.height) / 2 };
}
