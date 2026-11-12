import { expect, type Page } from "@playwright/test";
import { airportMarks, searchAirports, sideDrawer, slow } from "./helpers";

/**
 * The sheet's two pages, Search and FPL (SheetPager), for the specs that
 * read which is up: sheet-pages and sheet-fly-here.
 */

export const pager = (page: Page) => sideDrawer(page).getByTestId("sheet-pager");
/** A page's bar of the split grabber (SheetGrabber), outside the sheet's
 *  scroller: the Drawer's popup holds it. */
export const bar = (page: Page, at: 0 | 1) => page.locator(`[data-page-bar="${at}"]`);

export async function expectPage(page: Page, at: 0 | 1) {
  await expect(pager(page)).toHaveAttribute("data-page", String(at));
  await expect(bar(page, at)).toHaveAttribute("aria-selected", "true");
  await expect(bar(page, at === 0 ? 1 : 0)).toHaveAttribute("aria-selected", "false");
}

/** The page `at` is the one in sight and live: its slide where the pager
 *  is, and its body not inert -- the app's page and Embla's in step (the
 *  sheet audit, 2026-11-12: a card's coming and going built Embla again on
 *  its first page, the page in sight inert and nothing on it tappable). */
export async function expectShown(page: Page, at: 0 | 1) {
  await expectPage(page, at);
  const slide = pager(page).locator(`[data-sheet-page="${at}"]`);
  await expect(async () => {
    const [box, of] = [(await slide.boundingBox())!, (await pager(page).boundingBox())!];
    expect(Math.abs(box.x - of.x), "the page up is the page in sight").toBeLessThan(2);
  }).toPass();
  await expect(slide.locator("[data-panel-body]")).not.toHaveAttribute("inert");
}

/** An airport typed into the one search and its card opened, by a
 *  finger's tap (`touch`) or a click. */
export async function openAirport(page: Page, ident: string, touch = false) {
  const search = page.getByTestId("search-airports");
  if (touch) await search.tap();
  else await search.click();
  await search.fill(ident);
  const row = searchAirports(page).filter({ hasText: ident }).first();
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
