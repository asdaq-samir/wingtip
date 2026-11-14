import { test, expect, type Page } from "@playwright/test";
import { showPage } from "./oneSearch";
import { frontSheet, grabberTo, searchAirports, settle, settled, sheetUpToType, showTabs } from "./helpers";

/**
 * A card opens once and closes once, never put back for a moment: the
 * owner's iPhone, 2026-11-14. Fly Here on KUGN's card closed it, brought it
 * back over the route and closed it again ("it's flashed a few times"), as
 * the address's keys read the URL through React Router's adapter, whose
 * copy of the search came a transition late and put the card's `place` back
 * for a moment. And You, from the account button, showed its head alone at
 * the pill ("Flashing when I tap account button"): opened again it came
 * back at the size it was put away at, not at half as every card opens.
 * Apple Maps closes its account and settings sheets on a swipe down (the
 * owner, 2026-11-14): You and the Map card close so, a content card parks
 * at the pill (the card rule's 10).
 */
test.use({ hasTouch: true, geolocation: { latitude: 42.3246, longitude: -88.0741 }, permissions: ["geolocation"] });

const youCard = (page: Page) => page.locator("[data-sheet-card]").filter({ has: page.getByTestId("console-sheet") });

/** Every frame from now: whether the card holding `inside` is up (its
 *  drawer open, not fading), as a run of changes; another drawer put in
 *  its place counts as a new opening. */
async function watchCard(page: Page, inside: string) {
  await page.evaluate((inside) => {
    const seen: string[] = [];
    (window as unknown as { cardSeen: string[] }).cardSeen = seen;
    let last = document.querySelector(inside)?.closest("[data-sheet-card]") ?? null;
    const look = () => {
      const popup = document.querySelector(inside)?.closest("[data-sheet-card]") ?? null;
      const up = !!popup && popup.hasAttribute("data-open") && !popup.hasAttribute("data-ending-style");
      const state = !up ? "down" : popup !== last ? "anew" : "up";
      if (popup) last = popup;
      if (seen.at(-1) !== state) seen.push(state);
      requestAnimationFrame(look);
    };
    look();
  }, inside);
}

const seen = (page: Page) => page.evaluate(() => (window as unknown as { cardSeen: string[] }).cardSeen);

/** A drag down from the front card's grabber, by the pointer, as a finger
 *  swipes it, as sheet-page-toggle.spec drags the sheet. */
async function swipeDown(page: Page) {
  const grabber = (await frontSheet(page).getByTestId("sidebar-trigger-button").first().boundingBox())!;
  const x = grabber.x + grabber.width / 2;
  await page.mouse.move(x, grabber.y + 6);
  await page.mouse.down();
  await page.mouse.move(x, grabber.y + 200, { steps: 12 });
  await page.mouse.up();
}

/** The airport's card, from the one search. */
async function openKugn(page: Page) {
  await grabberTo(page, "peek");
  await showTabs(page);
  const search = page.getByTestId("search-airports");
  await search.click();
  await sheetUpToType(page);
  await search.fill("KUGN");
  await searchAirports(page).filter({ hasText: "KUGN" }).first().click();
  const card = page.getByTestId("place-card");
  await expect(card.getByTestId("fly-here")).toBeEnabled();
  await settled(frontSheet(page));
  return card;
}

test("Fly Here closes the airport's card once, to the route, and it never comes back", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  const card = await openKugn(page);
  await watchCard(page, '[data-testid="place-card"]');
  await card.getByTestId("fly-here").tap();
  await expect(page).toHaveURL(/[?&]dest=KUGN/, { timeout: 15_000 });
  await expect(page.getByTestId("route-dep")).toContainText("POS0");
  await expect(page.getByTestId("route-dest")).toContainText("KUGN");
  await expect(card).toHaveCount(0);
  // A second and a half for anything that would bring it back: the
  // route's nav log, its fields' answers, the address written.
  await page.waitForTimeout(1500);
  const runs = await seen(page);
  // Up as the watch began, then down for good.
  expect(runs).toEqual(["up", "down"]);
});

for (const [how, start] of [
  ["no route", "/app/plan"],
  ["a route", "/app/plan?dep=C81&dest=KUGN"],
] as const) {
  test(`the account button opens You once, at half with its content, with ${how}`, async ({ page }) => {
    await page.goto(start);
    await settle(page);
    // From the pill, the search's row alone, as the owner had it.
    await showPage(page, 0);
    await grabberTo(page, "peek");
    await showTabs(page);
    await watchCard(page, '[data-testid="console-sheet"]');
    await page.getByTestId("account-button").tap();
    await expect(youCard(page)).toHaveAttribute("data-panel", "half");
    await expect(page.getByTestId("console-sheet").getByTestId("you-name")).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(youCard(page)).toHaveAttribute("data-panel", "half");
    expect(await seen(page)).toEqual(["down", "anew", "up"]);
  });
}

test("You opened again opens at half, not at the size it was put away at", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await showPage(page, 0);
  await grabberTo(page, "half");
  await page.getByTestId("account-button").tap();
  await expect(youCard(page)).toHaveAttribute("data-panel", "half");
  // Lowered to the pill by its grabber, then closed by its ✕.
  await grabberTo(page, "peek");
  await page.getByTestId("console-close").click();
  await expect(page.getByTestId("console-sheet")).toHaveCount(0);
  await page.getByTestId("account-button").tap();
  await expect(youCard(page)).toHaveAttribute("data-panel", "half");
  await expect(page.getByTestId("console-sheet").getByTestId("you-name")).toBeInViewport();
});

test.describe("by a pointer's drag", () => {
  test.use({ hasTouch: false });
  test("a swipe down closes You, a settings card, and parks an airport's card at the pill", async ({ page }) => {
    await page.goto("/app/plan");
    await settle(page);
    await showPage(page, 0);
    await grabberTo(page, "half");
    await page.getByTestId("account-button").click();
    await expect(youCard(page)).toHaveAttribute("data-panel", "half");
    await settled(youCard(page));
    await swipeDown(page);
    await expect(page.getByTestId("console-sheet")).toHaveCount(0);

    const card = await openKugn(page);
    const drawer = page.locator("[data-sheet-card]").filter({ has: card });
    await expect(drawer).toHaveAttribute("data-panel", "half");
    await swipeDown(page);
    await expect(drawer).toHaveAttribute("data-panel", "peek");
    await expect(card).toHaveCount(1);
  });
});

test("the Map card's gear opens Settings on top of it, and its close goes back to the Map card", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await showPage(page, 0);
  await grabberTo(page, "half");
  // You opened and put away first, so its drawer is kept from before the
  // Map card's: the owner's case, You came up under it.
  await page.getByTestId("account-button").click();
  await expect(youCard(page)).toHaveAttribute("data-panel", "half");
  await page.getByTestId("console-close").click();
  await expect(page.getByTestId("console-sheet")).toHaveCount(0);
  await page.getByTestId("map-settings-button").click();
  const map = page.getByTestId("map-settings");
  await expect(map).toBeVisible();
  await map.getByTestId("card-settings").click();
  // Settings, in You, the front card over the Map card.
  await expect(frontSheet(page).getByTestId("console-sheet")).toBeVisible();
  await frontSheet(page).getByTestId("console-page-close").first().click();
  await expect(page.getByTestId("console-sheet")).toHaveCount(0);
  await expect(frontSheet(page)).toHaveAttribute("data-testid", "map-settings");
});
