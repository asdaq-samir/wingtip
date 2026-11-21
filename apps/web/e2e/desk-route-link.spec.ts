import { test, expect, type Page } from "@playwright/test";
import { settle, sideDrawer, slow } from "./helpers";
import { courseBox } from "./mapProbes";
import { origin } from "./routeFitProbes";

/**
 * A route opened by a link on a desktop, from a present position to a
 * field, is fitted in the map's room beside the side panel at its pill,
 * and kept there when the position's first fix comes later: the owner's
 * link (2026-11-21), Fly Here's from his Mac to KPWK, opened on Wisconsin,
 * some 70 nm off the 13 nm route, where the Mac's Wi-Fi fix came after the
 * route's fit and the map was flown to it.
 */

const LINK = "/app/plan?dep=@42.2338,-87.9880,0&dest=KPWK&pattern=KPWK:16&auto=land:KPWK";

test.beforeEach(({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "a desktop's layout");
});

/** The route's line and both its ends in the window, clear of the panel, at a size it fills. */
async function fittedBesidePanel(page: Page) {
  const viewport = page.viewportSize()!;
  const line = await courseBox(page);
  const panel = (await sideDrawer(page).boundingBox())!;
  const says = `route ${JSON.stringify(line)}, panel ${JSON.stringify(panel)}`;
  expect(line.x, says).toBeGreaterThanOrEqual(0);
  expect(line.y, says).toBeGreaterThanOrEqual(0);
  expect(line.x + line.width, says).toBeLessThanOrEqual(viewport.width);
  expect(line.y + line.height, says).toBeLessThanOrEqual(viewport.height);
  // Beside the panel, or under it at its pill.
  expect(line.x >= panel.x + panel.width - 1 || line.y >= panel.y + panel.height - 1, says).toBe(true);
  // Fitted, not a speck at the open's zoom: 13 nm fills a good part of the room.
  expect(Math.max(line.width, line.height), says).toBeGreaterThan(150);
}

for (const late of [false, true]) {
  test(`a route opened by link from a present position is fitted clear of the side panel${late ? ", the first fix coming after the fit, from elsewhere" : ""}`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["geolocation"], { origin });
    // Late, the desktop's own position comes some way off, as a Wi-Fi fix may, seconds after the route.
    await context.setGeolocation(late ? { latitude: 42.87, longitude: -88.93 } : { latitude: 42.2338, longitude: -87.988 });
    if (late)
      await page.addInitScript(() => {
        localStorage.setItem("wingtip.ownship", JSON.stringify({ state: { enabled: true, follow: true, lastFix: null }, version: 0 }));
        const geo = navigator.geolocation;
        const watch = geo.watchPosition.bind(geo);
        geo.watchPosition = (ok, bad, o) => watch((p) => setTimeout(() => ok(p), 3_000), bad, o);
      });
    await page.goto(LINK);
    await settle(page);
    await expect(() => fittedBesidePanel(page)).toPass({ timeout: slow(20_000) });
    // And kept there past the first fix.
    await page.waitForTimeout(5_000);
    if (late) await expect(page.locator('[data-own-ship="on"]')).toHaveCount(1);
    await fittedBesidePanel(page);
  });
}
