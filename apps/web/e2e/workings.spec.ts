import { test, expect } from "@playwright/test";
import { settle, slow, openNavLog, navLogSheet, openPanel, inSheet } from "./helpers";
import { pickAirplane } from "./startState";
test.beforeEach(({ page }) => pickAirplane(page)); // the wind triangle needs its airspeed (the setup picks none)

/**
 * Show the work (LegWorkings): the selected leg's wind triangle worked
 * out step by step, and a student's own figures checked against it.
 */
test("a leg's heading worked out, and a student's magnetic heading marked", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await openNavLog(page);
  const rows = navLogSheet(page).locator("[data-kind=checkpoint]");
  await expect(rows.first()).toBeVisible({ timeout: slow(120000) });
  await rows.first().click();
  // The row picked brings the map to its point over the card at half
  // (rules.md §14.5), its line under the card's edge: pulled up to reach.
  const link = navLogSheet(page).getByTestId("leg-workings").first();
  await inSheet(page, link);
  await link.click();
  const sheet = page.getByTestId("leg-workings-content");
  await expect(sheet.getByTestId("working-step")).toHaveCount(10);
  await expect(sheet.getByTestId("working-step").nth(5)).toContainText("east is least, west is best");
  // The answer, read from the worked steps, typed back: right.
  const mh = (await sheet.getByTestId("working-step").nth(5).innerText()).match(/(\d{3})°\s*$/)![1]!;
  await sheet.getByTestId("workings-mode").getByText("Try it").click();
  await sheet.getByTestId("try-mh-input").fill(mh);
  await sheet.getByTestId("try-gs-input").fill("1");
  // The card opens half way, as every card does: its button under the
  // edge is reached by pulling the card up.
  await inSheet(page, sheet.getByTestId("try-check"));
  await sheet.getByTestId("try-check").click();
  await expect(sheet.getByTestId("try-mh").getByLabel("Right")).toBeVisible();
  await expect(sheet.getByTestId("try-gs")).toContainText("Not quite");
  // A figure not typed is not marked, nor its answer given away.
  await expect(sheet.getByTestId("try-th")).not.toContainText("Not quite");
});
