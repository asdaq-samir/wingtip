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

test("the route's field is under FPL's bar and the route's cards, the airplane's strip over it and not in it, at the owner's text size", async ({
  page,
}) => {
  // The owner, 2026-11-14: the N-number strip with its buttons the sheet's
  // first row's bar; half a route is open to edit (the one layout, decision
  // 0047), its field under its timeline once its Type or Paste a Route
  // opens it (the owner, 2026-11-18).
  await page.setViewportSize({ width: 390, height: 844 });
  await ownersText(page);
  await page.goto(ROUTE);
  await settle(page);
  await openPanel(page);
  await sideDrawer(page).getByTestId("timeline-type-route").click();
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
  // Its runways and procedures under its line, a tap on it opening them
  // where they are not open already (the timeline, 2026-11-17).
  await expect(field).toBeVisible({ timeout: slow(30_000) });
  if ((await field.getByTestId("procedure-kind").count()) === 0) await field.getByTestId("timeline-toggle").click();
  const adds = field.getByTestId("procedure-kind");
  await expect(adds.first()).toBeVisible({ timeout: slow(30_000) });
  await expect(field.locator('[data-slot="skeleton"]')).toHaveCount(0);
  for (const add of await adds.all()) {
    // Its words whole: no ellipsis, nothing past the button's edge.
    await expect(add).toHaveText(/^\+ (ARR|APCH)$/);
    const cut = await add.evaluate((el) => [...el.querySelectorAll("span")].some((s) => s.scrollWidth > s.clientWidth + 1));
    expect(cut).toBe(false);
  }
});

test("the timeline's Departure asks for it in the search, where the airplane is first, and a pick plans from there", async ({
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
  // Its row in the departure's place, a placeholder's word, is the ask.
  await sideDrawer(page).getByTestId("timeline-pick-dep").click();
  const here = page.getByTestId("search-do-my-position");
  await expect(here).toBeVisible({ timeout: slow(10_000) });
  await here.click();
  await expect(page).toHaveURL(/dep=%40|dep=@/);
  await expect(sideDrawer(page).getByTestId("timeline-line").first().getByTestId("timeline-ident")).toHaveText("My Location", {
    timeout: slow(30_000),
  });
});
