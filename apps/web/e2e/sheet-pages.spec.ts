import { test, expect, type Page } from "@playwright/test";
import { grabberTo, searchAirports, settle, settled, sideDrawer, frontSheet, slow } from "./helpers";

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

/** The page `at` is the one in sight and live: its slide where the pager
 *  is, and its body not inert -- the app's page and Embla's in step (the
 *  sheet audit, 2026-11-12: a card's coming and going built Embla again on
 *  its first page, the page in sight inert and nothing on it tappable). */
async function expectShown(page: Page, at: 0 | 1) {
  await expectPage(page, at);
  const slide = pager(page).locator(`[data-sheet-page="${at}"]`);
  await expect(async () => {
    const [box, of] = [(await slide.boundingBox())!, (await pager(page).boundingBox())!];
    expect(Math.abs(box.x - of.x), "the page up is the page in sight").toBeLessThan(2);
  }).toPass();
  await expect(slide.locator("[data-panel-body]")).not.toHaveAttribute("inert");
}

/** An airport typed into the one search and its card opened. */
async function openAirport(page: Page, ident: string) {
  const search = page.getByTestId("search-airports");
  await search.click();
  await search.fill(ident);
  await searchAirports(page)
    .filter({ hasText: ident })
    .first()
    .click({ timeout: slow(10_000) });
  await expect(sideDrawer(page).getByTestId("place-card").getByTestId("place-name")).toHaveText(ident, { timeout: slow(10_000) });
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
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
  await expect(sideDrawer(page).getByText("Plan a flight")).toBeVisible();

  // And back, by the swipe and then by the bars.
  await swipe(page, "right");
  await expectPage(page, 0);
  await bar(page, 1).click();
  await expectPage(page, 1);
  // A tap on the other page's bar turns the page and leaves the size.
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
  await bar(page, 0).click();
  await expectPage(page, 0);
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
  // The page up's bar is the grabber: a tap sizes the sheet, the page kept.
  await bar(page, 0).click();
  await expect(frontSheet(page)).not.toHaveAttribute("data-panel", "half");
  await expectPage(page, 0);
  await grabberTo(page, "half");
  // The keyboard: Right and Left switch the pages, Up and Down size the sheet.
  await bar(page, 0).focus();
  await page.keyboard.press("ArrowRight");
  await expectPage(page, 1);
  await page.keyboard.press("ArrowLeft");
  await expectPage(page, 0);
  await page.keyboard.press("ArrowUp");
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "full");
  await expectPage(page, 0);
});

test("a swipe shows the page's name in the grabber's capsule, then it folds back into the bars", async ({ page }) => {
  // The owner, 2026-11-11: "Can the split grabber dot animate to show
  // search or fpl and then fold to the grabber dot when swiped?"
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  // Each page's own capsule, on its own side (SheetGrabber).
  const capsuleOf = (side: 0 | 1) => page.locator(`[data-testid="grabber-capsule"][data-side="${side}"]`);
  const capsule = capsuleOf(1);
  // Nothing on the first draw: only a change opens it.
  await expect(capsuleOf(0)).toHaveCSS("opacity", "0");
  await expect(capsule).toHaveCSS("opacity", "0");
  await swipe(page, "left");
  await expectPage(page, 1);
  await expect(capsule).toHaveText("FPL");
  await expect(capsule).toHaveCSS("opacity", "1");
  await expect(capsule).toHaveAttribute("data-open", "");
  await expect(capsuleOf(0)).not.toHaveAttribute("data-open");
  // On FPL's own side: it starts at the right bar, and Search's bar stays.
  const [cap, left] = [(await capsule.boundingBox())!, (await bar(page, 0).locator("span").boundingBox())!];
  expect(cap.x, "FPL's capsule starts right of Search's bar").toBeGreaterThanOrEqual(left.x + left.width);
  await expect(bar(page, 0).locator("span")).toHaveCSS("opacity", "1");
  // It never takes a tap: the bars under it keep theirs.
  await expect(capsule).toHaveCSS("pointer-events", "none");
  await expect(capsule).toHaveAttribute("aria-hidden", "true");
  // About a second later it has folded and gone, the bars back.
  await expect(capsule).toHaveCSS("opacity", "0", { timeout: 3000 });
  await expect(bar(page, 1).locator("span")).toHaveCSS("opacity", "1");
  // Back to Search: Search's own capsule, from its own bar; FPL's stays folded.
  await swipe(page, "right");
  await expect(capsuleOf(0)).toHaveText("Search");
  await expect(capsuleOf(0)).toHaveAttribute("data-open", "");
  await expect(capsule).not.toHaveAttribute("data-open");
  await expect(capsuleOf(0)).toHaveCSS("opacity", "0", { timeout: 3000 });
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

test("a route made goes to FPL; cleared, the page stays", async ({ page }) => {
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
  await bar(page, 0).click();
  await expectPage(page, 0);
  // FPL's own, they slide away with its page (SheetParts).
  await expect(page.getByTestId("panel-foot")).not.toBeInViewport();
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
    await expect(frontSheet(page)).toHaveAttribute("data-panel", "peek");
    await settled(sideDrawer(page));
    await expectPage(page, at);
    await grabberTo(page, "half");
  }
});

test("a sideways drag on the Nearest row is the row's, the page stays on Search", async ({ page }) => {
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
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await expectPage(page, 0);
});

test.describe("cards over the pages", () => {
  test.use({ geolocation: { latitude: 42.3246, longitude: -88.0741 }, permissions: ["geolocation"] });

  test("Fly Here from an airport's card lands on FPL, the page in sight and live", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/app/plan");
    await settle(page);
    await grabberTo(page, "half");
    await expectShown(page, 0);
    await openAirport(page, "KOSH");
    await sideDrawer(page).getByTestId("place-card").getByTestId("fly-here").click();
    await expect(page).toHaveURL(/[?&]dest=KOSH/, { timeout: slow(15_000) });
    await expectShown(page, 1);
    await expect(sideDrawer(page).getByTestId("route-brief")).toBeVisible({ timeout: slow(30_000) });
  });

  test("an airport's card opened on Search over a route and closed leaves Search in sight", async ({ page }) => {
    await page.goto("/app/plan?dep=C81&dest=KDLH");
    await settle(page);
    await grabberTo(page, "half");
    await bar(page, 0).click();
    await expectShown(page, 0);
    await openAirport(page, "KOSH");
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/[?&]place=/);
    await expectShown(page, 0);
  });

  test("Find Nearby's Stops open over Search and their close goes back to it", async ({ page }) => {
    // docs/design/rules.md, card rule 1: the close goes back where it came from.
    await page.goto("/app/plan");
    await settle(page);
    await grabberTo(page, "half");
    await sideDrawer(page).getByRole("button", { name: /^Fuel/ }).first().click();
    const stops = sideDrawer(page).getByTestId("stops-card");
    await expect(stops).toBeVisible({ timeout: slow(10_000) });
    await expectPage(page, 0);
    await page.getByTestId("stops-close").click();
    await expect(stops).toBeHidden();
    await expectShown(page, 0);
  });

  test("the route cleared, the empty box's Close goes back to the airport it was flown to from", async ({ page }) => {
    await page.goto("/app/plan");
    await settle(page);
    await grabberTo(page, "half");
    await openAirport(page, "KOSH");
    await sideDrawer(page).getByTestId("place-card").getByTestId("fly-here").click();
    await expect(page).toHaveURL(/[?&]dest=KOSH/, { timeout: slow(15_000) });
    await page.getByTestId("share-route").first().click();
    await page.getByTestId("route-clear").click();
    await expect(page).not.toHaveURL(/[?&]dest=/);
    await expectShown(page, 1);
    // The menu went with the route; the box's Close is where it was.
    await expect(page.getByTestId("share-route")).toHaveCount(0);
    const close = sideDrawer(page).getByTestId("route-close");
    await expect(close).toHaveAccessibleName("Close");
    await close.click();
    await expect(page).toHaveURL(/[?&]place=KOSH/);
    await expectPage(page, 0);
    await expect(sideDrawer(page).getByTestId("place-card").getByTestId("place-name")).toHaveText("KOSH");
  });
});

test("the last waypoint taken out all the way up leaves the sheet all the way up", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "the phone's sheet");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await grabberTo(page, "full");
  const line = page.getByTestId("route-line");
  if (await line.isVisible()) await line.click();
  await page.getByTestId("route-type").click();
  await page.keyboard.press("Backspace");
  await expect(page).not.toHaveURL(/[?&]dest=/);
  await page.keyboard.press("Backspace");
  await expect(page).not.toHaveURL(/[?&]dep=/);
  await expect(page).toHaveURL(/[?&]view=briefing/);
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "full");
});
