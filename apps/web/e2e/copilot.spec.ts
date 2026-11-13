import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { openPanel, openProfile, pressDryRunStart, settle, sideDrawer, slow } from "./helpers";
import { closeMapSettings, openSettingsPage } from "./mapCard";
import { pickAirplane } from "./startState";
test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

/**
 * The in-flight copilot (features/copilot): flying the dry run from KUGN
 * to KOSH, the planner's reads round the airplane stubbed with Oshkosh
 * gone IFR, the copilot's one message is over the map with the field to
 * go to instead, and its sources under a tap. What it decides is the
 * engine's copilot_watch, tested against the same fixture
 * (engine/facade/tests/copilot.rs, features/copilot/copilotInput.test.ts).
 */

type Field = { ident: string; metar: { raw: string | null; flight_category: string | null } | null; planned_category?: string };
const FIELDS = (
  JSON.parse(readFileSync(new URL("../src/lib/fixtures/copilot.json", import.meta.url), "utf8")) as { base: { fields: Field[] } }
).base.fields;
const IFR = "SPECI KOSH 091712Z 34012KT 2SM BR OVC008 08/07 A2992";

async function stubAround(page: Page) {
  const fields = FIELDS.map(({ planned_category: _, ...f }) =>
    f.ident === "KOSH" ? { ...f, metar: { raw: IFR, flight_category: "IFR" } } : f,
  );
  await page.route(
    (url) => url.pathname.endsWith("/copilot/around"),
    (route) => route.fulfill({ json: { fields, areas: [], itws: [], unavailable: [], at: Date.now() / 1000 } }),
  );
}

async function startDryRun(page: Page) {
  await page.goto("/app/plan?dep=KUGN&dest=KOSH");
  await settle(page);
  await openPanel(page);
  await openProfile(page);
  const start = sideDrawer(page).getByTestId("dry-run-start");
  await expect(start).toBeVisible({ timeout: slow(60_000) });
  await pressDryRunStart(page, start);
  await expect(page.locator('[data-own-ship="on"]')).toHaveCount(1);
}

test("the copilot is a choice of Settings' ATC page", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await openSettingsPage(page, "atc");
  const mode = page.getByTestId("copilot-mode");
  await expect(mode.getByRole("button", { name: "On" })).toHaveAttribute("aria-pressed", "true");
});

test("flying the dry run, Oshkosh gone IFR is said with a field to go to and its METAR under a tap", async ({ page }) => {
  await stubAround(page);
  await startDryRun(page);
  const banner = page.locator('[data-copilot-banner="weather"]');
  await expect(banner).toBeVisible({ timeout: slow(20_000) });
  await expect(banner.getByTestId("copilot-title")).toContainText("KOSH is IFR");
  await expect(banner.getByTestId("copilot-title")).toContainText("is VFR");
  await banner.getByTestId("copilot-title").click();
  await expect(banner.locator("[data-copilot-source]").first()).toContainText("METAR SPECI KOSH");
  // OK puts that message away for the flight.
  await banner.getByTestId("copilot-dismiss").click();
  await expect(banner).toHaveCount(0);
});

test("with the copilot off nothing is said in flight", async ({ page }) => {
  await stubAround(page);
  await page.goto("/app/plan");
  await settle(page);
  await openSettingsPage(page, "atc");
  await page.getByTestId("copilot-mode").getByRole("button", { name: "Off" }).click();
  await closeMapSettings(page);
  await startDryRun(page);
  await expect(page.getByTestId("flying-head")).toBeVisible({ timeout: slow(10_000) });
  await expect(page.locator("[data-copilot-banner]")).toHaveCount(0);
});
