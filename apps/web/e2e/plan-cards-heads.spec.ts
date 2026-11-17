import { test, expect } from "@playwright/test";
import { closeNavLog, closeProfile, controlsInSight, openBrief, openNavLog, openProfile, settle, slow } from "./helpers";

/**
 * The Profile, Nav Log and Brief cards as a pilot with no airplane picked
 * sees them (the setup picks none; the UI audit of 2026-11-17).
 */

test("profile: the slider, its tag and the ruler all say the planned cruise, with no airplane picked", async ({ page }) => {
  test.slow();
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await controlsInSight(page);
  const card = await openProfile(page);
  const picked = card.getByTestId("altitude-picked");
  await expect(picked).toHaveText(/^FL-\d{3}$/, { timeout: slow(60_000) });
  const cruiseFt = Number((await picked.textContent())!.replace("FL-", "")) * 100;
  // The tag on the side view is the cruise, not the line's highest point
  // (a line with no climb ran field to field: "FL-022" on a plan at FL-145).
  await expect(card.getByTestId("mini-profile-cruise")).toHaveText(`FL-${String(cruiseFt / 100).padStart(3, "0")}`);
  // The slider on the chart's feet: its value the cruise, its knob level
  // with the tag (it sat a step a row down the graph, at about 9,500).
  const wheel = card.getByRole("slider", { name: "Cruise altitude" });
  await expect(wheel).toHaveAttribute("aria-valuenow", String(cruiseFt));
  const knob = await card.locator("[data-slot=slider-thumb]").boundingBox();
  const tag = await card.getByTestId("mini-profile-cruise").boundingBox();
  expect(Math.abs(knob!.y + knob!.height / 2 - (tag!.y + tag!.height / 2))).toBeLessThan(4);
  // The ruler's figures and the tag beside the slider's track, not under it.
  expect(tag!.x).toBeGreaterThanOrEqual(knob!.x + knob!.width);
  // Set: inert till the preview differs, then the tint's fill.
  const set = card.getByTestId("altitude-set");
  await expect(set).toBeDisabled();
  await wheel.focus();
  await page.keyboard.press("ArrowDown");
  await expect(set).toBeEnabled();
  // One line under the name: its cruise and clearance, not the Brief's
  // plan line again (it said the cruise twice).
  await expect(card.getByTestId("card-sub")).toHaveCount(1);
  await expect(card).not.toContainText("leaving");
  await closeProfile(page);
});

test("nav log and brief: no zero count, the dashes said, the plan line in the Brief's head", async ({ page }) => {
  test.slow();
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await controlsInSight(page);
  const sheet = await openNavLog(page);
  // With no airplane the time and fuel are none of the planner's: said so.
  await expect(sheet.getByTestId("card-sub")).toContainText(/nm · no airplane picked$/, { timeout: slow(60_000) });
  await expect(sheet).not.toContainText("0 Checkpoints");
  await expect(sheet).not.toContainText("leaving");
  await closeNavLog(page);
  await openBrief(page);
  const brief = page.getByTestId("brief-card");
  // The plan's line is the pinned head's own, the altitude first.
  await expect(brief.getByTestId("card-sub")).toHaveText(/^FL-\d{3} · leaving /);
  // The cards' names are section titles, not small grey capitals.
  const label = brief.getByTestId("brief-glance-preflight").getByText("Before you go", { exact: true });
  await expect(label).toHaveCSS("text-transform", "none");
  // The verdict first, before anything else on the page.
  const verdict = brief.getByTestId("brief-verdict");
  await expect(verdict).toBeVisible({ timeout: slow(60_000) });
  const notices = brief.getByTestId("briefing-notices");
  if (await notices.count()) expect((await notices.boundingBox())!.y).toBeGreaterThan((await verdict.boundingBox())!.y);
});
