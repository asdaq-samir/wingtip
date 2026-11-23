import { test, expect } from "@playwright/test";
import { PAGES, settle } from "./helpers";

/** The map's full-screen button, on each map page (split from layout.spec). */
for (const path of PAGES) {
  test(`${path}: the full-screen button takes the whole screen and gives it back`, async ({ page }) => {
    await page.goto(`${path}?dep=C81&dest=KDLH`);
    await settle(page);
    // The map has to have drawn something before this test can say
    // anything about it redrawing. `settle` waits a fixed 1.5s, which
    // is plenty when the planner is idle and not always enough when
    // three other workers are asking it for chart tiles.
    await expect(page.locator("[data-chart-zoom]").first()).toBeAttached();
    // Drawn only where it would work: Chromium allows it, an iPad
    // does, an iPhone does not and the button is absent there rather
    // than present and refusing (see `FullscreenButton`).
    expect(await page.evaluate(() => document.fullscreenEnabled)).toBe(true);
    const button = page.getByTestId("fullscreen-button");
    await expect(button).toHaveAttribute("aria-label", "Full screen");

    await button.click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await expect(button).toHaveAttribute("aria-label", "Leave full screen");
    // The map re-measured rather than keeping its old size: it is
    // still drawing tiles (`ResizeAware` watches the container).
    await expect(page.locator("[data-chart-zoom]").first()).toBeAttached();

    await button.click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await expect(button).toHaveAttribute("aria-label", "Full screen");
  });
}
