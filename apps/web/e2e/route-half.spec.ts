import { test, expect, type Page } from "@playwright/test";
import { openPanel, settle, sideDrawer, slow } from "./helpers";

/**
 * Half a route -- a waypoint, then an airport, no departure: "Departure →
 * HSKEL → KJAX", the owner's screenshot from his iPhone, 2026-11-13, at
 * his larger text -- and the route box round it at that size. The box one
 * row under FPL's bar, the airplane's strip not in it; the
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

test("the route box is one row under FPL's bar, the airplane's strip over it and not in it, at the owner's text size", async ({ page }) => {
  // The owner, 2026-11-14: "The route box just become a single row under
  // it", the N-number strip with its buttons the sheet's first row's bar.
  await page.setViewportSize({ width: 390, height: 844 });
  await ownersText(page);
  await page.goto(ROUTE);
  await settle(page);
  await openPanel(page);
  const box = sideDrawer(page).getByTestId("route-box");
  const m = await box.evaluate((el) => {
    const strip = document.querySelector('[data-testid="route-strip"]')!.getBoundingClientRect();
    return {
      inBox: el.querySelectorAll('[data-testid="aircraft-input"]').length,
      strip: strip.bottom,
      box: el.getBoundingClientRect().top,
    };
  });
  expect(m.inBox).toBe(0);
  expect(m.strip).toBeLessThanOrEqual(m.box);
  // The bar's 46 and its row's room under it: the box close under it.
  expect(m.box - m.strip).toBeLessThanOrEqual(16);
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
