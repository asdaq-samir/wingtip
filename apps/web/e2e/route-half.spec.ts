import { test, expect, type Page } from "@playwright/test";
import { openPanel, settle, sideDrawer, slow } from "./helpers";

/**
 * Half a route -- a waypoint, then an airport, no departure: "Departure →
 * HSKEL → KJAX", the owner's screenshot from his iPhone, 2026-11-13, at
 * his larger text -- and the route box round it at that size. The box's
 * two lines no further apart than the 44-point hit areas need; the
 * destination's procedures not three empty chips with "+ …" and "+ A…"
 * after them, as no briefing comes for a route with no departure; and the
 * box's Departure the ask for it, with where the airplane is first, as
 * Maps' From offers My Location.
 */
const ROUTE = "/app/plan?stops=HSKEL&dest=KJAX";

/** The owner's text size: a root of 19.65 px, Safari's at his Dynamic Type. */
async function ownersText(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => document.documentElement.style.setProperty("font-size", "19.65px", "important"));
  });
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("the route box's lines sit only as far apart as their hit areas need, at the owner's text size", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ownersText(page);
  await page.goto(ROUTE);
  await settle(page);
  await openPanel(page);
  const box = sideDrawer(page).getByTestId("route-box");
  const gap = await box.evaluate((el) => {
    const pill = el.querySelector('[data-testid="stop"]')!.getBoundingClientRect();
    const foot = el.querySelector('[data-testid="aircraft-input"]')!.getBoundingClientRect();
    return foot.top - pill.bottom;
  });
  // A pill 34 tall above and below: 10 between them makes 44 of each's
  // area meet; it was 20 at this size, a band of 30 round the words.
  expect(gap).toBeGreaterThanOrEqual(44 - 34 - 1);
  expect(gap).toBeLessThanOrEqual(12);
});

test("a field of half a route offers its procedures whole, with no runways' outlines waiting for a briefing that never comes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ownersText(page);
  await page.goto(ROUTE);
  await settle(page);
  await openPanel(page);
  const field = sideDrawer(page).getByTestId("procedures").getByRole("region", { name: "KJAX · Arrive" });
  const toggle = field.getByTestId("field-toggle");
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  const adds = field.getByTestId("procedure-kind");
  await expect(adds.first()).toBeVisible({ timeout: slow(30_000) });
  await expect(field.locator('[data-slot="skeleton"]')).toHaveCount(0);
  for (const add of await adds.all()) {
    // Its words whole: no ellipsis, nothing past the button's edge.
    await expect(add).toHaveText(/^\+ (Arrival|Approach)$/);
    const cut = await add.evaluate((el) => [...el.querySelectorAll("span")].some((s) => s.scrollWidth > s.clientWidth + 1));
    expect(cut).toBe(false);
  }
});

test("the box's Departure asks for it in the search, where the airplane is first, and a pick plans from there", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 41.2, longitude: -88.1 });
  await page.addInitScript(() => {
    localStorage.setItem("wingtip.ownship", JSON.stringify({ state: { enabled: true, follow: false, lastFix: null }, version: 0 }));
  });
  await page.goto(ROUTE);
  await settle(page);
  await openPanel(page);
  // The word itself is the ask, as a field's placeholder takes the tap.
  await sideDrawer(page).getByTestId("route-box").getByText("Departure", { exact: true }).click();
  const here = page.getByTestId("search-do-my-position");
  await expect(here).toBeVisible({ timeout: slow(10_000) });
  await here.click();
  await expect(page).toHaveURL(/dep=%40|dep=@/);
  await expect(sideDrawer(page).getByTestId("route-dep")).toContainText("POS0");
});
