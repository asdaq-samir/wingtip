import { test, expect } from "@playwright/test";
import { noTips, settle, slow } from "./helpers";

/**
 * A flight shared by link (design/screens.json's `shared`,
 * docs/navigation.md): it opens as a preview, the receiver's own plan
 * untouched until Use This Plan, and a saved flight's link no longer
 * shared says so.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(noTips);
});

const LINK = "/app/plan?open=shared&dep=C81&dest=KDLH&altitude_ft=5500&type=C172&rules=vfr";

test("a shared plan opens as a preview, and Use This Plan plans it", { tag: "@smoke" }, async ({ page }) => {
  await page.goto(LINK);
  await settle(page);
  const sheet = page.getByTestId("shared-flight");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("C81 → KDLH");
  await expect(sheet).toContainText("5,500 ft");
  await expect(sheet).toContainText("C172");
  // Nothing planned yet: the link's keys are off the address.
  await expect(page).not.toHaveURL(/[?&]dep=/);

  await sheet.getByTestId("shared-flight-use").click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/[?&]dep=C81/);
  await expect(page).toHaveURL(/[?&]altitude_ft=5500/);
  await expect(page.getByRole("table", { name: /Navigation log from/i })).toBeVisible({ timeout: slow(30000) });
});

test("Not Now keeps the receiver's plan", async ({ page }) => {
  await page.goto(LINK);
  await settle(page);
  await page.getByTestId("shared-flight-not-now").click();
  await expect(page.getByTestId("shared-flight")).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]dep=/);
});

test("a saved flight's link no longer shared says so", async ({ page }) => {
  await page.route(
    (url) => url.pathname.startsWith("/api/shared-flights/"),
    (route) => route.fulfill({ status: 404, body: "" }),
  );
  await page.goto("/app/plan?open=shared&share=abcdefghijklmnopqrstuv");
  await settle(page);
  await expect(page.getByTestId("shared-flight-gone")).toBeVisible();
  await expect(page.getByTestId("shared-flight-use")).toHaveCount(0);
});
