import { test, expect } from "@playwright/test";
import { library, openConsole, showTabs } from "./helpers";

/**
 * Airplane mode: a list asked for with no connection says "No connection"
 * in place, never "could not be fetched" as if the server were at fault,
 * and answers by itself once the phone is back, with no Try again.
 * TanStack Query's own retries do the asking (lib/queryRetry), paused by
 * its online manager while the browser is offline and going on as it
 * comes back; the hand-built re-ask (lib/whenBack) is gone.
 */

const A_PILOT = { id: 1, email: "pilot@example.com", displayName: "A Pilot", developer: false };

test("a list asked for in airplane mode says No connection, and answers by itself once back", async ({ page, context }) => {
  await page.route("**/api/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(A_PILOT) }));
  // No connection from the first ask: the request never answered.
  let offline = true;
  await page.route("**/api/logbook", (route) =>
    offline ? route.abort("internetdisconnected") : route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.goto("/app/plan");
  await showTabs(page);
  await openConsole(page);
  await context.setOffline(true);

  const console = page.getByTestId("console-sheet");
  await library(console, "Logbook");
  await expect(console.getByText(/No connection\./)).toBeVisible();
  await expect(console.getByText("Your logbook could not be fetched.")).toHaveCount(0);

  // Back: asked again by itself -- a dropped query waits at most the half
  // minute between its retries (lib/queryRetry's retryDelay).
  offline = false;
  await context.setOffline(false);
  await expect(console.getByText("No flights logged yet: Add Entry logs one.")).toBeVisible({ timeout: 45_000 });
});
