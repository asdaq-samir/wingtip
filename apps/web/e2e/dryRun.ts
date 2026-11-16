import { expect, type Locator, type Page } from "@playwright/test";
import { pickFplTab, slow } from "./helpers";

/* The dry run's side of the suite: the Profile tab it starts from,
 * and its start. helpers re-exports them, as the specs import them there. */

/** The Profile, FPL's tab beside the Brief's (FplTabs): its rules, its
 *  cruise and clearance line and the side view, a dry run's start under it. */
export async function openProfile(page: Page) {
  await pickFplTab(page, "profile");
  const profile = page.getByTestId("profile-page");
  await expect(profile).toBeVisible();
  return profile;
}

/** The Profile left: a dry run's card first put away by its close (kept
 *  for a keyboard and a screen reader, CardClose), which stops the run, as
 *  the sheet draws no tabs while one flies; then the Nav Log's tab picked. */
export async function closeProfile(page: Page) {
  const card = page.getByTestId("profile-card");
  if (await card.isVisible()) {
    await page.getByTestId("profile-close").focus();
    await page.keyboard.press("Enter");
    await expect(card).toBeHidden();
  }
  await pickFplTab(page, "navlog");
  await expect(page.getByTestId("profile-page")).toBeHidden();
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
