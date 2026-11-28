import { test, expect } from "@playwright/test";
import {
  openRoute,
  cardClose,
  closeCard,
  firstRow,
  grabberTo,
  openMapSettings,
  openTab,
  panelTabs,
  settle,
  settled,
  sideDrawer,
  slow,
  tapTheChart,
} from "./helpers";
import { tapMark } from "./marks";
import { expectDrawnOnce, installFrameRecorder } from "./drawnOnce";
import { extrasOn } from "./extras";

/**
 * On a phone, what a control opens (ResponsivePopover) and what a tap on
 * the chart opens (openCard) is a card in the map's one sheet, as Maps
 * opens everything in its sheet, at the owner's ask ("Yes to all, let's
 * have consistency and common code", 2026-10-27): not a sheet floating
 * over it, nor a popup over the chart (SheetCard). The card is its own
 * nested drawer with its own snap point, half way at the least, the panel
 * under it left where it was (the owner, 2026-11-11: "Just let the drawer
 * do what it does"); its close, Escape and a device's Back put it away,
 * back to what was under it. Each opens and closes drawn once (drawnOnce):
 * no drawer drawn anew, the map's buttons never off the screen.
 */
test.beforeEach(({ page }) => installFrameRecorder(page));
// The parked features it exercises, on (Settings' Extras, src/lib/extras).
test.beforeEach(({ page }) => extrasOn(page, "atcCopilot"));

test("the Map settings open as a card in the map's sheet, and its close goes back to what was under it", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 660, "a phone's sheet and its heights; the side panel's card is in layout.spec");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const panel = sideDrawer(page);
  await settled(panel);
  await expect(panel).toHaveAttribute("data-panel", "peek");
  // The plan in, its time on the pill, before the card's opening is
  // measured: opened over the pill while the plan was still coming, the
  // pill's estimated figures were taken off under the card, a layout
  // shift of 0.017 that was the plan's late landing, not the card's (CI's
  // mobile, run 45127491141; the nav log held 3.5 s here gives the same
  // 0.017 from the same three boxes).
  // (Its first leg's course, Crs, where the estimate's Trk had none.)
  await expect(page.locator("[data-foot-strip]").first().locator("dt").last()).toContainText("Crs", { timeout: slow(30_000) });

  // From the pill: the card half way up over it, the panel left at the pill.
  await expectDrawnOnce(page, () => openMapSettings(page), { card: "map-settings", maxMoves: 0 });
  const card = panel.getByRole("region", { name: "Map", exact: true });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-testid", "map-settings");
  await expect(card).toHaveAttribute("data-panel", "half");
  await expect(panel).toHaveAttribute("data-panel", "peek");
  // Nothing floating over the panel, and nothing made modal: the one
  // dialog the sheet itself, the stock Drawer's non-modal popup (MapPanel),
  // not the card in it, which is a region.
  await expect(page.locator("[data-slot=sheet-content]")).toHaveCount(0);
  await expect(page.locator('[role="dialog"]:not([data-slot="map-panel"]), [aria-modal="true"]')).toHaveCount(0);
  // Its name where a screen reader starts reading it.
  await expect(card.getByRole("heading", { name: "Map", level: 2 })).toBeFocused();
  // Its name and close in its own head, the top of the sheet: the one
  // search put away under a card, as Apple Maps' is (the owner, 2026-11-10);
  // the panel still at the pill as it closes.
  await expect(card.getByRole("heading", { name: "Map", level: 2 })).toBeVisible();
  await expect(firstRow(page)).toBeHidden();
  await expect(panelTabs(page)).toHaveCount(0);
  await expectDrawnOnce(page, () => closeCard(page, "sheet-card-close").then(() => expect(card).toHaveCount(0)), { maxMoves: 0 });
  await expect(panel).toHaveAttribute("data-panel", "peek");

  // From half, over the route's line: the line out of sight under it, and
  // there again as Escape puts it away, the panel still half way and the
  // focus back on the map's button.
  await grabberTo(page, "half");
  const dest = panel.getByTestId("route-summary");
  await expect(dest).toBeVisible();
  await openMapSettings(page);
  await expect(card).toBeVisible();
  await expect(dest).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(panel).toHaveAttribute("data-panel", "half");
  await expect(dest).toBeVisible();
  await expect(page.locator("[data-map-controls]").getByTestId("map-settings-button")).toBeFocused();
});

// The owner, 2026-11-11, on the live stack in WebKit: the Map button's
// card opened and closed at once, aria-expanded true and then false. The
// map's buttons ride the front sheet's top, a card's once one is open
// (OnSheetTop), and moved there they were drawn afresh, the button's own
// open state with them; the Map card's open is its own (lib/mapCard) and
// the buttons keep one container (sheetTopSlot).
test("the Map button's card stays open once tapped, and the button says so", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await settled(sideDrawer(page));
  const button = page.locator("[data-map-controls]").getByTestId("map-settings-button");
  await button.click();
  const card = page.getByTestId("map-settings");
  await expect(card).toBeVisible();
  await settled(card);
  // Still open once the sheet has settled, the buttons on the card's top.
  await settled(sideDrawer(page));
  await expect(card).toBeVisible();
  await expect(page.locator("[data-map-controls]").getByTestId("map-settings-button")).toHaveAttribute("aria-expanded", "true");
  // Tapped again, it closes.
  await page.locator("[data-map-controls]").getByTestId("map-settings-button").click();
  await expect(card).toBeHidden();
  await expect(button).toHaveAttribute("aria-expanded", "false");
});

// The owner, 2026-11-13: "put a settings button on the top left side". The
// Map card's head starts with a gear that opens the app's Settings as a
// card over it, at its Map group (option A, the same day); Settings' ✕
// goes back one level, to the Map card, which has no Map Settings now.
test("the Map card's gear opens Settings over it at Map, and Settings' close goes back to the Map card", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await settled(sideDrawer(page));
  await openMapSettings(page);
  const card = page.getByTestId("map-settings");
  await expect(card).toBeVisible();
  const gear = card.getByRole("button", { name: "Settings", exact: true });
  await expect(gear).toBeVisible();
  // At the head's start, left of the name, as a card's Share is.
  const name = card.getByRole("heading", { name: "Map", level: 2 });
  expect((await gear.boundingBox())!.x).toBeLessThan((await name.boundingBox())!.x);
  const settings = page.getByTestId("console-sheet");
  await expectDrawnOnce(page, () => gear.click().then(() => expect(settings).toBeVisible()), { card: "console-sheet", maxMoves: 0 });
  await expect(settings.getByRole("heading", { name: "Settings", level: 3 })).toBeVisible();
  // Raised all the way, its Map group in sight.
  await expect(settings.getByTestId("airport-weather-look")).toBeInViewport();
  // Clear Your Path greyed with why while nothing has been flown (UI audit C16).
  await expect(settings.getByTestId("own-trail-clear")).toBeDisabled();
  await expect(settings.getByTestId("own-trail-clear")).toContainText("None yet: it is drawn as you fly");
  // Settings' close: it closes where it is, the Map card under it the same drawer.
  await expectDrawnOnce(
    page,
    () =>
      settings
        .getByRole("button", { name: "Back to the map", exact: true })
        .click()
        .then(() => expect(settings).toHaveCount(0)),
    { maxMoves: 0 },
  );
  await expect(card).toBeVisible();
  await expect(card.getByTestId("map-settings-more")).toHaveCount(0);
});

test("the approaches' menu opens the field's whole list as a card in the sheet", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 660, "a phone's card; wider it is a popover");
  await page.route(
    (url) => /\/airport\/[^/]+\/procedures/.test(url.pathname),
    (route) => route.fulfill({ json: { airport: "KDLH", cycle: "261001", procedures: [] } }),
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const panel = sideDrawer(page);
  await openTab(page, "Nav Log");
  await expect(panel).toHaveAttribute("data-panel", "full");
  await openRoute(page);
  const arrive = panel.getByRole("region", { name: "KDLH · Arrive" });
  await arrive.locator("[data-testid=procedure-kind][data-kind=approach]").click({ timeout: slow(30000) });
  // The stock dropdown (2026-11-25), as the runway's pill opens.
  const menu = page.getByTestId("procedure-menu");
  await expect(menu).toBeVisible();
  // Its foot opens the field's whole list, a card of its own in its place.
  await page.getByTestId("procedure-menu-all").click();
  await expect(menu).toHaveCount(0);
  await expect(panel.getByRole("heading", { name: "KDLH approaches" })).toBeVisible();
  await expect(panel.getByTestId("procedures-none")).toBeVisible();
  // Closed: the route's list again, the panel all the way up as it was.
  await cardClose(page, "procedures-close").click();
  await expect(panel.getByRole("heading", { name: "KDLH approaches" })).toHaveCount(0);
  await expect(arrive).toBeVisible();
  await expect(panel).toHaveAttribute("data-panel", "full");
});

test("a checkpoint tapped on the chart opens its card in the sheet; one opened over it closes back to it", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 660, "a phone's card; wider it is the chart's popup");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const panel = sideDrawer(page);
  await settled(panel);
  // One drawn: a checkpoint whose badge would lie over a higher mark is
  // left out by MapLibre's collision until the map is closer in, and a tap
  // goes to the nearest drawn within a finger's reach (useGlSymbols).
  await tapMark(page, "route-marks", /^\d+$/);
  await expect(panel.locator("[data-sheet-card]")).toBeVisible();
  // Its name in its own head beside its close, which names the card.
  const head = panel.locator("[data-sheet-card]");
  await expect(head).toContainText("nm along");
  const name = head.getByRole("heading", { level: 2 });
  await expect(name).toBeVisible();
  const named = (await name.innerText()).trim();
  const checkpoint = panel.getByRole("region", { name: named, exact: true });
  await expect(checkpoint).toBeVisible();
  await expect(head).not.toHaveAttribute("data-panel", "peek");
  // Not a popup over the chart.
  await expect(page.locator(".maplibregl-popup:visible")).toHaveCount(0);
  // Its ring on the map is drawn by MapLibre now (PickedGl's picked-ring
  // layers), not an SVG path a locator can count, so it
  // is left to the map's own tests.

  // The Map settings over it: its card on top, the checkpoint's kept
  // under it, and back to it as the top one is closed.
  await page.locator("[data-map-controls]").getByTestId("map-settings-button").click();
  const map = panel.getByRole("region", { name: "Map", exact: true });
  await expect(map).toBeVisible();
  // The cards are the stock Drawer's nested drawers (CardStack): the one
  // under stays drawn behind the top one, its top showing over it as Apple
  // Maps stacks them, so what a finger finds on the Map's card is the
  // Map's, and the checkpoint's is kept under it.
  const onTop = (region: typeof map) =>
    region.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, Math.min(r.top + 40, innerHeight - 4));
      return !!hit && el.contains(hit);
    });
  await expect.poll(() => onTop(map)).toBe(true);
  await expect(checkpoint).toHaveCount(1);
  // The Map's own close: the checkpoint's card under it keeps its head, and
  // its close, drawn too.
  await map.getByTestId("sheet-card-close").click();
  await expect(map).toHaveCount(0);
  await expect(checkpoint).toBeVisible();

  // A tap on the chart puts it away, as it did the popup.
  await tapTheChart(page);
  await expect(checkpoint).toHaveCount(0);
});

// The owner's iPhone, 2026-11-12: KSJT's card all the way up and a NOTAM's
// card over it at half, the map's buttons drawn over the airport card's
// NOTAM rows at the NOTAM card's top. They follow the card that covers the
// map most (coverCard), not the last one opened: all the way up they give
// way, as Apple Maps' do at its large detent; with the card under at half
// and the one on top lowered to its pill, they ride the card under.
