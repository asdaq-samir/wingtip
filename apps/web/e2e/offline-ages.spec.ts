import { test, expect } from "@playwright/test";
import { settle, sideDrawer, slow, withFoot } from "./helpers";

/**
 * What a pilot reads with a poor or lost connection (the offline audit of
 * 2026-11-21): a TAF kept past its valid period says it has run out, never
 * reads as today's forecast (the engine's taf_validity, FAA-H-8083-28B
 * 27.4.1); an airport card nothing was kept for says "No connection" in
 * place rather than "Fetching" for good, and fills by itself once the
 * connection is back (lib/problems' noConnection, lib/queryClientCore's
 * ask again on the online event). Nightly (scripts/ci/test_tiers_nightly.txt).
 */

const two = (n: number) => String(n).padStart(2, "0");

test("a TAF kept past its valid period says it has expired, in the caution colour", async ({ page }) => {
  // A TAF issued three days ago and valid for a day: long run out.
  const issued = new Date(Date.now() - 3 * 86_400_000);
  const ended = new Date(Date.now() - 2 * 86_400_000);
  const taf = `TAF KDLH ${two(issued.getUTCDate())}0530Z ${two(issued.getUTCDate())}06/${two(ended.getUTCDate())}06 18010KT P6SM SKC`;
  await page.route(
    (url) => url.pathname === "/api/planner/airport/KDLH",
    async (route) => {
      const real = await route.fetch();
      const body = { ...(await real.json()), taf };
      await route.fulfill({ response: real, json: body });
    },
  );
  await page.goto("/app/plan?place=KDLH");
  await settle(page);
  const card = sideDrawer(page).getByTestId("place-card");
  await expect(card).toBeVisible({ timeout: slow(30_000) });
  await withFoot(card).getByTestId("place-tab-weather").click();
  const line = card.getByTestId("place-taf-valid");
  await expect(line).toHaveAttribute("data-state", "expired", { timeout: slow(20_000) });
  await expect(line).toContainText(`TAF expired ${ended.getUTCDate()} 0600Z: no forecast in force`);
  await expect(line).toHaveClass(/text-caution-ink/);
});

test("an airport card nothing was kept for says No connection, and fills once the connection is back", async ({ page, context }) => {
  let offline = true;
  await page.route(
    (url) => url.pathname === "/api/planner/airport/KMSN",
    (route) => (offline ? route.abort("internetdisconnected") : route.fallback()),
  );
  await page.goto("/app/plan?place=KMSN");
  await settle(page);
  const card = sideDrawer(page).getByTestId("place-card");
  await expect(card).toBeVisible({ timeout: slow(30_000) });
  await expect(card.getByTestId("place-line")).toHaveText("No connection", { timeout: slow(20_000) });
  await expect(card.getByText("Fetching the airport…")).toHaveCount(0);

  // Back: the browser's online event asks it again at once.
  await context.setOffline(true);
  offline = false;
  await context.setOffline(false);
  await expect(card.getByTestId("place-line")).toHaveCount(0, { timeout: slow(45_000) });
  await expect(withFoot(card).getByTestId("place-tab-weather")).toBeEnabled();
});
