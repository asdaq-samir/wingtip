import { expect, type Page } from "@playwright/test";
import { frontSheet, grabberTo, openMapSettings, slow } from "./helpers";

/* The Map card's pages and the map's 3D button (features/map-settings,
   ThreeDButton; the owner's option A, 2026-11-13), apart from helpers.ts,
   which is at its size. */

/** One of the Map card's pages (features/map-settings): its Map Settings,
 *  from the row at the Map's foot, and from those a row's own page --
 *  the airport weather, the alerts or the sources. The card opened first
 *  where it is not, and pulled all the way up (it opens half way, as every
 *  card does), its rows in reach. */
export async function openMapSettingsPage(page: Page, sub?: "airport-weather" | "alerts" | "sources") {
  const card = page.getByTestId("map-settings");
  if (!(await card.isVisible())) await openMapSettings(page);
  await grabberTo(page, "full");
  await card.getByTestId("map-settings-more").click();
  if (sub) await card.getByTestId(`${sub}-row`).click();
}

/** The Map card put away from whichever of its pages is open: Escape
 *  goes back a page at a time, as its close does, then puts it away. */
export async function closeMapSettings(page: Page) {
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("map-settings")).toHaveCount(0, { timeout: 1000 });
  }).toPass({ timeout: slow(10000) });
}

/** The map's round 3D button (ThreeDButton) set on or off on the planner,
 *  before a route is loaded, as Apple Maps' 3D is: pressed while the map
 *  stands in 3D. Over a phone's sheet all the way up the map's buttons
 *  give way: the sheet lowered first. */
export async function setMap3d(page: Page, on: boolean) {
  await page.goto("/app/plan");
  if ((page.viewportSize()?.width ?? 0) < 768 && (await frontSheet(page).getAttribute("data-panel")) === "full")
    await grabberTo(page, "peek");
  const button = page.getByTestId("map-3d-button");
  if ((await button.getAttribute("aria-pressed")) !== String(on)) await button.click();
  await expect(button).toHaveAttribute("aria-pressed", String(on));
  await expect(button).toHaveText(on ? "2D" : "3D");
}

/** A map setting changed on the planner before a route is loaded --
 *  remembered per browser -- and the route loaded after, for a route's
 *  map that should show it. */
export async function beforeTheRoute(page: Page, change: () => Promise<void>) {
  await page.goto("/app/plan");
  await openMapSettings(page);
  await change();
  await closeMapSettings(page);
}
