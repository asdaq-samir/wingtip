import { test, expect } from "@playwright/test";
import { grabberTo, sideDrawer, slow } from "./helpers";

const card = (page: import("@playwright/test").Page) => sideDrawer(page).getByTestId("place-card");

/**
 * An airport card's Lights read (the planner's lighting_read, from the
 * field's Chart Supplement remarks in NASR): Oshkosh's, the owner's
 * example (2026-11-11), as one row a system -- its name and legend code,
 * its runways, how it is turned on -- the first three, "Lights" opening
 * the rest, the standard keying, and the remark folded as written.
 */
test("Oshkosh's lights read a system a row, how each is turned on, the remark as written folded", async ({ page }) => {
  await page.goto("/app/plan?place=KOSH");
  await expect(card(page).getByTestId("place-name")).not.toBeEmpty({ timeout: slow(15000) });
  await grabberTo(page, "full");
  const section = card(page).getByTestId("place-lights");
  const rows = section.getByTestId("place-light");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("Approach lights (MALSR)");
  await expect(rows.first()).toContainText("Runway 36");
  await expect(rows.first().getByTestId("place-light-how")).toHaveText("Key the mic on CTAF when the tower is closed");
  // The title opens all five: the HIRL preset low, the PAPI always on.
  await card(page).getByTestId("place-lights-more").click();
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(3).getByTestId("place-light-how")).toHaveText("Preset low, sunset to sunrise; key the mic on CTAF for more");
  await expect(rows.nth(4).getByTestId("place-light-how")).toHaveText("On all the time");
  await expect(section.getByTestId("place-keying")).toContainText("7 high · 5 medium · 3 low");
  // The remark as sent, folded until asked for.
  await expect(section.getByTestId("place-lighting-raw")).toBeHidden();
  await section.getByTestId("place-lighting-sent").click();
  await expect(section.getByTestId("place-lighting-raw")).toContainText("WHEN ATCT CLSD, ACTVT MALSR RWY 36");
});
