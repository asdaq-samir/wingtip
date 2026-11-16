import { expect, type Locator, type Page } from "@playwright/test";
import { openPanel, sideDrawer, slow } from "./helpers";

/* The dry run's side of the suite: the side view's card it starts from,
 * and its start. helpers re-exports them, as the specs import them there. */

/** The side view, a card over FPL, with the altitude's wheel in its
 *  corner: opened at rest from the route's Profile button, beside the AI
 *  brief's (the owner, 2026-11-04). */
export async function openProfile(page: Page) {
  await openPanel(page);
  const card = page.getByTestId("profile-card");
  if (!(await card.isVisible()))
    await sideDrawer(page)
      .getByTestId("route-profile")
      .click({ timeout: slow(60_000) });
  await expect(card).toBeVisible();
  return card;
}

/** The side view's card put away: its close, kept for a keyboard and a
 *  screen reader (CardClose), as the nav log's is. */
export async function closeProfile(page: Page) {
  await page.getByTestId("profile-close").focus();
  await page.keyboard.press("Enter");
  // Kept between its openings, closed (CardLayer's `open`).
  await expect(page.getByTestId("profile-card")).toBeHidden();
}

/** A dry run started from its button, and Ready to fly's prompt, which
 *  comes once a route when the device lacks something for the flight
 *  (features/readyToFly), passed with Fly Anyway as a pilot may: the
 *  suite's device never has the route's charts kept or the briefing
 *  fresh. Started again on the same route, there is no prompt. */
export async function pressDryRunStart(page: Page, start: Locator) {
  await start.click();
  const prompt = page.getByTestId("ready-prompt");
  await prompt.waitFor({ timeout: slow(3000) }).catch(() => {});
  if (await prompt.count()) {
    await prompt.getByTestId("ready-fly-anyway").click();
    await expect(prompt).toHaveCount(0);
  }
}
