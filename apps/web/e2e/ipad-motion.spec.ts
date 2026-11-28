import { test, expect, type Page } from "@playwright/test";
import { searchAirports, settle, sheetUpToType, showTabs, sideDrawer } from "./helpers";

/**
 * On an iPad (the webkit-ipad project), what the pilot touches moves with
 * the map that makes room for it, on the Drawer's time: a card in the
 * inspector slides in from the right edge and fades, and goes the way it
 * came; the side panel's edge glides between its head and the window's
 * height (the apple-design audit of 2026-11-23, H1 and H2). Each was there
 * or gone in one frame while the map eased beside it. Read from the
 * browser's own transition and animation events, not sampled frames: an
 * iPad's WebKit without a GPU draws a frame a second at times, and a
 * sampled frame missed the 450 ms ease.
 */

/** The transitions run on the inspector's card, and the side panel's glides and clips, from now on. */
async function watchMotion(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { motion: string[] };
    w.motion = [];
    document.addEventListener("transitionrun", (e) => {
      const el = e.target as Element;
      if (el.matches('[data-slot="map-inspector"] [data-sheet-card]'))
        w.motion.push(`card:${e.propertyName}:${getComputedStyle(el).transitionDuration}`);
    });
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, frames, options) {
      if (this.matches('[data-slot="map-panel"]') && JSON.stringify(frames).includes("inset")) w.motion.push("clip");
      return animate.call(this, frames, options);
    };
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes)
          if (n instanceof HTMLElement && n.hasAttribute("data-side-glide")) w.motion.push(`glide:${n.getAnimations().length}`);
    }).observe(document.body, { childList: true, subtree: true });
  });
}
const motion = (page: Page) => page.evaluate(() => (window as unknown as { motion: string[] }).motion);

test("on an iPad on its side a card in the inspector comes in from its edge and fades, and leaves the way it came", async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto("/app/plan");
  await settle(page);
  await showTabs(page);
  await sheetUpToType(page);
  await page.getByTestId("search-airports").fill("KORD");
  const row = searchAirports(page).first();
  await expect(row).toBeVisible();
  await watchMotion(page);
  await row.click();
  const card = page.locator('[data-slot="map-inspector"] [data-sheet-card][data-open]');
  await expect(card).toBeVisible();
  // Its fade on the Drawer's time (WebKit names no transitionrun for the
  // move from the edge, which eases with it on the same time).
  await expect.poll(() => motion(page)).toEqual(expect.arrayContaining(["card:opacity:0.45s"]));
  await expect.poll(() => card.evaluate((c) => getComputedStyle(c).opacity)).toBe("1");
  await page.evaluate(() => ((window as unknown as { motion: string[] }).motion.length = 0));
  await card.focus();
  await page.keyboard.press("Escape");
  // Put away on a page's time, shorter than its coming (cardMotion's AWAY, --motion-page).
  await expect.poll(() => motion(page)).toEqual(expect.arrayContaining(["card:opacity:0.25s"]));
  await expect(page.locator('[data-slot="map-inspector"] [data-sheet-card]')).toHaveCount(0);
});

test("on an iPad the side panel's edge glides between its head and the window's height", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.goto("/app/plan");
  await settle(page);
  await expect(sideDrawer(page)).toBeVisible();
  // A tap on its grabber puts it in or out (half and all the way up are one box beside the map).
  const grabber = page.getByTestId("sidebar-trigger-button");
  const size = () => sideDrawer(page).getAttribute("data-panel");
  if ((await size()) === "peek") {
    await grabber.click();
    await expect.poll(size).not.toBe("peek");
  }
  await watchMotion(page);
  // Put in: its ground, drawn to its old height, closes up to the head.
  await grabber.click();
  await expect.poll(size).toBe("peek");
  await expect.poll(() => motion(page)).toContain("glide:1");
  await expect(page.locator("[data-side-glide]")).toHaveCount(0);
  // Out: the panel itself uncovered from its head down, by a clip.
  await grabber.click();
  await expect.poll(size).not.toBe("peek");
  await expect.poll(() => motion(page)).toContain("clip");
});
