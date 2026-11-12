import { test, expect } from "@playwright/test";
import {
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

/**
 * On a phone, what a control opens (ResponsivePopover) and what a tap on
 * the chart opens (MapPopup) is a card in the map's one sheet, as Maps
 * opens everything in its sheet, at the owner's ask ("Yes to all, let's
 * have consistency and common code", 2026-10-27): not a sheet floating
 * over it, nor a popup over the chart (SheetCard). The card is its own
 * nested drawer with its own snap point, half way at the least, the panel
 * under it left where it was (the owner, 2026-11-11: "Just let the drawer
 * do what it does"); its close, Escape and a device's Back put it away,
 * back to what was under it.
 */

test("the Map settings open as a card in the map's sheet, and its close goes back to what was under it", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "a phone's sheet and its heights; the side panel's card is in layout.spec");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const panel = sideDrawer(page);
  await settled(panel);
  await expect(panel).toHaveAttribute("data-panel", "peek");

  // From the pill: the card half way up over it, the panel left at the pill.
  await openMapSettings(page);
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
  await closeCard(page, "sheet-card-close");
  await expect(card).toHaveCount(0);
  await expect(panel).toHaveAttribute("data-panel", "peek");

  // From half, over the route's box: the box out of sight under it, and
  // there again as Escape puts it away, the panel still half way and the
  // focus back on the map's button.
  await grabberTo(page, "half");
  const dest = panel.getByTestId("route-dest");
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

test("the approaches' pull-down is a card in the sheet, and the list it opens takes its place there", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "a phone's card; wider it is a popover");
  await page.route(
    (url) => /\/airport\/[^/]+\/procedures/.test(url.pathname),
    (route) => route.fulfill({ json: { airport: "KDLH", cycle: "261001", procedures: [] } }),
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const panel = sideDrawer(page);
  await openTab(page, "Nav Log");
  await expect(panel).toHaveAttribute("data-panel", "full");
  const arrive = panel.getByRole("region", { name: "KDLH · Arrive" });
  await arrive.locator("[data-testid=procedure-kind][data-kind=approach]").click({ timeout: slow(30000) });
  const menu = panel.getByTestId("procedure-menu");
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute("data-sheet-card", "");
  // The route's list under it, kept out of sight.
  await expect(arrive).toBeHidden();
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
  test.skip(page.viewportSize()!.width >= 768, "a phone's card; wider it is the chart's popup");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const panel = sideDrawer(page);
  await settled(panel);
  // One in sight: a checkpoint whose badge would lie over a higher mark is
  // left out until the map is closer in (lib/map/gl/declutter), and the
  // first in the page was one of those on the fitted route.
  const marker = page.locator(".maplibregl-marker", { hasText: /^\d+$/ }).filter({ visible: true }).first();
  await expect(marker).toBeVisible({ timeout: slow(60000) });
  // Its own click, not one at its place: neighbouring checkpoints stack
  // on a phone's fitted route (map.spec).
  await marker.dispatchEvent("click");
  await expect(panel.locator("[data-sheet-card]")).toBeVisible();
  // Its name in its own head beside its close, which names the card.
  const head = panel.locator("[data-sheet-card]");
  await expect(head).toContainText("nm along");
  const name = head.getByRole("heading", { level: 2 });
  await expect(name).toBeVisible();
  const checkpoint = panel.getByRole("region", { name: (await name.innerText()).trim(), exact: true });
  await expect(checkpoint).toBeVisible();
  await expect(head).not.toHaveAttribute("data-panel", "peek");
  // Not a popup over the chart.
  await expect(page.locator(".maplibregl-popup:visible")).toHaveCount(0);
  // Its ring on the map is drawn by MapLibre now (PickedGl's picked-ring
  // layers), not an SVG path a locator can count as Leaflet's was, so it
  // is left to the map's own tests.

  // The Map settings over it: its card on top, the checkpoint's kept
  // under it, and back to it as the top one is closed.
  await page.locator("[data-map-controls]").getByTestId("map-settings-button").click();
  const map = panel.getByRole("region", { name: "Map", exact: true });
  await expect(map).toBeVisible();
  await expect(checkpoint).toBeHidden();
  await closeCard(page, "sheet-card-close");
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
test("a card opened over a higher one leaves the map's buttons with the higher", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "a phone's cards and their heights");
  const raw = "!DLH 11/101 DLH OBST TOWER LGT (ASN 2026-AGL-1) 465000N0921200W (1.2NM SE DLH) 1600FT (210FT AGL) U/S 2611101200-2611202359";
  await page.route(
    (url) => url.pathname === "/api/planner/airport/KDLH/notams",
    (route) =>
      route.fulfill({
        json: {
          coverage_since: "2026-11-10T06:00:00Z",
          top: 1,
          unchecked: [],
          notams: [
            {
              id: "11/101",
              kind: "notam",
              closed: false,
              raw,
              rank: 1,
              score: 99,
              top: true,
              tied: false,
              in_force: true,
              starts: "2026-11-10T12:00:00Z",
              ends: "2026-11-20T23:59:00Z",
              reasons: [],
              runways: [],
              field: "KDLH",
              keyword: null,
              role: null,
              low_ft: null,
              high_ft: null,
            },
          ],
        },
      }),
  );
  await page.goto("/app/plan?place=KDLH");
  await settle(page);
  const place = sideDrawer(page).getByTestId("place-card");
  // Its drawer's popup, where the buttons ride (the card draws its own head).
  const placeDrawer = sideDrawer(page)
    .locator("[data-sheet-card]")
    .filter({ has: page.getByTestId("place-card") });
  await place.getByRole("tab", { name: "Info" }).click();
  await grabberTo(page, "full");
  const controls = page.locator("[data-map-controls]");
  const radio = page.locator("[data-map-food]");

  // All the way up, a NOTAM's card over it at half: the buttons give way.
  await place.getByTestId("place-notam").first().click();
  const notam = sideDrawer(page).getByTestId("place-notam-card");
  await expect(notam).toHaveAttribute("data-panel", "half");
  await settled(notam);
  await expect(page.locator("body")).toHaveAttribute("data-map-panel", "full");
  await expect(placeDrawer.locator("[data-map-controls]")).toHaveCount(1);
  await expect(controls).toHaveCSS("opacity", "0");
  await expect(radio).toHaveCSS("opacity", "0");

  // The airport's card at half, the NOTAM's over it lowered to its pill:
  // the buttons over the airport card's top, in sight.
  await notam.getByTestId("sheet-card-close").click();
  await expect(notam).toHaveCount(0);
  await grabberTo(page, "half");
  await place.getByTestId("place-notam").first().click();
  await expect(notam).toHaveAttribute("data-panel", "half");
  await settled(notam);
  await expect(notam.locator("[data-map-controls]")).toHaveCount(1);
  await grabberTo(page, "peek");
  await expect(page.locator("body")).toHaveAttribute("data-map-panel", "half");
  await expect(placeDrawer.locator("[data-map-controls]")).toHaveCount(1);
  await expect(controls).toHaveCSS("opacity", "1");
});

// The owner's iPhone, 2026-11-12: "Why are all the cards jumping like
// this?" A card opened from the chart (TFR 6/2478 over San Angelo) came in
// near the top and dropped to half, or arrived at half and shifted again;
// the map panned at each change and again as it closed; and the map's
// buttons sat over the card's lines. A card's drawer mounted already open,
// which Base UI draws where it rests from its first frame, all the way up
// before it has measured itself (CardStack). Now it rises once from the
// screen's foot to half and stays there, the chart still under it, the
// buttons out of the way until it is up and then over its top.
test("a card tapped open on the chart rises once to half, the map still and its buttons never over it", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "a phone's cards and their heights");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await settled(sideDrawer(page));
  const marker = page.locator(".maplibregl-marker", { hasText: /^\d+$/ }).filter({ visible: true }).first();
  await expect(marker).toBeVisible({ timeout: slow(60000) });
  await marker.evaluate((el) => el.setAttribute("data-tapped", ""));
  // Every frame for a second and a half from the tap, as painted: the
  // card's top, the map's buttons, and where the chart's marks are.
  const frames = await page.evaluate(
    () =>
      new Promise<{ card: number | null; buttons: number | null; shown: boolean; mark: number; other: number | null }[]>((done) => {
        const out: { card: number | null; buttons: number | null; shown: boolean; mark: number; other: number | null }[] = [];
        const tapped = document.querySelector<HTMLElement>("[data-tapped]")!;
        const other = [...document.querySelectorAll<HTMLElement>(".maplibregl-marker")].find((m) => m !== tapped);
        const start = performance.now();
        const frame = () => {
          const card = document.querySelector("[data-sheet-card][data-open]");
          const buttons = document.querySelector("[data-map-controls]");
          out.push({
            card: card ? card.getBoundingClientRect().top : null,
            buttons: buttons ? buttons.getBoundingClientRect().bottom : null,
            shown: !!buttons && getComputedStyle(buttons).opacity !== "0",
            mark: tapped.getBoundingClientRect().top,
            other: other ? other.getBoundingClientRect().top : null,
          });
          if (performance.now() - start < 1500) requestAnimationFrame(frame);
          else done(out);
        };
        tapped.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        requestAnimationFrame(frame);
      }),
  );
  const card = sideDrawer(page).locator("[data-sheet-card][data-open]");
  await expect(card).toHaveAttribute("data-panel", "half");
  const tops = frames.map((f) => f.card).filter((top): top is number => top !== null);
  const rest = tops[tops.length - 1]!;
  // It never shows higher than where it rests, and only ever rises.
  expect(Math.min(...tops)).toBeGreaterThanOrEqual(rest - 1);
  tops.slice(1).forEach((top, i) => expect(top).toBeLessThanOrEqual(tops[i]! + 1));
  // The buttons, wherever they are in sight, are over the card's top.
  for (const f of frames) if (f.shown && f.card !== null && f.buttons !== null) expect(f.buttons).toBeLessThanOrEqual(f.card + 1);
  // The chart moves at most once, one way, and only to bring the
  // checkpoint out from under the card; the mark tapped ends in sight.
  const marks = frames.map((f) => f.other).filter((y): y is number => y !== null);
  const steps = marks.slice(1).map((y, i) => Math.sign(Math.round(y - marks[i]!)));
  expect(new Set(steps.filter((s) => s !== 0)).size).toBeLessThanOrEqual(1);
  expect(frames[frames.length - 1]!.mark).toBeLessThan(rest);

  // Put away, the chart stays where it is.
  const before = await marker.evaluate((el) => el.getBoundingClientRect().top);
  await closeCard(page, "sheet-card-close");
  await expect(card).toHaveCount(0);
  await settled(sideDrawer(page));
  expect(await marker.evaluate((el) => el.getBoundingClientRect().top)).toBeCloseTo(before, 0);
});
