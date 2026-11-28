import { test, expect, type Page } from "@playwright/test";
import { consoleSheet, grabberTo, settle, settled, sideDrawer, sheetFoot, frontSheet } from "./helpers";
import { expectPage, expectSearchInUse, expectShown, openAirport, showPage, toggle } from "./sheetPages";
import { extrasOn } from "./extras";
import { hold } from "./pacing";
// The parked features it exercises, on (Settings' Extras, src/lib/extras).
test.beforeEach(({ page }) => extrasOn(page, "threeD"));

/**
 * The sheet's two pages, Search and FPL, turned by one round button in
 * their first row (the owner, 2026-11-13: "Why not make the same tab on
 * the right toggle between search and fpl"; docs/design/rules.md "One
 * search"): on Search at the row's start, before the one search's field,
 * the account button at its end as Apple Maps' avatar is (the owner,
 * 2026-11-20: "move the fpl button on the left side of search and avatar
 * to the right side"); on FPL its Search button at the start and its ✕ at the row's end,
 * the bars the same height on both. The account button is no longer over
 * the map. Both are 44-point discs to a finger (iOS 26's round buttons,
 * the owner, 2026-11-20), the toggle's its own size. It shows the page
 * a tap goes to, as Apple Maps' 2D/3D button does: the word FPL on
 * Search (the owner, 2026-11-20); FPL's page has its Search button at the
 * start instead. No bar under the sheet: its sizes stand on
 * the screen's foot. No sideways swipe turns a page; the grabber is the
 * one plain bar. With no route FPL is its empty box, a route made goes to
 * FPL, and a drag up or down still sizes the sheet on either page. A card
 * open covers the row, the toggle with it; its close and the search's
 * Cancel bring it back. The cards over the pages: sheet-pages-cards.spec.
 */

test("Search to FPL by the toggle and back by FPL's Search button, the sheet's size kept", { tag: "@smoke" }, async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  // With no route the sheet opens on Search, the toggle offering FPL.
  await expectPage(page, 0);
  await expect(toggle(page)).toBeVisible();

  await toggle(page).click();
  await expectPage(page, 1);
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
  // FPL with no route: its empty route's card, no "Plan a flight" (96463ab51).
  await expect(sideDrawer(page).getByTestId("route-empty")).toBeVisible();
  await expect(sideDrawer(page).getByText("Plan a flight")).toHaveCount(0);

  // FPL's Search button is the way back, the sheet's size kept, Search at rest.
  await showPage(page, 0);
  await expectPage(page, 0);
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
  // The keyboard: a real button, Enter turns the page.
  await page.goto("/app/plan?open=search");
  await settle(page);
  await grabberTo(page, "half");
  await toggle(page).focus();
  await page.keyboard.press("Enter");
  await expectPage(page, 1);
});

test("on Search the toggle starts the first row and the account button ends it, on FPL its Search button starts it and the ✕ ends it, the bars one size", async ({
  page,
}) => {
  test.skip(page.viewportSize()!.width >= 660, "the phone's sheet");
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
      // The page's first row's middle: the search's field on Search, FPL's
      // two rows on FPL, its title over its pills between Search and the ✕ and FPL
      // (the owner, 2026-11-19: "Make two rows between the close and share
      // button").
      const bar = up === "0" ? '[data-sheet-page="0"] label:has([data-testid="search-airports"])' : '[data-testid="fpl-head"]';
      return {
        sheet: box('[data-slot="map-panel"]'),
        bar: box(bar),
        // Search's toggle; FPL's head has its Search button and ✕ instead.
        toggle: up === "0" ? box('[data-testid="sheet-page-toggle"]') : box('[data-testid="fpl-search"]'),
        clear: up === "0" ? undefined : box('[data-testid="fpl-clear"]'),
        // The account button drawn in sight (Search's, at rest), or none:
        // the page put away keeps its box, hidden.
        account: [...document.querySelectorAll('[data-testid="account-button"]')]
          .find((el) => el.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
          ?.getBoundingClientRect(),
        viewport: innerWidth,
      };
    });
  const fpl = await measure();
  // Search at rest, by its deep link: FPL's Search button goes to it
  // too, over the same page.
  await page.goto("/app/plan?dep=C81&dest=KDLH&open=search");
  await settle(page);
  await grabberTo(page, "half");
  await settled(sideDrawer(page));
  await expectPage(page, 0);
  const search = await measure();
  const mid = (b: { top: number; h: number }) => b.top + b.h / 2;
  // On FPL the ✕ at the row's end, sixteen in from the sheet's edge, level
  // with the two rows and its Search button at the start; no account button
  // in sight (it is Search's).
  expect(fpl.viewport - fpl.clear!.right).toBeCloseTo(16, 0);
  expect(mid(fpl.clear!)).toBeCloseTo(mid(fpl.bar), 0);
  expect(fpl.toggle.left - fpl.sheet.left).toBeCloseTo(16, 0);
  expect(mid(fpl.toggle)).toBeCloseTo(mid(fpl.bar), 0);
  expect(fpl.account, "no account button on FPL").toBeUndefined();
  // On Search the toggle at the row's start, sixteen in from the sheet's
  // edge, the field from eight after it to eight before the account
  // button, which ends the row sixteen in from the other edge, all three
  // level: in the sheet's row, not over the map.
  const account = search.account!;
  expect(account, "the account button in sight on Search").toBeDefined();
  expect(search.toggle.left - search.sheet.left).toBeCloseTo(16, 0);
  expect(search.bar.left - search.toggle.right, "the field eight after the toggle").toBeCloseTo(8, 0);
  expect(account.left - search.bar.right, "the account button eight after the field").toBeCloseTo(8, 0);
  expect(search.viewport - account.right).toBeCloseTo(16, 0);
  expect(mid(search.toggle)).toBeCloseTo(mid(search.bar), 0);
  expect(account.top + account.height / 2).toBeCloseTo(mid(search.bar), 0);
  expect(account.top, "the account button in the sheet").toBeGreaterThan(search.sheet.top);
  // FPL's two rows level with the search's field, the row the same; the
  // toggle the same 44-point disc on both pages.
  expect(mid(fpl.bar), "the two rows level with the field").toBeCloseTo(mid(search.bar), 0);
  for (const k of ["top", "w", "h"] as const) expect(search.toggle[k], `the toggle's ${k}`).toBeCloseTo(fpl.toggle[k], 0);
  expect(search.toggle.w).toBeCloseTo(44, 0);
  // FPL's strip is centred between the row's ends (its Search button
  // at the left, the ✕ at the right).
  const sheetMid = (fpl.sheet.left + fpl.sheet.right) / 2;
  expect((fpl.bar.left + fpl.bar.right) / 2, "the two rows are centred in the row").toBeCloseTo(sheetMid, -1);
  expect(fpl.bar.right).toBeLessThanOrEqual(fpl.clear!.left);
  expect(fpl.bar.left).toBeGreaterThanOrEqual(fpl.toggle.right);
  // The title's Title 3 line (25) over the pills (24): 49, the field the same.
  expect(search.bar.h).toBeCloseTo(49, 0);
  expect(fpl.bar.h, "FPL's two rows the field's height").toBeCloseTo(49, 0);
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

test("the toggle and the account button are 44-point discs, and the grabber is one plain bar", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 660, "the phone's sheet");
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
    const account = [...document.querySelectorAll('[data-testid="account-button"]')].find((el) => el.getBoundingClientRect().width > 0)!;
    const disc = account.getBoundingClientRect();
    const finds = (x: number, y: number, id: string) => document.elementFromPoint(x, y)?.closest(`[data-testid="${id}"]`) != null;
    const grabber = document.querySelector('[data-slot="map-panel"] [data-testid="sidebar-trigger-button"]')!;
    return {
      toggle: hit(button),
      // The finger finds the toggle right to its 44-point disc's edges.
      edges: [
        finds(box.left + 2, box.top + box.height / 2, "sheet-page-toggle"),
        finds(box.right - 2, box.top + box.height / 2, "sheet-page-toggle"),
        finds(box.left + box.width / 2, box.top + 2, "sheet-page-toggle"),
        finds(box.left + box.width / 2, box.bottom - 2, "sheet-page-toggle"),
      ],
      account: hit(account),
      // And the account button right to its disc's edge.
      accountEdge: finds(disc.left + disc.width / 2, disc.bottom - 2, "account-button"),
      grabber: hit(grabber),
      bar: grabber.querySelector("span")!.getBoundingClientRect(),
      bars: document.querySelectorAll('[data-slot="map-panel"] [data-testid="sidebar-trigger-button"] span').length,
    };
  });
  // A 44-point disc, as iOS 26's round buttons are (the owner,
  // 2026-11-20), its own 44 its hit area.
  expect(sizes.toggle.w).toBeCloseTo(44, 0);
  expect(sizes.toggle.h).toBeCloseTo(44, 0);
  expect(sizes.edges).toEqual([true, true, true, true]);
  // The account button a 44-point disc too, as Apple Maps' avatar (the
  // owner, 2026-11-20: "make all buttons like Apple Maps size"; accountLook).
  expect(sizes.account.w).toBeCloseTo(44, 0);
  expect(sizes.account.h).toBeCloseTo(44, 0);
  expect(sizes.accountEdge).toBe(true);
  expect(sizes.grabber.hitH).toBeGreaterThanOrEqual(44);
  expect(sizes.grabber.h, "the grabber's room").toBeLessThanOrEqual(16);
  expect(sizes.bars).toBe(1);
  expect(sizes.bar.width).toBeCloseTo(36, 0);
  expect(sizes.bar.height).toBeCloseTo(5, 0);
});

test("all the way up the toggle and the account button stay in the row, and the deep links still name the pages", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 660, "the phone's sheet");
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "full");
  // The row is the sheet's, pinned at its top, the account button in it
  // (no circle over the map to give way, MapControls).
  await expect(toggle(page)).toBeVisible();
  await expect(sideDrawer(page).getByRole("search").getByTestId("account-button")).toBeInViewport();
  await expect(page.locator("[data-map-food]").getByTestId("account-button")).toHaveCount(0);
  await grabberTo(page, "half");
  await expect(toggle(page)).toBeVisible();
  await expect(sideDrawer(page).getByRole("search").getByTestId("account-button")).toBeInViewport();
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
  // 2026-11-11, the canvas's b), in FPL's foot bar beside the sheet
  // (sheet/FootBar).
  const foot = page.getByTestId("foot-bar").or(page.getByTestId("panel-foot"));
  await grabberTo(page, "half");
  await expect(foot).toBeVisible();
  await grabberTo(page, "peek");
  await expect(foot).toBeVisible();
  await expect(sheetFoot(page).getByTestId("flight-line")).toBeVisible();
  await expect(sideDrawer(page).getByTestId("route-summary").or(sideDrawer(page).getByTestId("route-box")).first()).toBeHidden();
  // Half way up, FPL's bar is back with the route's row under it.
  await grabberTo(page, "half");
  await expect(sideDrawer(page).getByTestId("route-strip")).toBeVisible();
  await expect(sideDrawer(page).getByTestId("route-summary").or(sideDrawer(page).getByTestId("route-box")).first()).toBeVisible();
  await showPage(page, 0);
  await expectPage(page, 0);
  await expect(foot).toBeHidden();
});

/** A finger put down at (x, y) and moved `dy` down, a frame apart, then
 *  let go (Chromium's CDP, as swipe-rows.spec's swipe). */
async function fingerDown(page: Page, x: number, y: number, dy: number) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, p?: { x: number; y: number }) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [{ ...p, id: 1 }] : [] });
  await touch("touchStart", { x, y });
  for (let i = 1; i <= 12; i++) {
    await touch("touchMove", { x, y: y + (dy * i) / 12 });
    await hold(page, 16);
  }
  await touch("touchEnd");
  await cdp.detach();
}

test("a drag up or down still sizes the sheet on either page", async ({ page, browserName }) => {
  test.skip(page.viewportSize()!.width >= 660, "the phone's sheet");
  test.skip(browserName !== "chromium", "a finger, by Chromium's CDP");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await grabberTo(page, "half");
  for (const at of [1, 0] as const) {
    await showPage(page, at);
    await expectPage(page, at);
    await grabberTo(page, "full");
    await grabberTo(page, "half");
    // A finger's drag down from the grabber lowers it a size, as before: a
    // phone's sheet, so a touch (Chromium's CDP), not a mouse pressed on the
    // grabber's button.
    const grabber = (await page.getByTestId("sidebar-trigger-button").boundingBox())!;
    await fingerDown(page, grabber.x + grabber.width / 2, grabber.y + 6, 200);
    await expect(frontSheet(page)).toHaveAttribute("data-panel", "peek");
    await settled(sideDrawer(page));
    // And the drag's risen face put away, held a moment past the lift
    // (SheetDrawer's data-risen): read in that moment the page's row was in
    // sight, then hidden at the pill, and its name gone with it.
    await expect(sideDrawer(page)).not.toHaveAttribute("data-risen");
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

test("a card open covers the row, its toggle and account button, and its close and the search's Cancel bring them back", async ({
  page,
}) => {
  // The toggle and the account button are the sheet's own row's (the
  // owner, 2026-11-20); the 3D's circle rides the front card's top, as the
  // map's buttons do.
  const phone = page.viewportSize()!.width < 660;
  const openCards = page.locator("[data-sheet-card][data-open]");
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  await expectPage(page, 0);

  await openAirport(page, "KOSH");
  // The sheet's row is put away under the card, the toggle and the
  // account button with it.
  await expect(toggle(page)).toBeHidden();
  await expect(page.getByTestId("account-button")).toBeHidden();
  if (phone) {
    const card = (await frontSheet(page).boundingBox())!;
    const glass = (await page.getByTestId("map-3d-button").locator("..").boundingBox())!;
    expect(glass.y + glass.height).toBeLessThanOrEqual(card.y + 1);
    expect(card.y - (glass.y + glass.height)).toBeLessThanOrEqual(32);
  }
  await page.getByTestId("place-close").last().click();
  await expect(openCards).toHaveCount(0);
  // Back to the search with its query kept (docs/design/rules.md, the
  // card's row), its Cancel where the toggle rides; Cancel lets the search
  // go and the toggle and the account button are back.
  await expectSearchInUse(page, "KOSH");
  await expect(page.getByTestId("account-button")).toBeHidden();
  await page.getByTestId("one-search-cancel").click();
  await expect(toggle(page)).toBeVisible();
  await expect(page.getByTestId("account-button")).toBeVisible();

  // You, from the account button, over Search: put away, Search is as it was.
  await page.getByTestId("account-button").click();
  await expect(consoleSheet(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(consoleSheet(page)).toHaveCount(0);
  await expectShown(page, 0);
  // On FPL the row is its own, Share and the ✕: no account button.
  await toggle(page).click();
  await expectShown(page, 1);
  await expect(page.getByTestId("account-button")).toBeHidden();
});
