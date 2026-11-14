import { test, expect } from "@playwright/test";
import { consoleSheet, grabberTo, settle, settled, sideDrawer, frontSheet } from "./helpers";
import { expectPage, expectShown, openAirport, toggle } from "./sheetPages";

/**
 * The sheet's two pages, Search and FPL, turned by one round button at
 * the end of their first row (the owner, 2026-11-13: "Why not make the
 * same tab on the right toggle between search and fpl"; 2026-11-14: "Swap
 * the fpl toggle and account buttons ... toggling between search and fpl
 * keeps the same-size component with a toggle replacing account";
 * docs/design/rules.md "One search"): on Search after the one search's
 * field, on FPL after the airplane's strip, the bar between the same size
 * on both, so a turn moves nothing. The account button is where the
 * toggle rode, the sheet's top at the left under the 3D. It shows the page
 * a tap goes to, as Apple Maps' 2D/3D button does: FPL's route glyph on
 * Search, the magnifier on FPL. No bar under the sheet: its sizes stand on
 * the screen's foot. No sideways swipe turns a page; the grabber is the
 * one plain bar. With no route FPL is its empty box, a route made goes to
 * FPL, and a drag up or down still sizes the sheet on either page. A card
 * open covers the row, the toggle with it; its close brings it back. The
 * cards over the pages: sheet-pages-cards.spec.
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

test("the toggle ends the first row on both pages, the bar before it one size, and the account button rides the sheet's top under the 3D", async ({
  page,
}) => {
  test.skip(page.viewportSize()!.width >= 768, "the phone's sheet");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await grabberTo(page, "half");
  await settled(sideDrawer(page));
  const measure = () =>
    page.evaluate(() => {
      const box = (sel: string) => {
        const r = document.querySelector(sel)!.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height };
      };
      const up = document.querySelector('[data-testid="sheet-pages"]')!.getAttribute("data-page");
      // The page's bar: the search's field on Search, the strip on FPL.
      const bar = up === "0" ? '[data-sheet-page="0"] label:has([data-testid="search-airports"])' : '[data-testid="route-strip"]';
      return {
        sheet: box('[data-slot="map-panel"]'),
        bar: box(bar),
        toggle: box('[data-testid="sheet-page-toggle"]'),
        account: box('[data-map-controls] [data-testid="account-button"], [data-testid="account-button"]'),
        threeD: document.querySelector('[data-testid="map-3d-button"]')!.parentElement!.getBoundingClientRect(),
        viewport: innerWidth,
      };
    });
  const fpl = await measure();
  await toggle(page).click();
  await expectPage(page, 0);
  const search = await measure();
  for (const m of [fpl, search]) {
    // The toggle at the row's end, sixteen in from the sheet's edge, level
    // with the bar, eight after it.
    expect(m.viewport - m.toggle.right).toBeCloseTo(16, 0);
    expect(m.toggle.left - m.bar.right).toBeCloseTo(8, 0);
    expect(m.toggle.top + m.toggle.h / 2).toBeCloseTo(m.bar.top + m.bar.h / 2, 0);
    // The account button over the sheet's top at the left, under the 3D.
    expect(m.account.bottom).toBeLessThanOrEqual(m.sheet.top);
    expect(m.account.left).toBeLessThanOrEqual(20);
    expect(m.account.top).toBeGreaterThan(m.threeD.bottom);
  }
  // One bar, one place: nothing moved or resized on the turn.
  for (const k of ["top", "left", "w", "h"] as const) {
    expect(search.bar[k], `the bar's ${k}`).toBeCloseTo(fpl.bar[k], 0);
    expect(search.toggle[k], `the toggle's ${k}`).toBeCloseTo(fpl.toggle[k], 0);
  }
  expect(search.bar.h).toBeCloseTo(46, 0);
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
      // The finger finds the toggle past its disc's edge.
      edge: document.elementFromPoint(box.right + 3, box.top + box.height / 2)?.closest('[data-testid="sheet-page-toggle"]') != null,
      grabber: hit(grabber),
      bar: grabber.querySelector("span")!.getBoundingClientRect(),
      bars: document.querySelectorAll('[data-slot="map-panel"] [data-testid="sidebar-trigger-button"] span').length,
    };
  });
  expect(sizes.toggle.hitH).toBeGreaterThanOrEqual(44);
  expect(sizes.toggle.hitW).toBeGreaterThanOrEqual(44);
  // A 36-point disc, the account button's size, not grown.
  expect(sizes.toggle.h).toBeLessThanOrEqual(36);
  expect(sizes.edge).toBe(true);
  expect(sizes.grabber.hitH).toBeGreaterThanOrEqual(44);
  expect(sizes.grabber.h, "the grabber's room").toBeLessThanOrEqual(16);
  expect(sizes.bars).toBe(1);
  expect(sizes.bar.width).toBeCloseTo(36, 0);
  expect(sizes.bar.height).toBeCloseTo(5, 0);
});

test("all the way up the toggle stays in the row and the account button gives way, and the deep links still name the pages", async ({
  page,
}) => {
  test.skip(page.viewportSize()!.width >= 768, "the phone's sheet");
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "full");
  // The row is the sheet's, pinned at its top; the account button gives
  // way as the map's buttons do (index.css), its glass the button's parent.
  await expect(toggle(page)).toBeVisible();
  await expect(page.getByTestId("account-button").locator("..")).toHaveCSS("opacity", "0");
  await grabberTo(page, "half");
  await expect(page.getByTestId("account-button").locator("..")).toHaveCSS("opacity", "1");
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
  // Half way up, FPL's bar is back with the route's row under it.
  await grabberTo(page, "half");
  await expect(sideDrawer(page).getByTestId("route-strip")).toBeVisible();
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

test("a card open covers the row and its toggle, the account button riding its top, and its close brings the toggle back", async ({
  page,
}) => {
  // The toggle is the sheet's own row's since the owner swapped it with
  // the account button (2026-11-14); the account button rides the front
  // card's top, as the map's buttons do.
  const phone = page.viewportSize()!.width < 768;
  const openCards = page.locator("[data-sheet-card][data-open]");
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  await expectPage(page, 0);

  await openAirport(page, "KOSH");
  // The sheet's row is put away under the card, the toggle with it.
  await expect(toggle(page)).toBeHidden();
  if (phone) {
    const card = (await frontSheet(page).boundingBox())!;
    const glass = (await page.getByTestId("account-button").locator("..").boundingBox())!;
    expect(glass.y + glass.height).toBeLessThanOrEqual(card.y + 1);
    expect(card.y - (glass.y + glass.height)).toBeLessThanOrEqual(32);
  }
  await page.getByTestId("place-close").last().click();
  await expect(openCards).toHaveCount(0);
  await expect(toggle(page)).toBeVisible();
  await toggle(page).click();
  await expectShown(page, 1);

  // You, from the account button, over FPL: put away, FPL is as it was.
  await page.getByTestId("account-button").click();
  await expect(consoleSheet(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(consoleSheet(page)).toHaveCount(0);
  await expectShown(page, 1);
});
