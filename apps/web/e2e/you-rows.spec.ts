import { test, expect, type Page } from "@playwright/test";
import { consoleSheet, noTips, openConsole, settle, showTabs } from "./helpers";

/**
 * You, the avatar's card (the owner's option A, 2026-11-13): Airplanes
 * with the picked airplane's Checklists inside it, Training a row opening
 * the Coach and Practice, the Emergency Assistant a group of its own, and
 * Settings. Signed out here: the checklists, the drills and the assistant
 * need no account; the Coach does, and says so.
 */
// Signed out, as the comment above says: the suite's session is the
// developer's, under which the Coach is open.
test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(noTips);
});

async function you(page: Page) {
  await page.goto("/app/plan");
  await showTabs(page);
  await openConsole(page);
  const sheet = consoleSheet(page);
  await expect(sheet.getByTestId("library-section")).toBeVisible();
  return sheet;
}

test("Checklists are inside Airplanes, and Training holds the Coach and Practice", async ({ page }) => {
  const sheet = await you(page);
  const list = sheet.getByTestId("library-section");
  // No row of You's own for either now.
  for (const gone of ["checklists-row", "practice-row", "setup-coach-row"]) await expect(list.getByTestId(gone)).toHaveCount(0);

  // Airplanes opens signed out, for the checklists of the airplane picked.
  await list.getByRole("button", { name: /^Airplanes/ }).click();
  await sheet.getByTestId("checklists-row").click();
  await expect(sheet.getByRole("heading", { name: "Checklists", exact: true })).toBeVisible();
  await expect(sheet.getByTestId("checklist")).toBeVisible();
  await expect(sheet.getByTestId("checklist-emergency")).toBeVisible();
  await sheet.getByRole("button", { name: "Back to Airplanes", exact: true }).click();
  await sheet.getByRole("button", { name: "Back to You", exact: true }).click();

  // Training: the Coach kept to an account, greyed and saying why; Practice the drills, each a row.
  await sheet.getByTestId("training-row").click();
  await expect(sheet.getByTestId("setup-coach-row")).toBeDisabled();
  await expect(sheet.getByTestId("setup-coach-row")).toContainText("Sign In to Use");
  await sheet.getByTestId("practice-row").click();
  await expect(sheet.getByTestId("practice-page")).toBeVisible();
  await sheet.getByRole("button", { name: /^Holding entries/ }).click();
  await expect(sheet.getByTestId("hold-entry")).toBeVisible();
});

test("the Emergency Assistant is a row of You's, two taps from the map", async ({ page }) => {
  const sheet = await you(page);
  await sheet.getByTestId("setup-emergency").click();
  await expect(page.getByTestId("emergency-sheet")).toBeVisible();
  await expect(page.getByTestId("emergency-sheet").getByTestId("emergency-squawk")).toContainText("7700");
});

test("a link opens the Checklists by their name, inside Airplanes", async ({ page }) => {
  await page.goto("/app/plan?open=checklists");
  await settle(page);
  const sheet = consoleSheet(page);
  await expect(sheet.getByRole("heading", { name: "Checklists", exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]open=/);
});
