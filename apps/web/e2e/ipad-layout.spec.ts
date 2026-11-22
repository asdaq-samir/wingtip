import { test, expect, type Page } from "@playwright/test";
import { openRoute } from "./routeHelpers";
import { consoleSheet, grabberTo, openConsole, settle, showTabs, sideDrawer } from "./helpers";
import { pick, ROUTE } from "./cardEntries";

/**
 * The web app on an iPad in Safari's engine (the webkit-ipad project: an
 * iPad's touch and user agent), at every size an iPad gives it, the app's
 * primary device (the owner, 2026-11-21: "Primary app users are on iPad").
 * Each size is a measurement, not a look: which layout it takes (the
 * phone's sheet below iPadOS's regular width, design/tokens.json's
 * size.regular, the side panel from it), nothing wider than the window or
 * past its edges, the map's room starting at the panel's edge, the
 * figures at a kneeboard's size, a card in the inspector at the map's
 * right where there is room, the hardware keyboard's keys and a
 * trackpad's right click. A screenshot of each size is kept with the
 * run's results. In a wave's validation and at night.
 */

/** Each size, points: the iPads held either way, Split View's thirds and
 *  halves (iPadOS 26's own widths, about), and a Stage Manager window. */
const SIZES = [
  { name: "slide-over", width: 320, height: 1000, side: false },
  { name: "13in-third", width: 375, height: 1032, side: false },
  { name: "11in-half", width: 590, height: 834, side: false },
  { name: "13in-half", width: 683, height: 1032, side: true },
  { name: "mini-portrait", width: 744, height: 1133, side: true },
  { name: "11in-portrait", width: 834, height: 1194, side: true },
  { name: "13in-two-thirds", width: 912, height: 1032, side: true },
  { name: "stage-manager", width: 980, height: 700, side: true },
  { name: "13in-portrait", width: 1032, height: 1376, side: true },
  { name: "mini-landscape", width: 1133, height: 744, side: true },
  { name: "11in-landscape", width: 1194, height: 834, side: true },
  { name: "13in-landscape", width: 1376, height: 1032, side: true },
] as const;

/** The layout as drawn: which panel, its box, the map's room, the page's width. */
const layout = (page: Page) =>
  page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('[data-slot="map-panel"]')!;
    const room = getComputedStyle(document.getElementById("content")!);
    const r = panel.getBoundingClientRect();
    return {
      side: panel.tagName === "SECTION",
      panel: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width },
      insetLeft: parseFloat(room.getPropertyValue("--map-inset-left")) || 0,
      insetRight: parseFloat(room.getPropertyValue("--map-inset-right")) || 0,
      scrollWidth: document.documentElement.scrollWidth,
      width: innerWidth,
      height: innerHeight,
    };
  });

test("at every iPad width the panel takes the right layout, nothing is clipped or wider than the window, and the map starts at the panel's edge", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  await page.goto(ROUTE);
  await settle(page);
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await expect.poll(async () => (await layout(page)).side, { message: `${size.name}: the side panel or the sheet` }).toBe(size.side);
    // Out, so its column is what the map is beside.
    if (size.side && (await sideDrawer(page).getAttribute("data-panel")) === "peek") await grabberTo(page, "half");
    await settle(page);
    const at = await layout(page);
    expect(at.scrollWidth, `${size.name}: nothing wider than the window`).toBeLessThanOrEqual(at.width);
    expect(at.panel.left, `${size.name}: the panel inside the window's left`).toBeGreaterThanOrEqual(0);
    expect(at.panel.right, `${size.name}: the panel inside the window's right`).toBeLessThanOrEqual(at.width + 0.5);
    expect(at.panel.bottom, `${size.name}: the panel inside the window's foot`).toBeLessThanOrEqual(at.height + 0.5);
    if (size.side) {
      // The map's room begins where the panel ends (its float, 16, and its
      // drawn width): read off the pointer, a 13-inch iPad's map was fitted
      // 64 px under a 448-wide panel.
      expect(Math.abs(at.insetLeft - at.panel.right), `${size.name}: the map's room at the panel's edge`).toBeLessThanOrEqual(1);
      expect(at.width - at.panel.right, `${size.name}: room for the map beside the panel`).toBeGreaterThanOrEqual(300);
    }
    await page.screenshot({ path: testInfo.outputPath(`${size.name}-${size.width}x${size.height}.png`) });
  }
});

test("on a kneeboard the figures at the panel's foot are the flying size, 26 points", async ({ page }) => {
  for (const size of [SIZES[4], SIZES[8], SIZES[11]]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto(ROUTE);
    await settle(page);
    const value = page.getByTestId("flight-line").locator(".figure-roll").first();
    await expect(value).toBeVisible();
    expect(await value.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)), size.name).toBeGreaterThanOrEqual(26);
  }
});

test("on an iPad on its side a card opens in the inspector at the map's right, the plan stays in sight, and Escape closes it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await pick(page, "KORD", "airport");
  const inspector = page.locator('[data-slot="map-inspector"]');
  const card = inspector.locator("[data-sheet-card][data-open]");
  await expect(card).toBeVisible();
  // The side panel under it as it was: its search in sight.
  await expect(sideDrawer(page).getByTestId("search-airports")).toBeVisible();
  const box = (await inspector.boundingBox())!;
  const at = await layout(page);
  expect(box.x, "the inspector clear of the panel").toBeGreaterThan(at.panel.right);
  expect(box.x + box.width, "and inside the window").toBeLessThanOrEqual(at.width);
  // The map's room ends at the inspector, its buttons beside it.
  expect(Math.abs(at.width - at.insetRight - box.x)).toBeLessThanOrEqual(1);
  for (const button of await page.locator("[data-map-controls] button:visible").all()) {
    const b = (await button.boundingBox())!;
    expect(b.x + b.width, "a map button clear of the inspector").toBeLessThanOrEqual(box.x);
  }
  // A hardware keyboard's Escape, with the focus in the card: it closes, the room comes back.
  await card.focus();
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect.poll(async () => (await layout(page)).insetRight).toBe(0);
});

test("an iPad's hardware keyboard has the shortcuts: Alt+/ the search", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.goto("/app/plan");
  await settle(page);
  await page.locator("body").press("Alt+Slash");
  await expect(page.getByTestId("search-airports")).toBeFocused();
});

test("on an iPad the map's buttons take a finger 44 points across, and a trackpad's right click opens a route point's menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1032, height: 1376 });
  await page.goto(ROUTE);
  await settle(page);
  const buttons = await page.locator("[data-map-controls] button:visible").all();
  expect(buttons.length).toBeGreaterThan(0);
  for (const button of buttons) {
    const b = (await button.boundingBox())!;
    const name = (await button.getAttribute("aria-label")) ?? "a map button";
    // Just inside the 44-point area round the button's own box, each side
    // (the iphone-review skill's probe: the pseudo-element's area, not the box).
    const reach = Math.max(0, (44 - Math.min(b.width, b.height)) / 2 - 1);
    const cx = b.x + b.width / 2,
      cy = b.y + b.height / 2;
    for (const [x, y] of [
      [b.x - reach + 0.5, cy],
      [b.x + b.width + reach - 0.5, cy],
      [cx, b.y - reach + 0.5],
      [cx, b.y + b.height + reach - 0.5],
    ] as const) {
      const hit = await page.evaluate(
        ([px, py]) => document.elementFromPoint(px, py)?.closest("button")?.getAttribute("aria-label") ?? null,
        [x, y] as const,
      );
      expect(hit, `${name} at ${Math.round(x)},${Math.round(y)}`).toBe(name);
    }
  }
  await openRoute(page);
  await page.getByLabel(/^(\S+, )?Destination$/).click({ button: "right" });
  await expect(page.getByTestId("pill-menu-change")).toBeVisible();
});

test("a PDF dragged in from Files beside the app is added to Your Documents", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.route(
    (url) => url.pathname === "/api/planner/library",
    (route) => route.fulfill({ json: { documents: [] } }),
  );
  await page.goto("/app/plan");
  await showTabs(page);
  await openConsole(page);
  await consoleSheet(page).getByTestId("documents-row").click();
  const zone = consoleSheet(page).getByRole("button", { name: "Drop PDFs to add them to your documents" });
  // The drag as Safari hands it over from another app: a file of its type, entered, over and let go.
  const drag = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(["%PDF-1.4\n%%EOF\n"], "Club rules.pdf", { type: "application/pdf" }));
    return data;
  });
  for (const type of ["dragenter", "dragover", "drop"]) await zone.dispatchEvent(type, { dataTransfer: drag });
  await expect(consoleSheet(page).getByTestId("document-own")).toContainText("Club rules");
});
