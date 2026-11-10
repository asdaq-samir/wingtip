import { test, expect } from "@playwright/test";
import { settle, slow } from "./helpers";

/**
 * The welcome (features/plan/components/welcome, useWelcome): the first
 * time the planner opens on a device with no route, a page each for the
 * airplane (No Airplane the default), Home, VFR or IFR and the location,
 * which says why before the browser asks; then the sample flight, Madison
 * to Oshkosh, opened in one tap with its nav log. Seen, it is not shown
 * again. The suite's session has the tips all seen, the welcome with
 * them; this spec starts with none seen, once, so a reload keeps what it saw.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("welcome-fresh")) return;
    localStorage.removeItem("wingtip.tips");
    sessionStorage.setItem("welcome-fresh", "1");
  });
});

test("a new pilot is welcomed once, and the sample flight opens with its nav log in one tap", async ({ page }) => {
  test.setTimeout(slow(90_000));
  await page.goto("/app/plan");
  await settle(page);
  const welcome = page.getByTestId("welcome");
  await expect(welcome).toBeVisible({ timeout: slow(15_000) });
  // No airplane is assumed (docs/decisions/0011).
  await expect(welcome.getByTestId("welcome-no-airplane")).toHaveAttribute("aria-checked", "true");
  await welcome.getByTestId("welcome-next").click();
  await expect(welcome.getByTestId("welcome-home")).toBeVisible();
  await welcome.getByTestId("welcome-next").click();
  await welcome.getByTestId("welcome-rules").getByRole("button", { name: "IFR" }).click();
  await welcome.getByTestId("welcome-next").click();
  // The location's page, where the browser still has its question: Not Now passes it.
  const notNow = welcome.getByTestId("welcome-not-now");
  if (await notNow.isVisible()) await notNow.click();
  await welcome.getByTestId("welcome-sample").click();

  await expect(page).toHaveURL(/dep=KMSN/);
  await expect(page).toHaveURL(/dest=KOSH/);
  const navlog = page.getByTestId("navlog-list");
  await expect(navlog).toBeVisible({ timeout: slow(60_000) });
  await expect(welcome).toHaveCount(0);
  await expect(page.getByTestId("first-flight")).toHaveCount(0);

  // Seen: not shown again on this device, even with no route.
  await page.goto("/app/plan");
  await settle(page);
  await page.waitForTimeout(1500);
  await expect(welcome).toHaveCount(0);
});
