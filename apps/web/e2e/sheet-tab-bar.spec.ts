import { test, expect } from "@playwright/test";
import { grabberTo, settle, settled, sideDrawer, frontSheet } from "./helpers";
import { expectPage, tab } from "./sheetPages";

/**
 * The sheet's two pages, Search and FPL, picked from the tab bar under the
 * sheet (the owner, 2026-11-13: tab bar, option A; docs/design/rules.md
 * "One search"): FPL a tab in a glass capsule, Search the round search tab
 * apart at the trailing end, as iOS 26's `Tab(role: .search)`. The bar
 * stays in sight at every size, the pill's too, the sheet's sizes over it;
 * no sideways swipe turns a page; the grabber is the one plain bar. With no
 * route FPL is its empty box, a route made goes to FPL, and a drag up or
 * down still sizes the sheet on either page. The cards over the pages:
 * sheet-pages-cards.spec.
 */

test("Search to FPL and back by the tab bar, the sheet's size kept", { tag: "@smoke" }, async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  // With no route the sheet opens on Search.
  await expectPage(page, 0);
  await expect(tab(page, 0)).toHaveAccessibleName("Search");
  await expect(tab(page, 1)).toHaveAccessibleName("FPL");
  await expect(page.getByRole("tablist", { name: "Sheet pages" })).toBeVisible();

  await tab(page, 1).click();
  await expectPage(page, 1);
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
  // FPL with no route: its empty route box, no "Plan a flight" (96463ab51).
  await expect(sideDrawer(page).getByTestId("route-box")).toBeVisible();
  await expect(sideDrawer(page).getByText("Plan a flight")).toHaveCount(0);

  await tab(page, 0).click();
  await expectPage(page, 0);
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
  // A tab tapped again changes nothing: the size is the grabber's.
  await tab(page, 0).click();
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
  // The keyboard: the stock Tabs' arrows move between the tabs.
  await tab(page, 0).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(tab(page, 1)).toBeFocused();
});

test("the tab bar stays in sight under the sheet at every size, the pill's too", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "the phone's sheet");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const bar = page.getByTestId("sheet-tab-bar");
  for (const size of ["peek", "half", "full"] as const) {
    await grabberTo(page, size);
    await expect(bar).toBeInViewport();
    // The sheet's own room ends where the bar's begins (SheetDrawer's
    // viewport stands on it); its ground runs on behind the bar.
    const [sheetFoot, barTop] = await page.evaluate(() => [
      document.querySelector('[data-slot="map-panel"]')!.parentElement!.getBoundingClientRect().bottom,
      document.querySelector('[data-testid="sheet-tab-bar"]')!.getBoundingClientRect().top,
    ]);
    expect(Math.abs(sheetFoot - barTop), `at ${size}`).toBeLessThan(1);
  }
});

test("the tabs are 44 points to a finger without growing, and the grabber is one plain bar", async ({ page }) => {
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
    const grabber = document.querySelector('[data-slot="map-panel"] [data-testid="sidebar-trigger-button"]')!;
    return {
      tabs: [0, 1].map((i) => hit(document.querySelector(`[data-page-tab="${i}"]`)!)),
      grabber: hit(grabber),
      bar: grabber.querySelector("span")!.getBoundingClientRect(),
      bars: document.querySelectorAll('[data-slot="map-panel"] [data-testid="sidebar-trigger-button"] span').length,
    };
  });
  for (const t of sizes.tabs) {
    expect(t.hitH).toBeGreaterThanOrEqual(44);
    expect(t.hitW).toBeGreaterThanOrEqual(44);
    // Inside the 48-point glass, not grown past it.
    expect(t.h).toBeLessThanOrEqual(48);
  }
  expect(sizes.grabber.hitH).toBeGreaterThanOrEqual(44);
  expect(sizes.grabber.h, "the grabber's room").toBeLessThanOrEqual(16);
  expect(sizes.bars).toBe(1);
  expect(sizes.bar.width).toBeCloseTo(36, 0);
  expect(sizes.bar.height).toBeCloseTo(5, 0);
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
  await tab(page, 0).click();
  await expectPage(page, 0);
  await expect(page.getByTestId("panel-foot")).toBeHidden();
});

test("a drag up or down still sizes the sheet on either page", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "the phone's sheet");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await grabberTo(page, "half");
  for (const at of [1, 0] as const) {
    await tab(page, at).click();
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
  // The clash with the pager's swipe that the tab bar ended (the owner,
  // 2026-11-11: "I am not able to scroll the nearest because it swipes to
  // the fpl").
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
