import { test, expect, type Page } from "@playwright/test";
import { consoleSheet, noTips, openConsole, settle, showTabs } from "./helpers";

/**
 * You, the avatar's card (the owner's option A, 2026-11-13): Airplanes
 * with the picked airplane's Checklists inside it, Training a row opening
 * the Coach and Practice, and Emergency, one list under the avatar, and
 * Settings the gear at its top left, as Apple Maps' account card has it (the owner's screenshot,
 * 2026-11-13). Signed out here: the checklists, the drills and the assistant
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

test("You is a card over the sheet as every card is: the avatar over one list, the gear and the ✕ its head row, Escape and the ✕ closing it", async ({
  page,
}) => {
  const sheet = await you(page);
  // The stock Drawer's nested drawer over the map's sheet (the owner,
  // 2026-11-13: "make everything a nested drawer except the welcome one").
  expect(await sheet.evaluate((el) => !!el.closest('[data-slot="map-panel"] [data-sheet-card]'))).toBe(true);
  // One list of rows in order, each opening its page.
  const rows = sheet.getByTestId("library-section").getByRole("button");
  await expect(rows).toHaveText([/^Pilot Details/, /^Airplanes/, /^Flights/, /^Logbook/, /^Minimums/, /^Training/, /^Emergency/]);
  await expect(sheet.getByTestId("library-section").getByRole("group")).toHaveCount(1);
  // Signed out: Sign In said once, the head's large line, no "You" and no
  // "Sign In to Use" on the greyed rows (the owner, 2026-11-13: "Instead
  // of saying you, just say sign in once").
  const head = sheet.getByTestId("setup-pill-account");
  await expect(head.getByRole("button", { name: "Sign In", exact: true })).toBeVisible();
  await expect(head).not.toContainText("You");
  await expect(sheet.getByRole("button", { name: /^Sign in$/i })).toHaveCount(1);
  for (const row of [/^Flights/, /^Logbook/]) await expect(rows.filter({ hasText: row })).toBeDisabled();
  await expect(sheet.getByTestId("library-section")).not.toContainText("Sign In to Use");
  // Its one head row: the gear at the top left (Settings, the owner,
  // 2026-11-13) and the ✕ at the right, level.
  const box = (await sheet.boundingBox())!;
  const gear = (await sheet.getByTestId("settings-row").boundingBox())!;
  const close = (await sheet.getByTestId("console-close").boundingBox())!;
  expect(gear.x).toBeLessThan(box.x + 32);
  expect(Math.abs(gear.y - close.y)).toBeLessThan(2);
  await sheet.getByTestId("console-close").click();
  await expect(consoleSheet(page)).toHaveCount(0);
  // Escape closes it too.
  await openConsole(page);
  await page.keyboard.press("Escape");
  await expect(consoleSheet(page)).toHaveCount(0);
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
