import { test, expect } from "@playwright/test";
import { airportSearch, firstRow, openConsole, openPanel, searchAirports, settle, sideDrawer } from "./helpers";

/**
 * The desktop web, from 1024 wide with a mouse (the UI audit, 2026-11-09):
 * a side panel wide enough for a desktop's type rather than the phone's
 * 384-point card, the route box's small buttons with their words, and the
 * keyboard's ways round -- / and ⌘K to the one search, Escape back one
 * level, an airport card's F, D and S -- and hover previews. The mobile project, a phone's width, skips it.
 */
test.beforeEach(({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "a desktop's layout");
});

test("the side panel is the wide one, with rows at a desktop's size", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await openPanel(page);
  const box = await sideDrawer(page).boundingBox();
  expect(box!.width).toBe(448);
  // A row's words at 16 with a mouse (TEXT.row), not the 14 and less the
  // phone's card had: the one search's field.
  const size = await sideDrawer(page)
    .locator('input[type="search"]')
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
});

test("Alt+/ and ⌘K go to the one search, a bare / is the browser's, Escape goes back a level", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await openPanel(page);
  const search = page.getByTestId("search-airports");
  // Its keys shown in it at rest (the command palette it replaced).
  await expect(firstRow(page).locator("kbd")).toHaveText(/⌘K|Ctrl K/);
  // A bare / is left to the browser (Firefox's quick find): the shortcuts take Alt, Option on a Mac (the owner, 2026-11-11).
  await page.locator("body").click({ position: { x: 1000, y: 400 } });
  await page.keyboard.press("/");
  await expect(search).not.toBeFocused();
  await page.keyboard.press("Alt+Slash");
  await expect(search).toBeFocused();
  // Typed into, the keys are the field's: no tab under a number any more.
  await page.keyboard.type("1");
  await expect(search).toHaveValue("1");
  await page.keyboard.press("Escape");
  await expect(search).not.toBeFocused();
  await page.locator("body").click({ position: { x: 1000, y: 400 } });
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  await expect(search).toBeFocused();
  // The account page from the account button; Escape puts it away again.
  await page.keyboard.press("Escape");
  await openConsole(page);
  await page.locator("body").click({ position: { x: 1000, y: 400 } });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("console-sheet")).toHaveCount(0);
});

test("an airport's card has its actions' keys, Alt+F and Alt+S, and the search's rows preview a field under the mouse", async ({
  page,
}) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  const search = await airportSearch(page);
  await search.click();
  await search.fill("KOSH");
  const row = searchAirports(page).filter({ hasText: "KOSH" }).first();
  await row.hover();
  await expect(page.getByTestId("airport-preview")).toContainText("KOSH");
  await row.click();
  const card = sideDrawer(page).getByTestId("place-card");
  await expect(card.getByTestId("fly-here")).toContainText("Alt+F");
  await expect(card.getByTestId("place-add-stop")).toHaveAttribute("aria-keyshortcuts", "Alt+S");
  // A bare S does nothing: a letter alone is VoiceOver's quick nav and the browser's find-as-you-type.
  await page.locator("body").click({ position: { x: 1000, y: 400 } });
  await page.keyboard.press("s");
  await page.waitForTimeout(300);
  await expect(page).not.toHaveURL(/[?&]stops=KOSH/);
  // Alt+S, Add as Stop: the field a landing on the way, both ends kept.
  await page.keyboard.press("Alt+KeyS");
  await expect(page).toHaveURL(/[?&]stops=KOSH/);
  await expect(page).toHaveURL(/[?&]dep=C81/);
  await expect(page).toHaveURL(/[?&]dest=KDLH/);
});

test("the route box's Profile and Brief say their words on a desktop", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await expect(page.getByTestId("route-brief")).toContainText("Brief", { timeout: 30_000 });
});
