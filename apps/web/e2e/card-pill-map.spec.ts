import { test, expect, type Page } from "@playwright/test";
import { frontSheet, grabberTo, settle, settled, sideDrawer } from "./helpers";
import { airportToTap, card, withPrivateFields } from "./placeCard";
import { showPlan } from "./oneSearch";

/**
 * A card at the pill leaves the map the map's, as Apple Maps' place card
 * at its smallest size does: nothing of the sheet under it is drawn, and
 * the map's buttons sit on the card's top. The owner's iPhone (2026-11-20):
 * with a route on FPL, C81's card lowered to the pill had a plain grey slab
 * over the lower half of the map, the sheet's empty ground at half, the
 * map's buttons over it. A picture opened full screen from the card and
 * closed had told the sheet that nothing was open over it any more (Base
 * UI's nested dialogs, set not added), so the sheet's ground came back
 * under the card (SheetDrawer, CardDialogs).
 */

/** The sheet under the cards, and what is drawn of it. */
const sheetUnder = (page: Page) =>
  page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>("[data-slot=map-panel]")!;
    return { nested: sheet.hasAttribute("data-nested-drawer-open"), ground: getComputedStyle(sheet).backgroundColor };
  });

test("a card lowered to the pill after a picture was opened from it leaves the map in sight down to the card", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 660, "a phone's sheet");
  await withPrivateFields(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await showPlan(page);
  await grabberTo(page, "half");
  const at = await airportToTap(page);
  await page.mouse.click(at.x, at.y);
  await expect(card(page).getByTestId("place-name")).not.toBeEmpty();
  await settled(frontSheet(page));
  expect(await sheetUnder(page)).toMatchObject({ nested: true, ground: "rgba(0, 0, 0, 0)" });

  // Its diagram (or the sketch drawn in its place) full screen, and closed.
  await card(page).getByTestId("place-diagram-open").or(card(page).getByTestId("place-aerial-open")).first().click();
  const close = page.getByTestId(/^airport-(diagram|sketch)-close$/);
  await expect(close).toBeVisible();
  await close.click();
  await expect(close).toHaveCount(0);
  // The card is still up, and the sheet under it still gives way to it.
  await expect(card(page).getByTestId("place-name")).toBeVisible();
  await expect.poll(() => sheetUnder(page)).toMatchObject({ nested: true, ground: "rgba(0, 0, 0, 0)" });

  // Down to the pill: the sheet under it, still at half, draws nothing,
  // so the map is in sight from the screen's top to the card's.
  await grabberTo(page, "peek");
  expect(await sideDrawer(page).getAttribute("data-panel")).toBe("half");
  expect(await sheetUnder(page)).toMatchObject({ nested: true, ground: "rgba(0, 0, 0, 0)" });
  const cardTop = (await frontSheet(page).boundingBox())!.y;
  const controls = (await page.locator("[data-map-controls]").boundingBox())!;
  // The map's buttons on the card's top, not stranded higher up.
  expect(cardTop - (controls.y + controls.height)).toBeGreaterThanOrEqual(0);
  expect(cardTop - (controls.y + controls.height)).toBeLessThan(40);
  // What the sheet's popup holds there is out of sight: its body and grabber given way.
  const shown = await page.evaluate((top) => {
    const sheet = document.querySelector("[data-slot=map-panel]")!;
    return [...sheet.querySelectorAll<HTMLElement>(":scope > div")]
      .filter((el) => !el.querySelector("[data-sheet-card]") && !el.hasAttribute("data-sheet-top"))
      .filter((el) => el.getBoundingClientRect().top < top && getComputedStyle(el).visibility !== "hidden" && el.offsetHeight > 0)
      .map((el) => el.className.slice(0, 60));
  }, cardTop);
  expect(shown, "the sheet's own parts drawn over the map above the card").toEqual([]);
});
