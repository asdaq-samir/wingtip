import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { openConsole, openTab, settle, settled, showTabs, slow, consolePage, mapStill } from "./helpers";
import { pickAirplane } from "./startState";
test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

/**
 * Accessibility by axe-core, beside the iOS audit's measured rules
 * (e2e/ios): WCAG 2 A and AA on the planner's main states -- the search
 * bar, a route's panel out with its sections, the console, the route in
 * every look by day, at night and in sunlight -- no serious or critical
 * violation; and the solid glass, twice the text size and the keyboard. The chart itself (Leaflet's panes and tiles) is
 * left out: its markers are named for a screen reader where they matter,
 * and its tiles are pictures of a chart.
 */

/** Every animation on the page finished (a spinner's, which never does,
 *  left out): a sheet sliding in is glass over a moving map, and its
 *  words were read against that. */
async function atRest(page: Page) {
  await settled(page.locator("body"));
  await mapStill(page);
}

async function violations(page: Page, within?: string) {
  await atRest(page);
  let axe = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude(".maplibregl-canvas-container");
  // The viewport no longer forbids zoom (#265, 2026-11-08), so
  // meta-viewport stays on. The sheet's thin grabber is exempt from
  // target-size (WCAG 2.2, not in these tags) as Apple Maps' is.
  // A sheet over the page: what is under its dimming is not what is read.
  if (within) axe = axe.include(within);
  const results = await axe.analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join(" | ")}`,
    );
}

test("the search bar, with no route", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  expect(await violations(page)).toEqual([]);
});

test("a route's panel out, each of its tabs", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH&view=briefing");
  await settle(page);
  await expect(page.getByTestId("navlog-fuel")).toBeVisible({ timeout: slow(120000) });
  for (const tab of ["Nav Log", "Weather", "Brief", "Performance"] as const) {
    await openTab(page, tab);
    await atRest(page);
    expect(await violations(page), tab).toEqual([]);
  }
});

test("the console's Guide", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await showTabs(page);
  await openConsole(page);
  await consolePage(page.getByTestId("console-sheet"), "Guide");
  // Come to rest: sliding in, its glass is over the moving map, and its
  // words were read against that.
  await page.getByTestId("console-sheet").evaluate((el) =>
    Promise.all(
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  );
  await mapStill(page);
  expect(await violations(page, '[data-testid="console-sheet"]')).toEqual([]);
});

test("the airspace over a point", async ({ page }) => {
  await page.goto("/app/plan?at=42.3172,-88.0905");
  await expect(page.getByTestId("airspace-band").first()).toBeVisible({ timeout: slow(30000) });
  expect(await violations(page, '[data-testid="airspace-card"]')).toEqual([]);
});

/** The pilot's look, night and sunlight set before the page loads, as
 *  Setup's Theme and the map's Sunlight keep them (lib/preferences, at
 *  its version 7, so no migration puts the look back). */
async function inLook(page: Page, look: { brand: "wingtip" | "cockpit" | "ink"; dark: boolean; sunlight: boolean }) {
  await page.emulateMedia({ colorScheme: look.dark ? "dark" : "light" });
  await page.addInitScript(({ brand, sunlight }) => {
    const kept = JSON.parse(localStorage.getItem("wingtip.preferences") ?? "null") ?? { state: {}, version: 7 };
    localStorage.setItem(
      "wingtip.preferences",
      JSON.stringify({ ...kept, version: 7, state: { ...kept.state, brand, chartLight: sunlight ? "on" : "off" } }),
    );
  }, look);
}

// Every look a pilot can pick, by day, at night and in sunlight: the
// tokens are held to WCAG's contrast in each (src/lib/looksContrast.test.ts),
// and here the page drawn in them, the route's panel out, is read by axe.
for (const look of [
  { brand: "wingtip", dark: false, sunlight: false },
  { brand: "wingtip", dark: true, sunlight: false },
  { brand: "wingtip", dark: false, sunlight: true },
  { brand: "wingtip", dark: true, sunlight: true },
  { brand: "cockpit", dark: false, sunlight: false },
  { brand: "cockpit", dark: true, sunlight: false },
  { brand: "ink", dark: false, sunlight: false },
  { brand: "ink", dark: true, sunlight: false },
] as const) {
  test(`a route's panel in the ${look.brand} look${look.dark ? " at night" : ""}${look.sunlight ? " in sunlight" : ""}`, async ({
    page,
  }) => {
    await inLook(page, look);
    await page.goto("/app/plan?dep=C81&dest=KDLH");
    await settle(page);
    await expect(page.getByTestId("navlog-fuel")).toBeVisible({ timeout: slow(120000) });
    await expect(page.locator("html")).toHaveAttribute("data-brand", look.brand);
    expect(await violations(page)).toEqual([]);
  });
}

test("asked for more contrast, the glass is solid", async ({ page }) => {
  // Playwright emulates prefers-contrast; Reduce Transparency is the same
  // variant (index.css's solid).
  await page.emulateMedia({ contrast: "more" });
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await expect(page.getByTestId("navlog-fuel")).toBeVisible({ timeout: slow(120000) });
  const glass = await page.locator(".liquid-glass").evaluateAll((els) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent)
      .map((el) => {
        const style = getComputedStyle(el);
        return { fill: style.backgroundColor, blur: style.backdropFilter };
      }),
  );
  expect(glass.length).toBeGreaterThan(0);
  for (const { fill, blur } of glass) {
    // Solid: no alpha under 1 in the fill, no blur behind it.
    expect(fill).not.toMatch(/\/\s*0?\.\d|rgba\([^)]*,\s*0?\.\d+\)/);
    expect(["none", ""]).toContain(blur);
  }
  expect(await violations(page)).toEqual([]);
});

test("at twice the text size the route's panel reflows: nothing sideways, the figures whole", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await expect(page.getByTestId("navlog-fuel")).toBeVisible({ timeout: slow(120000) });
  // Every rem twice the size, as a browser's text zoom or the iPhone's
  // largest Larger Text sets the root (features/shell/dynamicType).
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });
  await atRest(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // The flight's figures shrink to fit rather than cut (useFigureFit): the
  // fuel's whole figure is still in its box.
  const fuel = page.getByTestId("navlog-fuel");
  expect(await fuel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});

test("by keyboard: a visible focus ring, and the chart's airports reached and opened", async ({ page }) => {
  await page.goto("/app/plan?at=42.3172,-88.0905");
  await settle(page);
  // The first Tab lands on something, and what has focus is drawn so: an
  // outline or a ring (index.css's :focus-visible, the stock focus-visible:ring).
  await page.keyboard.press("Tab");
  const ring = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const s = getComputedStyle(el);
    return (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 1) || s.boxShadow !== "none";
  });
  expect(ring).toBe(true);
  // The airports in sight, which the canvas draws as pictures, as a list a
  // keyboard and a screen reader can use (MapMarksList), each opening its
  // card as a tap on its symbol does.
  const list = page.getByRole("navigation", { name: "Airports on the map" });
  await expect(list.getByRole("button").first()).toBeAttached({ timeout: slow(30000) });
  await list.getByRole("button").first().focus();
  await expect(list).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("place-card")).toBeVisible({ timeout: slow(30000) });
});

test("by keyboard: the map's own arrows pan it", async ({ page }) => {
  await page.goto("/app/plan?at=42.3172,-88.0905");
  await settle(page);
  await mapStill(page);
  const map = page.getByTestId("gl-map").first();
  const center = () => map.evaluate((el) => (el as HTMLElement).dataset.center);
  const before = await center();
  // MapLibre's keyboard handler, on its canvas (the skip link's landing).
  await page.locator(".maplibregl-canvas").first().focus();
  await page.keyboard.press("ArrowRight");
  await mapStill(page);
  await expect.poll(center).not.toBe(before);
});
