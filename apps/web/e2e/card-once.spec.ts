import { test, expect, type Page } from "@playwright/test";
import { showPage } from "./oneSearch";
import { frontSheet, grabberTo, searchAirports, settle, settled, sheetUpToType, showTabs, slow } from "./helpers";

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
 * owner, 2026-11-14): You and the Map card close so from half, come to
 * half from all the way up, and a content card parks at the pill (the
 * card rule's 10).
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
async function swipeDown(page: Page, by = 200) {
  const grabber = (await frontSheet(page).getByTestId("sidebar-trigger-button").first().boundingBox())!;
  const x = grabber.x + grabber.width / 2;
  await page.mouse.move(x, grabber.y + 6);
  await page.mouse.down();
  await page.mouse.move(x, grabber.y + by, { steps: 12 });
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

  // A settings card closes on a swipe down only from half: all the way up,
  // the swipe brings it to half and it stays open (the owner, 2026-11-14:
  // "Settings cards should only close from a swipe down when in medium
  // detents").
  test("a swipe down brings You from all the way up to half, open, and from half closes it", async ({ page }) => {
    await page.goto("/app/plan");
    await settle(page);
    await showPage(page, 0);
    await grabberTo(page, "half");
    await page.getByTestId("account-button").click();
    await expect(youCard(page)).toHaveAttribute("data-panel", "half");
    await grabberTo(page, "full");
    await swipeDown(page, 300);
    await expect(youCard(page)).toHaveAttribute("data-panel", "half");
    await settled(youCard(page));
    await expect(page.getByTestId("console-sheet").getByTestId("you-name")).toBeInViewport();
    await swipeDown(page);
    await expect(page.getByTestId("console-sheet")).toHaveCount(0);
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

/**
 * A field tapped on the chart over another field's card: the new card is
 * at half from the first frame it is drawn in, never all the way up for a
 * frame first. The owner's iPhone, 2026-11-14, KVWU tapped over 43Y's card
 * ("The app flashes sometimes"): one frame of KVWU's card all the way up,
 * its photos still grey, then at half. The card under it, put away, gave
 * the new one its place in the nested drawers (CardStack), so React drew
 * the new one's drawer afresh, already open, where Base UI draws it all
 * the way up until it has measured itself.
 */
test("a field tapped on the chart over another's card comes up at half from its first frame", async ({ page }) => {
  await page.goto("/app/plan?place=KUGN");
  await settle(page);
  const name = page.getByTestId("place-card").getByTestId("place-name");
  await expect(name.last()).toHaveText("KUGN");
  const first = page.locator("[data-sheet-card]").filter({ has: page.getByTestId("place-card") });
  await expect(first).toHaveAttribute("data-panel", "half");
  await settled(first);
  const half = (await first.boundingBox())!.y;
  // From the tap, the top of each field's card drawn and up: every frame,
  // and every change to the page before one is painted (WebKit's headless
  // frames are few).
  await page.evaluate(() => {
    const tops: { ident: string; top: number }[] = [];
    (window as unknown as { cardTops: typeof tops }).cardTops = tops;
    const look = () => {
      for (const popup of document.querySelectorAll("[data-sheet-card][data-open]")) {
        const ident = popup.querySelector('[data-testid="place-name"]')?.textContent;
        if (!ident || popup.hasAttribute("data-ending-style")) continue;
        if (getComputedStyle(popup).visibility === "hidden") continue;
        tops.push({ ident, top: popup.getBoundingClientRect().top });
      }
    };
    const frame = () => {
      look();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    new MutationObserver(look).observe(document.body, { subtree: true, childList: true, attributes: true });
  });
  // Another field in sight on the chart, opened as a tap on its symbol
  // opens it: by the chart's list of its marks (MapMarksList), the same
  // select, which needs no WebGL to find where it is drawn.
  const marks = page.getByRole("navigation", { name: "Airports on the map" }).getByRole("button");
  const field = marks.filter({ hasNotText: /^KUGN,/ }).first();
  await expect(field).toBeAttached({ timeout: slow(30_000) });
  const other = (await field.textContent())!.split(",")[0]!;
  await field.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`[?&]place=${other}(&|$)`));
  await expect(name.last()).toHaveText(other);
  await page.waitForTimeout(1500);
  const tops = await page.evaluate(() => (window as unknown as { cardTops: { ident: string; top: number }[] }).cardTops);
  const drawn = tops.filter((t) => t.ident === other).map((t) => Math.round(t.top));
  expect(drawn.length).toBeGreaterThan(0);
  // Never higher than half, from its first frame to its last.
  expect(Math.min(...drawn), `${other}'s card's top, frame by frame: ${drawn.join(" ")}`).toBeGreaterThanOrEqual(Math.round(half) - 2);
});
