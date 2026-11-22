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
  // Nine stops, the route several rows longer than the sheet: with six it
  // was only 40 points longer at a large text size (CI, PR #589), too
  // little room to scroll the strip through.
  await page.goto("/app/plan?dep=C81&dest=KATW&stops=KUGN,KENW,BAE,OSH,KMKE,KRAC,KJVL,KMSN,KDLL&view=full");
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
    // Held on the foot's top, just over the tab bar at the sheet's very
    // foot (the owner, 2026-11-22: "the Apple way at the bottom and figures
    // should pin at the bottom of the plan"): never half way up, never
    // under the bar.
    expect(Math.abs(box.y + box.height - foot.y), `strip's bottom on the foot's top at scroll ${at}`).toBeLessThanOrEqual(2);
    const bar = (await page.getByTestId("fpl-actions").boundingBox())!;
    expect(bar.y, "the bar under the figures").toBeGreaterThanOrEqual(box.y + box.height - 1);
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

test("the tab bar is at the sheet's foot, the figures over it, and they slide under it to be the pill", async ({ page }) => {
  // The owner, 2026-11-22: "figures should pin at the bottom of the plan
  // and the slide under the tabs to pin to the pill as the card becomes a pill".
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "a phone's sheet");
  await page.goto("/app/plan?dep=C81&dest=KATW&stops=KUGN,KENW,BAE,OSH,KMKE,KRAC,KJVL,KMSN,KDLL");
  await settle(page);
  await grabberTo(page, "half");
  const strip = page.locator("[data-pin-foot]").first();
  await expect(strip.getByTestId("navlog-ete")).toBeVisible({ timeout: slow(90_000) });
  const bar = page.getByTestId("fpl-actions");
  const [s, b] = [(await strip.boundingBox())!, (await bar.boundingBox())!];
  // The bar at the very foot, the figures wholly over it, in sight.
  expect(b.y + b.height).toBeGreaterThan(page.viewportSize()!.height - 60);
  expect(s.y + s.height).toBeLessThanOrEqual(b.y + 1);
  expect(await strip.getByTestId("navlog-ete").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  // At the pill the figures are its face, on the screen's foot, the bar put away.
  await grabberTo(page, "peek");
  await page.waitForTimeout(600);
  const pill = (await strip.boundingBox())!;
  expect(pill.y + pill.height).toBeGreaterThan(page.viewportSize()!.height - 60);
  await expect(bar).toBeHidden();
});
