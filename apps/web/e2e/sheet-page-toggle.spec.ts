import { test, expect } from "@playwright/test";
import { grabberTo, settle, settled, sideDrawer, frontSheet } from "./helpers";
import { expectPage, toggle } from "./sheetPages";

/**
 * The sheet's two pages, Search and FPL, turned by one round glass button
 * riding the sheet's top at the right (the owner, 2026-11-13: "Why not
 * make the same tab on the right toggle between search and fpl";
 * docs/design/rules.md "One search"), under the map's buttons, the same
 * circle as the 3D one at the left. It shows the page a tap goes to, as
 * Apple Maps' 2D/3D button does: FPL's route glyph on Search, the
 * magnifier on FPL. No bar under the sheet: its sizes stand on the
 * screen's foot. No sideways swipe turns a page; the grabber is the one
 * plain bar. With no route FPL is its empty box, a route made goes to FPL,
 * and a drag up or down still sizes the sheet on either page. The cards
 * over the pages: sheet-pages-cards.spec.
 */

test("Search to FPL and back by the toggle, the sheet's size kept", { tag: "@smoke" }, async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  // With no route the sheet opens on Search, the toggle offering FPL.
  await expectPage(page, 0);
  await expect(toggle(page)).toBeVisible();

  await toggle(page).click();
  await expectPage(page, 1);
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
  // FPL with no route: its empty route box, no "Plan a flight" (96463ab51).
  await expect(sideDrawer(page).getByTestId("route-box")).toBeVisible();
  await expect(sideDrawer(page).getByText("Plan a flight")).toHaveCount(0);

  await toggle(page).click();
  await expectPage(page, 0);
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
  // The keyboard: a real button, Enter and Space turn the page, the focus
  // kept on it, its name now the other way.
  await toggle(page).focus();
  await page.keyboard.press("Enter");
  await expectPage(page, 1);
  await expect(toggle(page)).toBeFocused();
  await page.keyboard.press("Space");
  await expectPage(page, 0);
});

test("the toggle rides the sheet's top at the right, under the map's buttons, and the sheet stands on the screen's foot", async ({
  page,
}) => {
  test.skip(page.viewportSize()!.width >= 768, "the phone's sheet");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  for (const size of ["peek", "half"] as const) {
    await grabberTo(page, size);
    await settled(sideDrawer(page));
    const m = await page.evaluate(() => {
      const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
      const glass = document.querySelector('[data-testid="sheet-page-toggle"]')!.parentElement!.getBoundingClientRect();
      const group = document.querySelector("[data-map-controls] > .liquid-glass")!.getBoundingClientRect();
      return {
        sheet: box('[data-slot="map-panel"]'),
        glass: { top: glass.top, bottom: glass.bottom, right: glass.right, w: glass.width, h: glass.height },
        groupBottom: group.bottom,
        // The 3D button's glass circle at the left.
        threeD: document.querySelector('[data-testid="map-3d-button"]')!.parentElement!.getBoundingClientRect(),
        viewport: { w: innerWidth, h: innerHeight },
      };
    });
    // Over the sheet's top, at the right, under the group, not over it.
    expect(m.glass.bottom, `at ${size}`).toBeLessThanOrEqual(m.sheet.top);
    expect(m.sheet.top - m.glass.bottom, `at ${size}`).toBeLessThanOrEqual(32);
    expect(m.viewport.w - m.glass.right, `at ${size}`).toBeLessThanOrEqual(16);
    expect(m.glass.top, `at ${size}`).toBeGreaterThanOrEqual(m.groupBottom);
    // The 3D circle's size and level at the left.
    expect(m.glass.w).toBeCloseTo(m.threeD.width, 0);
    expect(m.glass.h).toBeCloseTo(m.threeD.height, 0);
    expect(m.glass.bottom).toBeCloseTo(m.threeD.bottom, 0);
  }
  // No bar under the sheet: the pill is the search's own 4.25 rem off the
  // screen's foot (no home indicator here), its 44 points back.
  await grabberTo(page, "peek");
  await settled(sideDrawer(page));
  const [top, rem, h] = await page.evaluate(() => [
    document.querySelector('[data-slot="map-panel"]')!.getBoundingClientRect().top,
    parseFloat(getComputedStyle(document.documentElement).fontSize),
    innerHeight,
  ]);
  expect(h - top).toBeLessThanOrEqual(4.25 * rem + 2);
  await expect(page.getByTestId("sheet-tab-bar")).toHaveCount(0);
});

test("the toggle is 44 points to a finger without growing, and the grabber is one plain bar", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "the phone's sheet");
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  const sizes = await page.evaluate(() => {
    const hit = (el: Element) => {
      const box = el.getBoundingClientRect();
      const after = getComputedStyle(el, "::after");
      return { w: box.width, h: box.height, hitW: parseFloat(after.width), hitH: parseFloat(after.height) };
    };
    const button = document.querySelector('[data-testid="sheet-page-toggle"]')!;
    const box = button.getBoundingClientRect();
    const grabber = document.querySelector('[data-slot="map-panel"] [data-testid="sidebar-trigger-button"]')!;
    return {
      toggle: hit(button),
      // The finger finds the toggle at its glass's edge, not the map.
      edge: document.elementFromPoint(box.left - 3, box.top + box.height / 2)?.closest('[data-testid="sheet-page-toggle"]') != null,
      grabber: hit(grabber),
      bar: grabber.querySelector("span")!.getBoundingClientRect(),
      bars: document.querySelectorAll('[data-slot="map-panel"] [data-testid="sidebar-trigger-button"] span').length,
    };
  });
  expect(sizes.toggle.hitH).toBeGreaterThanOrEqual(44);
  expect(sizes.toggle.hitW).toBeGreaterThanOrEqual(44);
  // The 3D button's 36 inside its glass, not grown past it.
  expect(sizes.toggle.h).toBeLessThanOrEqual(36);
  expect(sizes.edge).toBe(true);
  expect(sizes.grabber.hitH).toBeGreaterThanOrEqual(44);
  expect(sizes.grabber.h, "the grabber's room").toBeLessThanOrEqual(16);
  expect(sizes.bars).toBe(1);
  expect(sizes.bar.width).toBeCloseTo(36, 0);
  expect(sizes.bar.height).toBeCloseTo(5, 0);
});

test("the toggle gives way all the way up, as the map's buttons do, and the deep links still name the pages", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "the phone's sheet");
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "full");
  // As the map's buttons do (index.css): only a sliver showed past the edge.
  await expect(toggle(page)).toHaveCSS("opacity", "0");
  await grabberTo(page, "half");
  await expect(toggle(page)).toHaveCSS("opacity", "1");
  // The deep links still name the pages.
  await page.goto("/app/plan?open=fpl");
  await settle(page);
  await expectPage(page, 1);
  await page.goto("/app/plan?open=search");
  await settle(page);
  await expectPage(page, 0);
});

test("a route made goes to FPL; Search puts FPL's figures away with its page", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  await expectPage(page, 0);
  // A route in the address (a link) opens on FPL.
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await expectPage(page, 1);
  // The figures at the foot are FPL's alone: at half, and at the pill on a
  // phone, where they are the pill in the route's row's place (the owner,
  // 2026-11-11, the canvas's b).
  await grabberTo(page, "half");
  await expect(page.getByTestId("panel-foot")).toBeVisible();
  await grabberTo(page, "peek");
  await expect(page.getByTestId("panel-foot")).toBeVisible();
  await expect(sideDrawer(page).getByTestId("flight-line")).toBeVisible();
  await expect(sideDrawer(page).getByTestId("route-box").or(sideDrawer(page).getByTestId("route-line")).first()).toBeHidden();
  // Half way up, the route's row is back over the list.
  await grabberTo(page, "half");
  await expect(sideDrawer(page).getByTestId("route-box").or(sideDrawer(page).getByTestId("route-line")).first()).toBeVisible();
  await toggle(page).click();
  await expectPage(page, 0);
  await expect(page.getByTestId("panel-foot")).toBeHidden();
});

test("a drag up or down still sizes the sheet on either page", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "the phone's sheet");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await grabberTo(page, "half");
  for (const at of [1, 0] as const) {
    if ((await toggle(page).getAttribute("data-shows")) === String(at)) await toggle(page).click();
    await expectPage(page, at);
    await grabberTo(page, "full");
    await grabberTo(page, "half");
    // A drag down from the grabber's row lowers it a size, as before.
    const grabber = (await page.getByTestId("sidebar-trigger-button").boundingBox())!;
    const x = grabber.x + grabber.width / 2;
    await page.mouse.move(x, grabber.y + 6);
    await page.mouse.down();
    await page.mouse.move(x, grabber.y + 200, { steps: 12 });
    await page.mouse.up();
    await expect(frontSheet(page)).toHaveAttribute("data-panel", "peek");
    await settled(sideDrawer(page));
    await expectPage(page, at);
    await grabberTo(page, "half");
  }
});

test("a sideways drag on the Nearest row is the row's, and no page turns", async ({ page }) => {
  // The clash with the pager's swipe that the pages' own picker ended (the
  // owner, 2026-11-11: "I am not able to scroll the nearest because it
  // swipes to the fpl").
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 43.98, longitude: -88.56 });
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  await expectPage(page, 0);
  const row = sideDrawer(page).getByTestId("pill-section-nearest").getByTestId("nearest-strip");
  await expect(row).toBeVisible();
  await row.evaluate((el) => (el.scrollLeft = el.scrollWidth));
  const box = (await row.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await expectPage(page, 0);
});
