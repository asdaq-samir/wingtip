import { test, expect } from "@playwright/test";
import { openBrief, openPanel, openProfile, settle, sideDrawer, slow } from "./helpers";
import { pickAirplane } from "./startState";

/**
 * Ready to fly (the engine's ready_to_fly, features/readyToFly): the
 * Brief's last part, after its cards, says in one line whether the device has what the
 * flight needs while there is a signal, then at most three actions that
 * fix in place. With no airplane picked none is assumed: "Pick the
 * airplane" is one of them and opens the existing picker. Starting a dry
 * run with something missing shows it once, and the pilot may fly anyway.
 */

test("the Brief ends on Ready to fly, its actions fixing in place", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH&view=briefing");
  await settle(page);
  // The plan in, with no airplane: its distance, never a fuel figure.
  await expect(sideDrawer(page).getByTestId("flight-line")).toContainText(/DIST/i, { timeout: slow(120_000) });
  await openBrief(page);
  const ready = sideDrawer(page).getByTestId("ready-to-fly");
  await expect(ready).toBeVisible({ timeout: slow(30_000) });
  // After the verdict, the Ask and the cards: the checks left before
  // departure (docs/design/web.md §5; decision 0012, the verdict first).
  const glance = sideDrawer(page).getByTestId("brief-glance");
  await expect(glance.locator("> *").first()).not.toHaveAttribute("data-testid", "ready-to-fly");
  const top = async (id: string) => (await glance.getByTestId(id).first().boundingBox())!.y;
  expect(await top("brief-glance-preflight")).toBeLessThan(await top("ready-to-fly"));
  await expect(ready.getByTestId("ready-line")).toHaveText(/things? to fix while you have a signal|Ready to fly/);
  const actions = ready.locator("[data-testid^='ready-action-']");
  expect(await actions.count()).toBeLessThanOrEqual(3);
  // No airplane picked: asked for, never a 172.
  const pick = ready.getByTestId("ready-action-airplane");
  await expect(pick).toHaveText("Pick the airplane");
  // Every check folded, with the next FAA cycle.
  await ready.getByTestId("ready-all").getByRole("button").click();
  await expect(ready.getByTestId("ready-next-cycle")).toContainText(/Next FAA data cycle \d{4}/);
  // The fix in place: FPL's own airplane field, focused.
  await pick.click();
  await expect(page.locator('[data-testid="aircraft-select"] input')).toBeFocused({ timeout: slow(10_000) });
});

test("starting a dry run with something to fix shows Ready to fly once, and the pilot flies anyway", async ({ page }) => {
  // The dry run flies an airplane's speeds: one picked.
  await pickAirplane(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await openProfile(page);
  const start = sideDrawer(page).getByTestId("dry-run-start");
  await expect(start).toBeVisible({ timeout: slow(60_000) });
  await start.click();
  const prompt = page.getByTestId("ready-prompt");
  await expect(prompt).toBeVisible({ timeout: slow(10_000) });
  await prompt.getByTestId("ready-fly-anyway").click();
  await expect(prompt).toHaveCount(0);
  // The run goes on: warn, never limit.
  await expect(page.locator('[data-own-ship="on"]')).toHaveCount(1);
});
