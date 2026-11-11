import { test, expect, type Page } from "@playwright/test";
import { grabberTo, settle, settled, sideDrawer } from "./helpers";

/**
 * The sheet's two pages, Search and FPL (the owner, 2026-11-11;
 * docs/design/rules.md §4a): a sideways swipe moves a page and never the
 * sheet, the dots under the grabber follow and take a tap, with no route
 * FPL says "Plan a flight" and its Search lands on the focused field, a
 * route made goes to FPL, and a drag up or down still sizes the sheet on
 * either page.
 */

const pager = (page: Page) => sideDrawer(page).getByTestId("sheet-pager");
const dot = (page: Page, at: 0 | 1) => sideDrawer(page).getByTestId(`sheet-page-dot-${at}`);

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
  await expect(dot(page, at)).toHaveAttribute("aria-selected", "true");
  await expect(dot(page, at === 0 ? 1 : 0)).toHaveAttribute("aria-selected", "false");
}

test("Search to FPL and back, by a swipe and by the dots, the sheet's size kept", { tag: "@smoke" }, async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  // With no route the sheet opens on Search.
  await expectPage(page, 0);
  await expect(dot(page, 0)).toHaveAccessibleName("Page 1 of 2, Search");
  await expect(dot(page, 1)).toHaveAccessibleName("Page 2 of 2, FPL");

  // A swipe to FPL: the page moves, the sheet stays half way.
  await swipe(page, "left");
  await expectPage(page, 1);
  await expect(sideDrawer(page)).toHaveAttribute("data-panel", "half");
  await expect(sideDrawer(page).getByText("Plan a flight")).toBeVisible();

  // And back, by the swipe and then by the dot.
  await swipe(page, "right");
  await expectPage(page, 0);
  await dot(page, 1).click();
  await expectPage(page, 1);
  await dot(page, 0).click();
  await expectPage(page, 0);
  await expect(sideDrawer(page)).toHaveAttribute("data-panel", "half");
});

test("with no route, FPL's Search lands on the search's field, focused", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  await dot(page, 1).click();
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
  await dot(page, 1).click();
  await sideDrawer(page).getByTestId("fpl-empty-sample").click();
  await expectPage(page, 1);
  // A route in the address (a link) opens on FPL too.
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await expectPage(page, 1);
  // The figures at the foot are FPL's alone.
  await expect(page.getByTestId("panel-foot")).toBeVisible();
  await dot(page, 0).click();
  await expectPage(page, 0);
  await expect(page.getByTestId("panel-foot")).toBeHidden();
});

test("a drag up or down still sizes the sheet on either page", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "the phone's sheet");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await grabberTo(page, "half");
  for (const at of [1, 0] as const) {
    await dot(page, at).click();
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
