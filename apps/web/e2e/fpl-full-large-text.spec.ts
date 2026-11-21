import { test, expect, type Locator, type Page } from "@playwright/test";
import { grabberTo, settle, slow } from "./helpers";
import { pickAirplane } from "./startState";

test.use({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
test.beforeEach(async ({ page }) => {
  await pickAirplane(page);
  // The owner's larger text (Dynamic Type's root, 19.65 px).
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => (document.documentElement.style.fontSize = "19.65px"));
  });
});

/** FPL's page scroller, the one holding the figures. */
const scroller = (page: Page) =>
  page
    .locator("[data-sheet-scroll]")
    .filter({ has: page.locator("[data-pin-foot]") })
    .first();

/** Whether the point is the element's own: in sight, not under the bar or off the sheet. */
async function ownsPoint(target: Locator) {
  return target.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return !!hit && (el.contains(hit) || hit.contains(el));
  });
}

/**
 * A route longer than the sheet at the owner's larger text (his iPhone,
 * 2026-11-21: My Location, C81 with an approach, KPWK; all the way up):
 * the figure strip's names showed and its values did not, held on the
 * foot's edge behind FPL's actions' bar, and scrolled to the route's end
 * the head (Search, the title, the pills, the ✕) went up off the sheet's
 * top. The figures are at the bottom, on the foot's edge, and stay there
 * while the route scrolls under them (the owner, 2026-11-21: "they would
 * go to bottom and stay there while the rest slides under it"); the bar
 * sits on them, wholly above; the head's row sticks at the sheet's top.
 */
for (const size of ["full", "half"] as const) {
  test(`a long route at ${size} at 19.65 px: the figures at the bottom, the bar over them, the head in sight at every scroll`, async ({
    page,
  }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 768, "a phone's sheet");
    await page.goto("/app/plan?dep=KPWK&dest=C81&stops=KUGN");
    await settle(page);
    await grabberTo(page, size);
    const strip = page.locator("[data-pin-foot]");
    await expect(strip.getByTestId("navlog-ete")).toBeVisible({ timeout: slow(90_000) });
    const room = await scroller(page).evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(room, "the route is longer than the sheet").toBeGreaterThan(40);
    for (const at of [0, 0.5, 1]) {
      await scroller(page).evaluate((el, y) => el.scrollTo(0, y), Math.round(room * at));
      await page.waitForTimeout(500);
      if (at === 0) await page.screenshot({ path: test.info().outputPath(`fpl-${size}.png`) });
      // The strip's foot at the screen's foot, inside the sheet's 8-point
      // edge room (no home indicator in the test's browser).
      const box = (await strip.boundingBox())!;
      const foot = page.viewportSize()!.height;
      expect(box.y + box.height, `strip's bottom at scroll ${at}`).toBeGreaterThanOrEqual(foot - 12);
      expect(box.y + box.height, `strip's bottom at scroll ${at}`).toBeLessThanOrEqual(foot);
      // The bar wholly above it.
      const bar = (await page.locator("[data-floating-bar]").filter({ visible: true }).last().boundingBox())!;
      expect(bar.y + bar.height, `the bar's foot over the strip at scroll ${at}`).toBeLessThanOrEqual(box.y + 0.5);
      // The strip's time and track its own points, not the bar's.
      for (const id of ["navlog-ete", "strip-track"]) {
        expect(await ownsPoint(strip.getByTestId(id)), `${id} at scroll ${at}`).toBe(true);
      }
      // The head's row whole on the screen and its own.
      for (const id of ["fpl-search", "fpl-clear"]) {
        const head = (await page.getByTestId(id).boundingBox())!;
        expect(head.y, `${id}'s top at scroll ${at}`).toBeGreaterThanOrEqual(0);
        expect(await ownsPoint(page.getByTestId(id)), `${id} at scroll ${at}`).toBe(true);
      }
    }
    await page.screenshot({ path: test.info().outputPath(`fpl-${size}-end.png`) });
  });
}
