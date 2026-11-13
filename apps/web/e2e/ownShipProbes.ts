import type { Locator, Page } from "@playwright/test";
import { frontSheet, sideDrawer } from "./helpers";

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
export const middleOfMap = (page: Page) => middleBeside(page, sideDrawer(page));

/** The same of what the sheet in front leaves: a card up over the sheet
 *  (the Profile's, a dry run's, since the cards are nested drawers,
 *  2026-11-11) where there is one, else the sheet. */
export const middleOfFront = (page: Page) => middleBeside(page, frontSheet(page));

async function middleBeside(page: Page, panel: Locator) {
  const viewport = page.viewportSize()!;
  const sheet = (await panel.boundingBox())!;
  if (viewport.width < 768) return { x: viewport.width / 2, y: sheet.y / 2 };
  return (await panel.getAttribute("data-panel")) !== "peek"
    ? { x: (sheet.x + sheet.width + viewport.width) / 2, y: viewport.height / 2 }
    : { x: viewport.width / 2, y: (sheet.y + sheet.height + viewport.height) / 2 };
}
