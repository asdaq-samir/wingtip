import { test, expect, type Page } from "@playwright/test";
import { firstRow, sideDrawer, slow } from "./helpers";
import { CARDS, type CardRow, type Entry } from "./cardTable";
import { expectBack, hittable } from "./cardEntries";

/**
 * Opening and closing every card, by the one card rule (the owner,
 * 2026-11-10; card-tests-spec): for each card of cardTable and each way it
 * is opened, the same component comes, the search goes while it is open
 * (Apple Maps' card covers the search), and ✕ and Escape each close it in
 * one press -- never only lowering the sheet -- back where it came from.
 * The device's Back is the web's Escape (lib/backNavigation's
 * closeTopmost); the browser's history is not the app's, the planner
 * replacing its address at each change, so history back would leave it.
 */

const phone = (page: Page) => page.viewportSize()!.width < 768;

async function open(page: Page, row: CardRow, entry: Entry) {
  await entry.open(page);
  await expect(page.getByTestId(row.card)).toBeVisible({ timeout: slow(20_000) });
}

for (const row of CARDS) {
  test.describe(`${row.name}`, () => {
    for (const entry of row.entries) {
      test(`from ${entry.name}: the same card over the search, and its ✕ goes back`, async ({ page }) => {
        await open(page, row, entry);
        // The same component whatever the entry: one of it.
        await expect(page.getByTestId(row.card)).toHaveCount(1);
        if (!row.question) {
          if (row.not?.searchHidden) test.info().annotations.push({ type: "not", description: row.not.searchHidden });
          else await expect(firstRow(page)).toBeHidden();
        }
        // Its ✕ on screen and taking the tap.
        await expect.poll(() => hittable(page, [row.close]), { timeout: slow(10_000) }).toBe(row.close);
        await page.getByTestId(row.close).filter({ visible: true }).first().click();
        await expect(page.getByTestId(row.card)).toHaveCount(0);
        await expectBack(page, entry.back);
      });

      test(`from ${entry.name}: one Escape closes it, not only the sheet lowered`, async ({ page }) => {
        test.skip(!phone(page) && !!row.not?.desktop, row.not?.desktop ?? "");
        await open(page, row, entry);
        // Gone after one press: had the key only lowered the sheet, the card would still be there.
        await page.keyboard.press("Escape");
        await expect(page.getByTestId(row.card)).toHaveCount(0);
        await expectBack(page, entry.back);
      });
    }

    if (row.question)
      test("its Cancel (the sheet's ✕) leaves the state as it was", async ({ page }) => {
        test.skip(!phone(page), row.not?.desktop ?? "a phone's sheet");
        const entry = row.entries[0]!;
        await open(page, row, entry);
        const url = page.url();
        await page.getByTestId(row.close).click();
        await expect(page.getByTestId(row.card)).toHaveCount(0);
        expect(page.url()).toBe(url);
      });

    if (row.fullHeight)
      test("it is the one full-height card, its ✕ at the top right, the map not dimmed", async ({ page }) => {
        await open(page, row, row.entries[0]!);
        if (phone(page)) await expect(sideDrawer(page)).toHaveAttribute("data-panel", "full");
        const close = (await page.getByTestId(row.close).filter({ visible: true }).first().boundingBox())!;
        const card = (await page.getByTestId(row.card).boundingBox())!;
        expect(close.x + close.width / 2).toBeGreaterThan(card.x + card.width / 2);
        expect(close.y).toBeLessThan(card.y + 120);
        // Not modal: no dimming over the map, no dialog taking the page.
        await expect(page.locator("[data-slot=dialog-overlay], [data-slot=sheet-overlay]")).toHaveCount(0);
      });

    if (row.inside)
      test("what opens inside it goes back to it, not to the map", async ({ page }) => {
        await open(page, row, row.entries[0]!);
        await row.inside!.open(page);
        await row.inside!.back(page);
        await expect(page.getByTestId(row.card)).toBeVisible();
      });
  });
}

test(
  "the airport card from the search: opened, scrolled, closed back to the search with its query",
  { tag: "@smoke" },
  async ({ page }) => {
    const row = CARDS.find((r) => r.name === "airport")!;
    const entry = row.entries.find((e) => e.name === "search pick")!;
    await open(page, row, entry);
    await expect(firstRow(page)).toBeHidden();
    // Scrolled to its end: its name and ✕ still in sight and taking a tap (the pinned head).
    await page.getByTestId(row.card).evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await expect.poll(() => hittable(page, [`${row.close}-pinned`, row.close]), { timeout: slow(10_000) }).not.toBeNull();
    const id = (await hittable(page, [`${row.close}-pinned`, row.close]))!;
    await page.getByTestId(id).click();
    await expect(page.getByTestId(row.card)).toHaveCount(0);
    await expect(page.getByTestId("search-airports")).toHaveValue("duluth");
  },
);
