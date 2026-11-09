import { test, expect } from "@playwright/test";
import { settle } from "./helpers";

/**
 * The command palette (⌘K or Ctrl K; the owner, 2026-11-09): one field
 * that finds an airport and opens its card, opens any screen a link can,
 * and runs the common actions with their keys beside them. An addition:
 * nothing in the panel moves for it. The Map menu has a row for it, so a
 * finger reaches it too.
 */

const KEYS = process.platform === "darwin" ? "Meta+K" : "Control+K";

test("⌘K opens the palette; an airport typed opens its card", { tag: "@smoke" }, async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await page.keyboard.press(KEYS);
  const palette = page.getByTestId("command-palette");
  await expect(palette).toBeVisible();
  // The common actions and the screens, before anything is typed, each
  // action with its key.
  await expect(page.getByTestId("command-palette-brief")).toContainText("B");
  await expect(page.getByTestId("command-palette-screen-logbook")).toBeVisible();

  await page.getByTestId("command-palette-input").fill("KDLH");
  await page.getByTestId("command-palette-airport").filter({ hasText: "KDLH" }).first().click();
  await expect(palette).toBeHidden();
  await expect(page.getByTestId("place-card")).toContainText("KDLH");
});

test("a screen is found by its name, and Escape closes the palette", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await page.keyboard.press(KEYS);
  await page.getByTestId("command-palette-input").fill("logb");
  await expect(page.getByTestId("command-palette-screen-logbook")).toBeVisible();
  await expect(page.getByTestId("command-palette-screen-checklists")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("command-palette")).toBeHidden();
});

test("the Map menu's row opens the palette", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await page.getByTestId("map-settings-button").click();
  await page.getByTestId("palette-hint").click();
  await expect(page.getByTestId("command-palette")).toBeVisible();
});
