import { test, expect, type Page } from "@playwright/test";
import { showPage } from "./oneSearch";
import {
  closeCard,
  closeProfile,
  frontSheet,
  grabberTo,
  mapStill,
  navLogSheet,
  openNavLog,
  openProfile,
  searchAirports,
  settle,
  settled,
  sheetUpToType,
  showTabs,
  sideDrawer,
  slow,
} from "./helpers";
import { expectDrawnOnce, installFrameRecorder } from "./drawnOnce";

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
 * owner, 2026-11-14), and since 2026-11-26 every card but Emergency does:
 * closed so from half, brought to half from all the way up (the card
 * rule's 10).
 */
test.use({ hasTouch: true, geolocation: { latitude: 42.3246, longitude: -88.0741 }, permissions: ["geolocation"] });

// Every frame of each card's opening and closing, read as the pilot sees it (drawnOnce).
test.beforeEach(({ page }) => installFrameRecorder(page));

const youCard = (page: Page) => page.locator("[data-sheet-card]").filter({ has: page.getByTestId("console-sheet") });

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
  // Up as the act began, then down for good, the map fitted to the route once.
  await expectDrawnOnce(
    page,
    async () => {
      await card.getByTestId("fly-here").tap();
      await expect(page).toHaveURL(/[?&]dest=KUGN/, { timeout: 15_000 });
      // The route arrives whole, so folded to its one line, which names the
      // destination; opening it for the pills would move the sheet.
      await expect(page.getByTestId("route-summary")).toContainText("KUGN");
      await expect(card).toHaveCount(0);
    },
    // A second and a half for anything that would bring it back: the
    // route's nav log, its fields' answers, the address written.
    { card: "place-card", maxMoves: 1 },
  );
  await expect(card).toHaveCount(0);
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
    await expectDrawnOnce(
      page,
      async () => {
        await page.getByTestId("account-button").tap();
        await expect(youCard(page)).toHaveAttribute("data-panel", "half");
        await expect(page.getByTestId("console-sheet").getByTestId("you-name")).toBeVisible();
      },
      { card: "console-sheet", maxMoves: 1 },
    );
    await expect(youCard(page)).toHaveAttribute("data-panel", "half");
  });
}

test("You opened again opens at half, not at the size it was put away at", async ({ page }) => {
  // From 1180 wide on a touch screen (size.inspector; the desktop project's
  // 1280 with this file's finger), You opens in the inspector at the map's
  // right, the column's height with no grabber and no size to put it away
  // at (decision 0058, the owner's "Yes do it all for iPad", 2026-11-21).
  test.skip(page.viewportSize()!.width >= 1180, "a wide iPad's inspector holds its card at one size");
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
  // A phone's sheet: on the desktop project, and from 660 wide (size.regular), the cards
  // ride the side panel, which keeps one height and does not swipe
  // (CardStack's data-base-ui-swipe-ignore off a phone; rules.md's Detents,
  // 92e217114), so there is no half to drag to.
  test.beforeEach(({ page }, info) => {
    test.skip(
      info.project.name === "desktop" || page.viewportSize()!.width >= 660,
      "a phone's detents; the owner, 2026-11-19, desktop cards keep one height",
    );
  });
  test("a swipe down from half closes You and an airport's card alike", async ({ page }) => {
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
    await expect(card).toHaveCount(0);
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
/** Another field in sight on the chart, opened as a tap on its symbol
 *  opens it: by the chart's list of its marks (MapMarksList), the same
 *  select, which needs no WebGL to find where it is drawn. */
async function otherField(page: Page, not: string) {
  // The chart at rest first, as a pilot picks a field they can see: a
  // place opened by its link comes up while the map is still flying there
  // from where it opened, and a row read on the way was another by the
  // time it was focused (KEED read over Kansas, KLWC focused at Waukegan).
  await mapStill(page);
  const marks = page.getByRole("navigation", { name: "Airports on the map" }).getByRole("button");
  const field = marks.filter({ hasNotText: new RegExp(`^${not},`) }).first();
  await expect(field).toBeAttached({ timeout: slow(30_000) });
  const ident = (await field.textContent())!.split(",")[0]!;
  return {
    ident,
    tap: async () => {
      await field.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(new RegExp(`[?&]place=${ident}(&|$)`));
    },
  };
}

test("a field tapped on the chart over another's card comes up at half from its first frame", async ({ page }) => {
  await page.goto("/app/plan?place=KUGN");
  await settle(page);
  const name = page.getByTestId("place-card").getByTestId("place-name");
  await expect(name.last()).toHaveText("KUGN");
  const first = page.locator("[data-sheet-card]").filter({ has: page.getByTestId("place-card") });
  await expect(first).toHaveAttribute("data-panel", "half");
  await settled(first);
  const other = await otherField(page, "KUGN");
  // One drawer for the new card, at half from its first frame, never all
  // the way up for one; the map's buttons on its top, never off the screen.
  await expectDrawnOnce(
    page,
    async () => {
      await other.tap();
      await expect(name.last()).toHaveText(other.ident);
    },
    { card: "place-card", maxMoves: 1 },
  );
});

/**
 * A field tapped on the chart with You open over the sheet: the field's
 * card comes up over You's, drawn once, and You's drawer is not drawn
 * anew under it (the flicker audit's you-to-airport-map, FL-2: the map's
 * buttons thrown off the screen's top as You's drawer was drawn again).
 */
test("a field tapped on the chart with You open comes up once over it", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await showPage(page, 0);
  await grabberTo(page, "half");
  await page.getByTestId("account-button").tap();
  await expect(youCard(page)).toHaveAttribute("data-panel", "half");
  await settled(youCard(page));
  const other = await otherField(page, "-");
  await expectDrawnOnce(
    page,
    async () => {
      await other.tap();
      await expect(page.getByTestId("place-card").getByTestId("place-name").last()).toHaveText(other.ident);
    },
    { card: "place-card", maxMoves: 1 },
  );
});

// The flicker audit, 2026-11-14, FL-2: a card kept between its openings
// (You, the Nav Log, the Profile) was drawn anew closed as it was put away,
// gone with no close, and the map's buttons were thrown off the screen's top
// and swept down to the sheet. Now it closes where it is, its own drawer.
test("a kept card closes where it is, the map's buttons never off the screen", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 660, "a phone's cards");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await settled(sideDrawer(page));
  await showPage(page, 0);
  await page.getByTestId("account-button").click();
  await settled(page.locator("[data-sheet-card]").filter({ has: page.getByTestId("console-sheet") }));
  const you = page.getByTestId("console-sheet");
  await expectDrawnOnce(page, () => closeCard(page, "console-close").then(() => expect(you).toHaveCount(0)), { maxMoves: 0 });
  // Back on FPL, the sheet's second page, whose Nav Log and Profile these
  // are: You was opened over the search's page.
  await showPage(page, 1);
  await openNavLog(page);
  await settled(page.locator("[data-sheet-card]").filter({ has: navLogSheet(page) }));
  await expectDrawnOnce(page, () => closeCard(page, "navlog-close").then(() => expect(navLogSheet(page)).toBeHidden()), { maxMoves: 0 });
  await openProfile(page);
  await settled(page.locator("[data-sheet-card]").filter({ has: page.getByTestId("profile-card") }));
  await expectDrawnOnce(page, () => closeProfile(page), { maxMoves: 0 });
});
