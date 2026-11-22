import { test, expect } from "@playwright/test";
import fixture from "../src/lib/fixtures/routeFile.json" with { type: "json" };
import { noTips, openPanel, settle, sideDrawer, slow } from "./helpers";
import { planFromSearch } from "./oneSearch";

/**
 * A route file opened from FPL's empty route (Open a Route File; or
 * dropped on its card): read by the engine (route_file_read), previewed
 * as a shared flight is, the pilot's plan untouched until Use This Plan.
 * The files are the shared fixture's (apps/web/src/lib/fixtures/routeFile.json).
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(noTips);
});

const [fpl, gpx] = fixture.cases;

async function openFile(page: import("@playwright/test").Page, name: string, text: string) {
  await page.goto("/app/plan");
  await settle(page);
  await openPanel(page);
  await planFromSearch(page);
  const empty = sideDrawer(page).getByTestId("route-empty");
  await expect(empty.getByTestId("timeline-open-route-file")).toHaveText("Open a Route File");
  await page.getByTestId("route-file-input").setInputFiles({ name, mimeType: "", buffer: Buffer.from(text) });
}

test(
  "a Garmin .fpl opens as a preview, its user point named off a fix, and Use This Plan plans it",
  { tag: "@smoke" },
  async ({ page }) => {
    await openFile(page, "KMSN-KOSH.fpl", fpl!.text);
    const sheet = page.getByTestId("shared-flight");
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("Route File");
    await expect(sheet).toContainText("KMSN TO KOSH");
    await expect(sheet.getByTestId("route-file-point")).toHaveCount(4);
    // Nothing planned yet.
    await expect(page).not.toHaveURL(/[?&]dep=/);

    // The user waypoint goes in as the pilot's own point off the nearest fix.
    await sheet.getByTestId("shared-flight-use").click({ timeout: slow(15_000) });
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/[?&]dep=KMSN/);
    await expect(page).toHaveURL(/[?&]dest=KOSH/);
    await expect(page).toHaveURL(/[?&]stops=MSN(%2C|,)[A-Z0-9]+(%2F|\/)\d{3}(%2F|\/)/);
  },
);

test("a GPX route previews too, and Not Now keeps the plan as it was", async ({ page }) => {
  await openFile(page, "trip.gpx", gpx!.text);
  const sheet = page.getByTestId("shared-flight");
  await expect(sheet).toContainText("C81 to KJVL");
  await page.getByTestId("shared-flight-not-now").click();
  await expect(sheet).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]dep=/);
});

test("a file that is not a route says so in the preview, with nothing to use", async ({ page }) => {
  await openFile(page, "notes.gpx", "not a route");
  await expect(page.getByTestId("route-file-problem")).toHaveText("This file is not a flight plan (.fpl) or a GPX route.");
  await expect(page.getByTestId("shared-flight-use")).toHaveCount(0);
});
