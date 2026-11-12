import { test, expect, type Page } from "@playwright/test";
import { consoleSheet, noTips, openConsole, settle, showTabs } from "./helpers";

/**
 * Setup's rows for what was three to six taps down (docs/navigation.md's
 * gaps 1 to 3): the picked airplane's Checklists, the Coach and Practice
 * beside Airplanes, Flights and Logbook, and the Emergency Assistant in a
 * group of its own -- each two taps from the map. The pages are the ones
 * their deeper homes open. Signed out here: the checklists, the drills and
 * the assistant need no account; the Coach does, and says so.
 */
// Signed out, as the comment above says: the suite's session is the
// developer's, under which the Coach is open.
test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(noTips);
});

async function setup(page: Page) {
  await page.goto("/app/plan");
  await showTabs(page);
  await openConsole(page);
  const sheet = consoleSheet(page);
  await expect(sheet.getByTestId("library-section")).toBeVisible();
  return sheet;
}

test("Setup's list has Checklists, Coach and Practice beside the pilot's things, and the assistant", async ({ page }) => {
  const sheet = await setup(page);
  const list = sheet.getByTestId("library-section");
  await expect(list.getByTestId("checklists-row")).toBeVisible();
  await expect(list.getByTestId("practice-row")).toBeVisible();
  // Kept to an account, as the Logbook is: greyed and saying why.
  await expect(list.getByTestId("setup-coach-row")).toBeDisabled();
  await expect(list.getByTestId("setup-coach-row")).toContainText("Sign In to Use");

  // Checklists: the airplane picked's, with the assistant a row away.
  await list.getByTestId("checklists-row").click();
  await expect(sheet.getByRole("heading", { name: "Checklists", exact: true })).toBeVisible();
  await expect(sheet.getByTestId("checklist")).toBeVisible();
  await expect(sheet.getByTestId("checklist-emergency")).toBeVisible();
  await sheet.getByRole("button", { name: "Back to Setup", exact: true }).click();

  // Practice: the drills, each a row.
  await list.getByTestId("practice-row").click();
  await expect(sheet.getByTestId("practice-page")).toBeVisible();
  await sheet.getByRole("button", { name: /^Holding entries/ }).click();
  await expect(sheet.getByTestId("hold-entry")).toBeVisible();
});

test("the Emergency Assistant is a row of Setup's, two taps from the map", async ({ page }) => {
  const sheet = await setup(page);
  await sheet.getByTestId("setup-emergency").click();
  await expect(page.getByTestId("emergency-sheet")).toBeVisible();
  await expect(page.getByTestId("emergency-sheet").getByTestId("emergency-squawk")).toContainText("7700");
});

test("a link opens Setup's Checklists by its name", async ({ page }) => {
  await page.goto("/app/plan?open=checklists");
  await settle(page);
  const sheet = consoleSheet(page);
  await expect(sheet.getByRole("heading", { name: "Checklists", exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]open=/);
});
