import { test, expect } from "@playwright/test";
import { inSheet, noTips, settle, sideDrawer, slow } from "./helpers";

/**
 * A link opens the screen it names (design/screens.json, docs/navigation.md):
 * `/app/plan?open=<id>`, the same address the phones open as a universal
 * link or an App Link. The word is taken off the address once the screen
 * is open, so a reload or Back does not open it again. And what is shown
 * opens where it is explained: the strip's distance its nav log, a nav log
 * row's field its card.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(noTips);
});

test("a link opens a screen by its name, and the word leaves the address", { tag: "@smoke" }, async ({ page }) => {
  await page.goto("/app/plan?open=about");
  await settle(page);
  const sheet = page.getByTestId("console-sheet");
  // About itself, opened straight from the map: its close goes back to the
  // map it came from, one level (ConsolePages' direct page).
  await expect(sheet.getByRole("heading", { name: "About", level: 3 })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Back to the map", exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]open=/);

  await page.goto("/app/plan?open=nearest");
  await settle(page);
  await expect(sideDrawer(page).getByTestId("nearest-card")).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]open=/);
});

test("a link to the nav log waits for its route, and a field in it opens its card", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH&open=navlog");
  await settle(page);
  const table = page.getByRole("table", { name: /Navigation log from/i });
  await expect(table).toBeVisible({ timeout: slow(30000) });

  // A field's name in the log opens its card: the destination's, at the
  // log's foot, under the half card's edge till the card is pulled up.
  const field = table.getByTestId("navlog-field-open").last();
  await inSheet(page, field);
  await field.click();
  await expect(sideDrawer(page).getByTestId("place-card")).toBeVisible();
  await expect(page).toHaveURL(/[?&]place=KDLH/);
});

test("a name no screen has is let go", async ({ page }) => {
  await page.goto("/app/plan?open=nowhere");
  await settle(page);
  await expect(page).not.toHaveURL(/[?&]open=/);
  await expect(page.getByTestId("console-sheet")).toBeHidden();
});
