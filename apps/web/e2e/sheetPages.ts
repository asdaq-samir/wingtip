import { expect, type Page } from "@playwright/test";
import { airportMarks, searchAirports, sideDrawer, slow } from "./helpers";

/**
 * The sheet's two pages, Search and FPL, picked from the tab bar under the
 * sheet (SheetTabBar), for the specs that read which is up: sheet-tab-bar,
 * sheet-pages-cards and sheet-fly-here.
 */

const pages = (page: Page) => sideDrawer(page).getByTestId("sheet-pages");
/** A page's tab in the tab bar: 0 Search, 1 FPL. */
export const tab = (page: Page, at: 0 | 1) => page.locator(`[data-page-tab="${at}"]`);

/** The page `at` up: its tab picked. The bar stays under a card too. */
export async function expectPage(page: Page, at: 0 | 1) {
  await expect(pages(page)).toHaveAttribute("data-page", String(at));
  await expect(tab(page, at)).toHaveAttribute("aria-selected", "true");
  await expect(tab(page, at === 0 ? 1 : 0)).toHaveAttribute("aria-selected", "false");
}

/** The page `at` is the one in sight and live: its panel shown, the
 *  other's kept away, and its body not inert. */
export async function expectShown(page: Page, at: 0 | 1) {
  await expectPage(page, at);
  const shown = pages(page).locator(`[data-sheet-page="${at}"]`);
  await expect(shown).not.toHaveAttribute("data-hidden");
  await expect(pages(page).locator(`[data-sheet-page="${at === 0 ? 1 : 0}"]`)).toHaveAttribute("data-hidden");
  await expect(shown.locator("[data-panel-body]")).not.toHaveAttribute("inert");
}

/** An airport typed into the one search and its card opened, by a
 *  finger's tap (`touch`) or a click. */
export async function openAirport(page: Page, ident: string, touch = false) {
  const search = page.getByTestId("search-airports");
  if (touch) await search.tap();
  else await search.click();
  await search.fill(ident);
  // Its title: the top hit's middle is its quick actions (Fly Here, Depart
  // From) under the title, and a tap there flew the route with no card.
  const row = searchAirports(page).filter({ hasText: ident }).first().locator(".font-mono").first();
  if (touch) await row.tap({ timeout: slow(10_000) });
  else await row.click({ timeout: slow(10_000) });
  await expect(sideDrawer(page).getByTestId("place-card").getByTestId("place-name").last()).toHaveText(ident, { timeout: slow(10_000) });
}

/** The airport `ident` drawn on the chart tapped by a finger where
 *  nothing covers it (the sheet, a control, a marker), until its card
 *  opens: the map moves as it settles, so measured and tapped again. */
export async function tapAirportOnMap(page: Page, ident: string) {
  await expect(async () => {
    const mark = (await airportMarks(page)).find((m) => m.ident === ident);
    expect(mark, `${ident} drawn`).toBeDefined();
    const clear = await page.evaluate(
      ({ x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return (
          !!hit?.closest(".maplibregl-map") &&
          !hit.closest(".maplibregl-marker, .maplibregl-ctrl, [data-slot=map-panel], [data-map-controls]")
        );
      },
      { x: mark!.x, y: mark!.y },
    );
    expect(clear, `${ident} on the chart with nothing over it`).toBe(true);
    await page.touchscreen.tap(mark!.x, mark!.y);
    await expect(page).toHaveURL(new RegExp(`[?&]place=${ident}`), { timeout: 2000 });
  }).toPass({ timeout: slow(20_000) });
}
