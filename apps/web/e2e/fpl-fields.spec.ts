import { test, expect } from "@playwright/test";
import { controlsInSight, grabberTo, settle, sideDrawer } from "./helpers";

/**
 * FPL's own fields as the UI audit of 2026-11-17 found them: the airplane's
 * N-number field taking an N typed first as its own (B4), the departure's
 * picker with its way out and its pick in sight at half (B7), and the
 * actions' floating bar over a fade, so the rows at half do not show
 * through its glass (B1).
 */

test("the N-number field takes an N typed first as its own, and says in red what no registration can be", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await controlsInSight(page);
  const picker = page.getByTestId("aircraft-input");
  await expect(picker).toHaveValue("N-");
  // "N12" after the fixed "N-" read "N-N12", which no list matched.
  await picker.fill("N-N12");
  await expect(picker).toHaveValue("N-12");
  await expect(picker).not.toHaveAttribute("aria-invalid");
  // An airport's ident is no registration: said as it is typed.
  await picker.fill("N-KOSH");
  await expect(picker).toHaveAttribute("aria-invalid", "true");
  // Escape lets go of what was typed.
  await picker.press("Escape");
  await expect(picker).toHaveValue("N-");
  await expect(picker).not.toHaveAttribute("aria-invalid");
});

test("the departure's picker on a phone has its close and its pick in sight at half", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "a popover beside its button from md up");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await controlsInSight(page);
  await page.getByTestId("depart-date").click();
  await expect(page.locator('[data-slot="calendar"]')).toBeVisible();
  // At half: Done at the top, as an iOS sheet puts it, and the time
  // picked under its name. Leaving now already, no Now to go back to: a
  // greyed one did nothing (the owner's list, 2026-11-17).
  await expect(page.getByText(/^Leaving now$/)).toBeInViewport();
  await expect(page.getByTestId("depart-clear")).toHaveCount(0);
  const done = page.getByTestId("depart-done");
  await expect(done).toBeInViewport();
  await done.click();
  await expect(page.locator('[data-slot="calendar"]')).toHaveCount(0);
  // The time in the tint alone, no chevron after it.
  await expect(page.getByTestId("depart-date").locator("svg")).toHaveCount(0);
});

test("FPL's actions float over a fade to the sheet's colour, taking taps on the capsule alone", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await grabberTo(page, "half");
  const bar = sideDrawer(page).getByTestId("fpl-actions");
  await expect(bar).toBeVisible();
  await expect(bar).toHaveCSS("background-image", /linear-gradient/);
  await expect(bar).toHaveCSS("pointer-events", "none");
  await expect(bar.getByTestId("route-navlog")).toBeEnabled();
});
