import { test, expect, type Locator, type Page } from "@playwright/test";
import { grabberTo, settle, slow } from "./helpers";
import { pickAirplane } from "./startState";
import { steady } from "./pacing";

test.use({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
test.beforeEach(async ({ page }) => {
  await pickAirplane(page);
  // The owner's larger text (Dynamic Type's root, 19.65 px).
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => (document.documentElement.style.fontSize = "19.65px"));
  });
});

/** FPL's page scroller, the one with room at its end for the foot bar. */
const scroller = (page: Page) =>
  page
    .locator("[data-sheet-scroll]")
    .filter({ has: page.locator("[data-foot-room]") })
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
 * top. The figures now sit over the tab bar in one fixed bar beside the
 * sheet (sheet/FootBar), and the head's row sticks at the sheet's top
 * while the route scrolls under it.
 */
for (const size of ["full", "half"] as const) {
  test(`a long route at ${size} at 19.65 px: the figures' values in sight over the bar, the head in sight at every scroll`, async ({
    page,
  }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 660, "a phone's sheet");
    await page.goto("/app/plan?dep=KPWK&dest=C81&stops=KUGN");
    await settle(page);
    await grabberTo(page, size);
    const ete = page.locator("[data-foot-strip]").getByTestId("navlog-ete");
    await expect(ete).toBeVisible({ timeout: slow(90_000) });
    const room = await scroller(page).evaluate((el) => el.scrollHeight - el.clientHeight);
    for (const at of size === "full" ? [0, 0.5, 1] : [0]) {
      await scroller(page).evaluate((el, y) => el.scrollTo(0, y), Math.round(room * at));
      // Once the scroll is at rest.
      await steady(() => page.locator("[data-foot-strip]").boundingBox());
      if (at === 0) await page.screenshot({ path: test.info().outputPath(`fpl-${size}.png`) });
      // The strip's time and track its own points, not the bar's.
      for (const id of ["navlog-ete", "strip-track"]) {
        expect(await ownsPoint(page.locator("[data-foot-strip]").getByTestId(id)), `${id} at scroll ${at}`).toBe(true);
      }
      // The head's row whole on the screen and its own.
      for (const id of ["fpl-search", "fpl-clear"]) {
        const box = (await page.getByTestId(id).boundingBox())!;
        expect(box.y, `${id}'s top at scroll ${at}`).toBeGreaterThanOrEqual(0);
        expect(await ownsPoint(page.getByTestId(id)), `${id} at scroll ${at}`).toBe(true);
      }
    }
    if (size === "full") await page.screenshot({ path: test.info().outputPath("fpl-full-end.png") });
  });
}
