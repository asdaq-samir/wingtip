import { test, expect } from "@playwright/test";
import { consoleSheet, openConsole, showTabs } from "./helpers";

/**
 * The scratchpad (features/scratchpad; the market-gap report's item 5,
 * 2026-11-21): You's Scratchpad starts a page of a template for the
 * flight open now -- a clearance in CRAFT's boxes here -- typed into and
 * written on, and the page is still there after a reload, kept on this
 * device with its flight.
 */

test("a CRAFT page is typed and written on, and is kept with its flight on this device", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KOSH");
  await showTabs(page);
  await openConsole(page);
  const sheet = consoleSheet(page);
  await sheet.getByTestId("scratchpad-row-open").click();
  await sheet.getByTestId("scratchpad-new").click();
  await page.getByTestId("scratchpad-new-craft").click();

  const pad = sheet.getByTestId("scratchpad-pad");
  await expect(pad).toHaveAttribute("data-template", "craft");
  await pad.getByTestId("scratchpad-field-clearance").fill("KOSH");
  await pad.getByTestId("scratchpad-field-transponder").fill("4521");

  // A stroke across the page's ink.
  const ink = pad.getByTestId("scratchpad-ink");
  const box = (await ink.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 60);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 40 + i * 15, box.y + 60 + i * 5);
  await page.mouse.up();
  await expect(ink).toHaveAttribute("data-strokes", "1");
  await expect(ink.locator("path")).toHaveCount(1);

  // Kept: after a reload the flight's page has its boxes and its ink
  // (the stroke, kept at once, keeps the boxes typed before it).
  await page.reload();
  await showTabs(page);
  await openConsole(page);
  await consoleSheet(page).getByTestId("scratchpad-row-open").click();
  const list = consoleSheet(page).getByTestId("scratchpad-page");
  await expect(list).toContainText("This flight · C81 → KOSH");
  await list.getByTestId("scratchpad-row").first().click();
  const again = consoleSheet(page).getByTestId("scratchpad-pad");
  await expect(again.getByTestId("scratchpad-field-clearance")).toHaveValue("KOSH");
  await expect(again.getByTestId("scratchpad-field-transponder")).toHaveValue("4521");
  await expect(again.getByTestId("scratchpad-ink")).toHaveAttribute("data-strokes", "1");
});
