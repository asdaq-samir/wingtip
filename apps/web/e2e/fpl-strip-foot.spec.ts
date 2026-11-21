import { test, expect } from "@playwright/test";
import { grabberTo, settle, slow } from "./helpers";
import { pickAirplane } from "./startState";

test.use({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
test.beforeEach(({ page }) => pickAirplane(page));

/**
 * The route's figures stay on the sheet's foot as a long route scrolls
 * under them (the owner's iPhone, 2026-11-21: a long route at full with
 * approaches, the strip drawn half way up the sheet over the approach's
 * fixes, rows showing below it). usePinAtFoot measured the strip's room
 * at the page's top alone, so its translation was kept as the page scrolled
 * and carried it up through the route; it is measured at each scroll now.
 */
test("a long route scrolled at full: the figures stay at the sheet's foot, no row below them", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "a phone's sheet");
  await page.goto("/app/plan?dep=C81&dest=KATW&stops=KUGN,KENW,BAE,OSH,KMKE,KRAC&view=full");
  await settle(page);
  await grabberTo(page, "full");
  const scroller = page
    .locator("[data-sheet-scroll]")
    .filter({ has: page.locator("[data-pin-foot]") })
    .first();
  const strip = page.locator("[data-pin-foot]").first();
  await expect(strip.getByTestId("navlog-ete")).toBeVisible({ timeout: slow(90_000) });
  const room = await scroller.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(room, "the route is longer than the sheet").toBeGreaterThan(40);
  const foot = (await page.getByTestId("panel-foot").boundingBox())!;
  for (const at of [0, 0.5, 1]) {
    await scroller.evaluate((el, y) => el.scrollTo(0, y), Math.round(room * at));
    await page.waitForTimeout(400);
    const box = (await strip.boundingBox())!;
    // On the foot's edge, over the bar's room at most: never half way up.
    expect(box.y + box.height, `strip's bottom at scroll ${at}`).toBeGreaterThan(foot.y + foot.height - 140);
    expect(box.y + box.height).toBeLessThanOrEqual(foot.y + foot.height + 1);
    // And no list row drawn below it.
    const below = await scroller.evaluate((el, edge) => {
      return [...el.querySelectorAll("[data-pin-foot] ~ *, [data-pill-row] > *")].filter(
        (n) =>
          !n.querySelector("[data-pin-foot]") &&
          !n.matches("[data-pin-foot]") &&
          n.getBoundingClientRect().top > edge &&
          n.getBoundingClientRect().height > 0,
      ).length;
    }, box.y + box.height);
    expect(below).toBe(0);
  }
});
