import { test, expect } from "@playwright/test";
import { inSheet, openBrief, openPanel, openProfile, settle, sideDrawer, slow } from "./helpers";
import { pickAirplane } from "./startState";

/**
 * Ready to fly (the engine's ready_to_fly, features/readyToFly): the
 * Brief's Before You Go row says how many things are left to do on the
 * device while there is a signal, and opens Preflight, where Ready to Fly
 * is a grouped list (option A, the owner 2026-11-19): the engine's line,
 * at most three actions that fix in place, every check and the next FAA
 * cycle. With no airplane picked none is assumed: "Pick the airplane" is
 * one of the actions and opens the existing picker. Starting a dry run
 * with something missing shows it once, and the pilot may fly anyway.
 */

test("the Brief's Before You Go says what is left to do, and opens Ready to Fly on Preflight, its actions fixing in place", async ({
  page,
}) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH&view=full");
  await settle(page);
  // The plan in, with no airplane: its distance, never a fuel figure.
  await expect(sideDrawer(page).getByTestId("flight-line")).toContainText(/DIST/i, { timeout: slow(120_000) });
  await openBrief(page);
  // Before You Go's value, the count of the engine's checks not done.
  const glance = sideDrawer(page).getByTestId("brief-glance");
  const before = glance.getByTestId("brief-glance-preflight");
  await expect(before.getByTestId("ready-todo")).toHaveText(/^(\d+ to do|Ready)$/, { timeout: slow(30_000) });
  // No airplane picked: one thing at least is left (asked for, never a 172).
  await expect(before.getByTestId("ready-todo")).toHaveText(/^\d+ to do$/);
  // Not on the overview any more: on Preflight, which the row opens.
  await expect(glance.getByTestId("ready-to-fly")).toHaveCount(0);
  await inSheet(page, before);
  await before.click();
  const ready = sideDrawer(page).locator('[data-tab="preflight"]').getByTestId("ready-to-fly");
  await expect(ready).toBeVisible({ timeout: slow(30_000) });
  await expect(ready.getByTestId("ready-line")).toHaveText(/^\d+ things? left to do before you go$/);
  // As many checks not done as the line says, read together: a check can
  // finish while the Brief comes in (5 of 6 done between the two reads).
  await expect
    .poll(async () => {
      const said = Number((await ready.getByTestId("ready-line").textContent())!.split(" ")[0]);
      const marked = await ready.locator("[data-testid^='ready-item-'] [data-finding=caution]").count();
      return said === marked;
    })
    .toBe(true);
  // At most three actions, laid open: no fold to open first.
  const actions = ready.locator("[data-testid^='ready-action-']");
  expect(await actions.count()).toBeGreaterThanOrEqual(1);
  expect(await actions.count()).toBeLessThanOrEqual(3);
  const pick = ready.getByTestId("ready-action-airplane");
  await expect(pick).toHaveText("Pick the airplane");
  // And the next FAA cycle.
  await expect(ready.getByTestId("ready-next-cycle")).toContainText(/Next FAA data cycle \d{4}/);
  // The fix in place: FPL's own airplane field, focused.
  await inSheet(page, pick);
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
