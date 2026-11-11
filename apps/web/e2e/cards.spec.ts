import { test, expect, type Page } from "@playwright/test";
import { firstRow, grabberTo, settled, sideDrawer, slow } from "./helpers";
import { CARDS, type CardRow, type Entry } from "./cardTable";
import { expectBack, hittable, nestedOverSheet, scrollOf } from "./cardEntries";

/**
 * Opening and closing every card, by the one card rule (the owner,
 * 2026-11-10; card-tests-spec): for each card of cardTable and each way it
 * is opened, the same component comes, the search goes while it is open
 * (Apple Maps' card covers the search), and ✕ and Escape each close it in
 * one press -- never only lowering the sheet -- back where it came from.
 * On a phone each is the stock Drawer's nested drawer over the map's sheet
 * (sheet/CardStack, the owner 2026-11-11), as Apple Maps stacks its cards.
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
        test.skip(!phone(page) && !!row.not?.desktop, row.not?.desktop ?? "");
        await open(page, row, entry);
        // The same component whatever the entry: one of it.
        await expect(page.getByTestId(row.card)).toHaveCount(1);
        if (!row.question) {
          if (row.not?.searchHidden) test.info().annotations.push({ type: "not", description: row.not.searchHidden });
          else await expect(firstRow(page)).toBeHidden();
        }
        // On a phone, a nested drawer of its own over the sheet.
        if (phone(page) && !row.question) {
          if (row.not?.nested) test.info().annotations.push({ type: "not", description: row.not.nested });
          else await expect.poll(() => nestedOverSheet(page, row.card), { timeout: slow(5_000) }).toBe(true);
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

    // At the sheet's smallest size a card shows its one title row, its
    // name and ✕, in the pill's room, and nothing else of it, as Apple
    // Maps' place card does (the owner, 2026-11-11: Settings dragged down
    // to the smallest size left the sheet empty); a tap on the row raises
    // it back to half with the card as it was.
    if (!row.question && !row.fullHeight)
      test("at the pill, its title row and ✕ in the pill's room, nothing else of it", async ({ page }) => {
        test.skip(!phone(page), "a phone's sheet");
        test.skip(!!row.not?.pill, row.not?.pill ?? "");
        await open(page, row, row.entries[0]!);
        await settled(sideDrawer(page));
        await grabberTo(page, "peek");
        await settled(sideDrawer(page));
        const sheetTop = (await sideDrawer(page).boundingBox())!.y;
        await expect.poll(() => hittable(page, [row.close]), { timeout: slow(10_000) }).toBe(row.close);
        const close = (await page.getByTestId(row.close).filter({ visible: true }).first().boundingBox())!;
        expect(close.y - sheetTop, "its ✕ at the sheet's top").toBeLessThan(80);
        // Only the title row of the card is drawn: under it, nothing of the card takes a point.
        const below = await page.evaluate(
          ([y, card]) => {
            const found: string[] = [];
            for (let at = y; at < innerHeight; at += 6) {
              const hit = document.elementFromPoint(innerWidth / 3, at);
              if (hit?.closest(`[data-testid="${card}"]`) && !hit.closest("[data-sheet-head]")) found.push(`${Math.round(at)}`);
            }
            return found;
          },
          [close.y + close.height + 8, row.card] as const,
        );
        expect(below, "the card's body in sight under its title row at the pill").toEqual([]);
        // A tap on the row, beside its buttons, raises it back to half.
        const head = page.locator("[data-sheet-head]").filter({ visible: true }).first();
        const box = (await head.boundingBox())!;
        await page.mouse.click(box.x + 24, box.y + box.height - 6);
        await expect(sideDrawer(page)).toHaveAttribute("data-panel", "half");
        await expect(page.getByTestId(row.card)).toBeVisible();
      });

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
        // The sheet's box, not the card's: the card runs on under its pinned
        // head, its own top scrolled above the sheet's (the one scrolling rule).
        const sheet = (await sideDrawer(page).boundingBox())!;
        expect(close.x + close.width / 2).toBeGreaterThan(sheet.x + sheet.width / 2);
        expect(close.y).toBeLessThan(Math.max(sheet.y, 0) + 120);
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
    await scrollOf(page, row.card, "end");
    await expect.poll(() => hittable(page, [`${row.close}-pinned`, row.close]), { timeout: slow(10_000) }).not.toBeNull();
    const id = (await hittable(page, [`${row.close}-pinned`, row.close]))!;
    await page.getByTestId(id).click();
    await expect(page.getByTestId(row.card)).toHaveCount(0);
    await expect(page.getByTestId("search-airports")).toHaveValue("duluth");
  },
);
