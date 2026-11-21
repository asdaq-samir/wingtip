import { test, expect } from "@playwright/test";
import { grabberTo, settle, settled, sideDrawer } from "./helpers";
import { expectPage, showPage, toggle } from "./sheetPages";

/**
 * FPL's head (the owner, 2026-11-20/21): its round Search at the start,
 * which goes back to Search's resting page with the route kept, the FPL
 * button there coming back; the ✕ at the end, one tap asking "Clear
 * Route?" in the stock centred alert (no card, no sheet), the page staying
 * up, the ✕ greyed with no route. The pages' toggle: sheet-page-toggle.spec.
 */

test("on FPL one tap on the ✕ asks to clear the route in a centred alert, the page staying up; its Search button goes back", async ({
  page,
}) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await grabberTo(page, "half");
  await settled(sideDrawer(page));
  // A route opens the sheet on FPL's page.
  await expectPage(page, 1);
  const clear = sideDrawer(page).getByTestId("fpl-clear");
  await expect(clear).toBeEnabled();
  // The stock alert in the middle of the screen at every width, no card, no
  // sheet; Cancel keeps the route and the page.
  await clear.click();
  const ask = page.getByRole("alertdialog", { name: "Clear Route?" });
  await expect(ask).toBeVisible();
  await expect(ask).toHaveAttribute("data-slot", "alert-dialog-content");
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(ask).toHaveCount(0);
  await expectPage(page, 1);
  await expect(page).toHaveURL(/dep=C81/);
  // Clear Route clears it, the page still up, the ✕ then with nothing to do.
  await clear.click();
  await page.getByRole("alertdialog", { name: "Clear Route?" }).getByRole("button", { name: "Clear Route" }).click();
  await expect(page).not.toHaveURL(/dep=C81/);
  await expectPage(page, 1);
  await expect(clear).toBeDisabled();
  // FPL's Search button goes back to Search, the route (here none) kept.
  await showPage(page, 0);
  await expectPage(page, 0);
});

test("on FPL its Search button goes to Search's resting page with the route kept, its FPL button back", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await grabberTo(page, "half");
  await settled(sideDrawer(page));
  await expectPage(page, 1);
  await sideDrawer(page).getByTestId("fpl-search").click();
  await expectPage(page, 0);
  // At rest: the FPL button, no typing started, the route in the address.
  await expect(toggle(page)).toBeVisible();
  await expect(page.getByTestId("one-search-cancel")).toHaveCount(0);
  await expect(page).toHaveURL(/dep=C81/);
  await expect(page).toHaveURL(/dest=KDLH/);
  await toggle(page).click();
  await expectPage(page, 1);
  await expect(page).toHaveURL(/dest=KDLH/);
});
