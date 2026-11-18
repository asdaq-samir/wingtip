import { expect, type Page } from "@playwright/test";
import { controlsInSight, frontSheet, grabberTo, openMapSettings, openPanel, settle, sideDrawer, slow } from "./helpers";

/* The Map card, the Settings its gear opens, and the map's 3D button
   (features/map-settings, features/settings, ThreeDButton; the owner's
   option A, 2026-11-13), apart from helpers.ts, which is at its size. */

/** The app's Settings opened by the Map card's gear, at its Map group
 *  (lib/openSettings; the owner's option A, 2026-11-13), the card opened
 *  first where it is not; and from it a page -- the alerts, ATC, Help &
 *  About or its Sources -- where one is asked for. */
export async function openSettingsPage(page: Page, sub?: "alerts" | "atc" | "help" | "sources") {
  const card = page.getByTestId("map-settings");
  if (!(await card.isVisible())) await openMapSettings(page);
  await card.getByTestId("card-settings").click();
  await expect(page.getByTestId("settings-page")).toBeVisible();
  for (const row of sub === "sources" ? ["help-row", "sources-row"] : sub ? [`${sub}-row`] : []) await page.getByTestId(row).click();
}

/** The Map card and Settings over it put away: Escape goes back a page at
 *  a time, as each close does, then puts each card away. */
export async function closeMapSettings(page: Page) {
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("map-settings")).toHaveCount(0, { timeout: 1000 });
    await expect(page.getByTestId("console-sheet")).toHaveCount(0, { timeout: 1000 });
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

/** The route's ••• menu's map switch -- Checkpoints (`waypoints-toggle`),
 *  since the Map card's layers became four (the owner, 2026-11-14) -- turned over
 *  in More on a route drawn (only then: the owner, 2026-11-18), remembered
 *  per browser, so the route loaded after shows it. */
export async function routeMenuSwitch(page: Page, testId: "waypoints-toggle", on: boolean, route = "/app/plan?dep=C81&dest=KDLH") {
  await page.goto(route);
  await settle(page);
  await openPanel(page);
  await controlsInSight(page);
  const more = sideDrawer(page).getByTestId("share-route").locator("visible=true").first();
  await more.click();
  const item = page.getByTestId(testId);
  await expect(item).toHaveAttribute("aria-checked", String(!on));
  await item.click();
  await more.click();
  await expect(page.getByTestId(testId)).toHaveAttribute("aria-checked", String(on));
  await page.keyboard.press("Escape");
}
