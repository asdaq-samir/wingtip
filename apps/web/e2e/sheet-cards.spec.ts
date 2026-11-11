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
  await expect(panel).toHaveAttribute("data-sheet-at", "peek");
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
