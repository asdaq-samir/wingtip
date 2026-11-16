import { test, expect, type Page } from "@playwright/test";
import { consoleSheet, openConsole, settle, showTabs, slow, consolePage } from "./helpers";

/**
 * The subscription (lib/subscription, PaidPrompt): without it, the paid
 * feature's place says what it does, that it comes with the subscription
 * and its price, and the free month starts there. The suite's
 * pilot is a developer, who has it given; here the gateway's answer is a
 * plain pilot's, stubbed, as the server's check is the Java tests'.
 */

type Standing = "FREE" | "TRIAL";

const subscription = (state: Standing, over: Record<string, unknown> = {}) => ({
  state,
  entitled: state !== "FREE",
  until: state === "TRIAL" ? "2026-11-10T12:00:00Z" : null,
  trialAvailable: state === "FREE",
  trialDays: 30,
  plan: null,
  store: null,
  ...over,
});

/** The gateway's subscription for this page, starting as `state`: the
 *  free month started by its POST. Answers what was asked of it. */
async function stubSubscription(page: Page, state: Standing, over: Record<string, unknown> = {}) {
  let now = state;
  const asked: string[] = [];
  // A deployment that sells it: the stack's own, the proof of concept,
  // sells none (app.subscription.enabled).
  await sold(page, { subscriptions: true });
  await page.route(
    (url) => url.pathname === "/api/subscription",
    (route) => route.fulfill({ json: subscription(now, over) }),
  );
  await page.route(
    (url) => url.pathname === "/api/subscription/trial",
    (route) => {
      asked.push("trial");
      now = "TRIAL";
      return route.fulfill({ json: subscription("TRIAL") });
    },
  );
  return asked;
}

/** The deployment's capabilities as the stack answers them, changed. */
async function sold(page: Page, change: Record<string, unknown>) {
  await page.route(
    (url) => url.pathname === "/api/auth/capabilities",
    async (route) => {
      const real = await (await route.fetch()).json();
      await route.fulfill({ json: { ...real, ...change } });
    },
  );
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("without the subscription, Personal's Subscription page says what it adds, and the free month starts there", async ({ page }) => {
  const asked = await stubSubscription(page, "FREE");
  await page.goto("/app/plan");
  await settle(page);
  await showTabs(page);
  await openConsole(page);
  const console = consoleSheet(page);
  await consolePage(console, "Account");
  await console.getByRole("button", { name: /^Subscription/ }).click();
  const panel = console.getByTestId("subscription-panel");
  const prompt = panel.getByTestId("paid-prompt-debrief");
  await expect(prompt).toBeVisible({ timeout: slow(30000) });
  await expect(prompt).toContainText("$1 a month or $10 a year, the first month free");
  expect(asked).toEqual([]);

  await prompt.getByTestId("start-trial").click();
  await expect(prompt).toHaveCount(0);
  expect(asked).toEqual(["trial"]);
});

test("Personal's Subscription page says what the pilot has", async ({ page }) => {
  await stubSubscription(page, "TRIAL");
  await page.goto("/app/plan");
  await settle(page);
  await showTabs(page);
  await openConsole(page);
  const console = consoleSheet(page);
  await consolePage(console, "Account");
  const row = console.getByRole("button", { name: /^Subscription/ });
  await expect(row).toContainText(/Free until \d{1,2} November/);
  await row.click();
  const panel = console.getByTestId("subscription-panel");
  await expect(panel.getByTestId("subscription-standing")).toContainText(/Free until \d{1,2} November/);
  // What it adds, a row, where it was a footnote.
  await expect(panel).toContainText("The debrief");
});

// The proof of concept, at the owner's ask: no subscription sold and no
// word of one.
test.describe("where no subscription is sold", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("Personal has no Subscription row, and the terms and the privacy policy no word of one", async ({ page }) => {
    await sold(page, { subscriptions: false });
    await page.addInitScript(() => {
      localStorage.setItem("wingtip.tips", JSON.stringify({ state: { seen: ["*"] }, version: 0 }));
    });
    await page.goto("/app/plan");
    await settle(page);
    await openConsole(page);
    await consolePage(consoleSheet(page), "Account");
    await expect(consoleSheet(page).getByText("Subscription", { exact: true })).toHaveCount(0);
    for (const legal of ["/app/terms.html", "/app/privacy.html"]) {
      await page.goto(legal);
      await expect(page.locator("body")).not.toContainText(/subscri|free month/i);
    }
  });
});
