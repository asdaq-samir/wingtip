import { test, expect, type Page } from "@playwright/test";
import { grabberTo, settle, settled, sideDrawer } from "./helpers";

/**
 * The sheet's two pages, Search and FPL (the owner, 2026-11-11;
 * docs/design/rules.md §4a): a sideways swipe moves a page and never the
 * sheet, the split grabber's two bars follow and take a tap (a tap on the
 * page up's bar sizing the sheet, as the grabber did), with no route
 * FPL says "Plan a flight" and its Search lands on the focused field, a
 * route made goes to FPL, and a drag up or down still sizes the sheet on
 * either page.
 */

const pager = (page: Page) => sideDrawer(page).getByTestId("sheet-pager");
/** A page's bar of the split grabber (SheetGrabber), outside the sheet's
 *  scroller: the Drawer's popup holds it. */
const bar = (page: Page, at: 0 | 1) => page.locator(`[data-page-bar="${at}"]`);

/** A finger's sideways swipe across the pager, at its middle, by a mouse
 *  (Embla takes a mouse's drag as it takes a touch's). */
async function swipe(page: Page, way: "left" | "right") {
  const box = (await pager(page).boundingBox())!;
  const y = box.y + Math.min(box.height / 2, 120);
  const from = way === "left" ? box.x + box.width * 0.8 : box.x + box.width * 0.2;
  const to = way === "left" ? box.x + box.width * 0.1 : box.x + box.width * 0.9;
  await page.mouse.move(from, y);
  await page.mouse.down();
  await page.mouse.move(to, y, { steps: 12 });
  await page.mouse.up();
}

async function expectPage(page: Page, at: 0 | 1) {
  await expect(pager(page)).toHaveAttribute("data-page", String(at));
  await expect(bar(page, at)).toHaveAttribute("aria-selected", "true");
  await expect(bar(page, at === 0 ? 1 : 0)).toHaveAttribute("aria-selected", "false");
}

test("Search to FPL and back, by a swipe and by the grabber's bars, the sheet's size kept", { tag: "@smoke" }, async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  // With no route the sheet opens on Search.
  await expectPage(page, 0);
  await expect(bar(page, 0)).toHaveAccessibleName("Search, page 1 of 2");
  await expect(bar(page, 1)).toHaveAccessibleName("FPL, page 2 of 2");

  // A swipe to FPL: the page moves, the sheet stays half way.
  await swipe(page, "left");
  await expectPage(page, 1);
  await expect(sideDrawer(page)).toHaveAttribute("data-panel", "half");
  await expect(sideDrawer(page).getByText("Plan a flight")).toBeVisible();

  // And back, by the swipe and then by the bars.
  await swipe(page, "right");
  await expectPage(page, 0);
  await bar(page, 1).click();
  await expectPage(page, 1);
  await bar(page, 0).click();
  await expectPage(page, 0);
  await expect(sideDrawer(page)).toHaveAttribute("data-panel", "half");
  // The page up's bar is the grabber: a tap sizes the sheet, the page kept.
  await bar(page, 0).click();
  await expect(sideDrawer(page)).not.toHaveAttribute("data-panel", "half");
  await expectPage(page, 0);
  await grabberTo(page, "half");
  // The keyboard: Right and Left switch the pages, Up and Down size the sheet.
  await bar(page, 0).focus();
  await page.keyboard.press("ArrowRight");
  await expectPage(page, 1);
  await page.keyboard.press("ArrowLeft");
  await expectPage(page, 0);
  await page.keyboard.press("ArrowUp");
  await expect(sideDrawer(page)).toHaveAttribute("data-panel", "full");
  await expectPage(page, 0);
});

test("the grabber's bars are 44 points tall to a finger and meet in the middle, the bars the grabber's width", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "the phone's sheet");
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  const hits = await page.evaluate(() =>
    [0, 1].map((i) => {
      const tab = document.querySelector(`[data-page-bar="${i}"]`)!;
      const after = getComputedStyle(tab, "::after");
      const box = tab.getBoundingClientRect();
      const mark = tab.querySelector("span")!.getBoundingClientRect();
      return { left: box.left, right: box.right, hit: parseFloat(after.height), markLeft: mark.left, markRight: mark.right };
    }),
  );
  expect(hits[0].hit).toBeGreaterThanOrEqual(44);
  expect(hits[1].hit).toBeGreaterThanOrEqual(44);
  expect(hits[0].right).toBeCloseTo(hits[1].left, 0);
  expect(hits[1].markRight - hits[0].markLeft).toBeCloseTo(36, 0);
});

test("with no route, FPL's Search lands on the search's field, focused", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  await bar(page, 1).click();
  await expectPage(page, 1);
  await sideDrawer(page).getByTestId("fpl-empty-search").click();
  await expectPage(page, 0);
  await expect(page.getByTestId("search-airports")).toBeFocused();
});

test("a route made goes to FPL; cleared, the page stays", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  await expectPage(page, 0);
  // Open Sample Flight, FPL's own: a route made.
  await bar(page, 1).click();
  await sideDrawer(page).getByTestId("fpl-empty-sample").click();
  await expectPage(page, 1);
  // A route in the address (a link) opens on FPL too.
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await expectPage(page, 1);
  // The figures at the foot are FPL's alone.
  await expect(page.getByTestId("panel-foot")).toBeVisible();
  await bar(page, 0).click();
  await expectPage(page, 0);
  await expect(page.getByTestId("panel-foot")).toBeHidden();
});

test("a drag up or down still sizes the sheet on either page", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "the phone's sheet");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await grabberTo(page, "half");
  for (const at of [1, 0] as const) {
    await bar(page, at).click();
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
    await expect(sideDrawer(page)).toHaveAttribute("data-panel", "peek");
    await settled(sideDrawer(page));
    await expectPage(page, at);
    await grabberTo(page, "half");
  }
});

test("a sideways drag on the Nearest row scrolls the row and leaves the page on Search", async ({ page }) => {
  // The owner, 2026-11-11: "I am not able to scroll the nearest because it
  // swipes to the fpl" (SheetPager's pagersDrag).
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 43.98, longitude: -88.56 });
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  await expectPage(page, 0);
  const row = sideDrawer(page)
    .getByTestId("pill-section-nearest")
    .locator("*")
    .filter({ has: page.locator("button") })
    .first();
  await expect(row).toBeVisible();
  const box = (await row.boundingBox())!;
  const scrolled = () =>
    row.evaluate((el) => {
      for (let e: Element | null = el; e; e = e.parentElement) if (e.scrollLeft > 0) return e.scrollLeft;
      return 0;
    });
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await expectPage(page, 0);
  await expect.poll(scrolled).toBeGreaterThanOrEqual(0);
});
