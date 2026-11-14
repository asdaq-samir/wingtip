import { test, expect } from "@playwright/test";
import { settle, slow, openNavLog, navLogSheet } from "./helpers";
import { pickAirplane } from "./startState";
test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

/**
 * The diversion drill (DiversionDrill, lib/diversion): over a checkpoint,
 * against the clock, a field picked and the estimates checked against
 * the exact solution. The fields round the point are put in the planner's
 * answer (/api/emergency/fields), placed from the point it is asked
 * about, so the engine's pick (best_fields, diversion) and each course are
 * known: one under the point, a closed one, a private one, a public one
 * east and one south with no report.
 */
test("a diversion over a checkpoint: the clock, a field picked, and the estimates marked", async ({ page }) => {
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/emergency/fields"),
    (route) => {
      const asked = new URL(route.request().url());
      const lat = Number(asked.searchParams.get("lat"));
      const lon = Number(asked.searchParams.get("lon"));
      const east = 1 / (60 * Math.cos((lat * Math.PI) / 180));
      const runway = (length_ft: number) => ({
        closed: false,
        surface: "ASPH",
        length_ft,
        runway_ends: [
          { ident: "18", heading_true_deg: 180 },
          { ident: "36", heading_true_deg: 0 },
        ],
      });
      const vfr = { flight_category: "VFR", dir_true_deg: 360, speed_kt: 5 };
      const field = (ident: string, name: string, north: number, eastNm: number, over: Record<string, unknown>) => ({
        ident,
        name,
        lat: lat + north / 60,
        lon: lon + eastNm * east,
        elevation_ft: 800,
        towered: false,
        private: false,
        military: null,
        status: "O",
        distance_nm: 0,
        bearing_deg: 0,
        frequencies: [],
        metar: vfr,
        runways: [runway(4000)],
        ...over,
      });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          fields: [
            field("HERE", "Under Us", 0.2, 0, { runways: [runway(2000)] }),
            field("SHUT", "Closed Strip", 3, 0, { status: "CI" }),
            field("PRIV", "Owner's Strip", -5, 0, { private: true }),
            field("KAAA", "Near Field", 0, 9, {}),
            field("KBBB", "Far Field", -18, 0, { metar: null, runways: [runway(6000)] }),
          ],
        }),
      });
    },
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await page.getByTestId("sidebar-trigger-button").click();
  await openNavLog(page);
  const rows = navLogSheet(page).locator("[data-kind=checkpoint]");
  await expect(rows.first()).toBeVisible({ timeout: slow(120000) });
  await rows.first().click();
  await navLogSheet(page).getByTestId("diversion-drill").first().click();

  const sheet = page.getByTestId("diversion-content");
  await sheet.getByTestId("diversion-start").click();
  await expect(sheet.getByTestId("diversion-clock")).toContainText("On the clock");
  // The field under the point is not a diversion, and one NASR lists as
  // closed never offered (decision 0043); how far and which way are not
  // given; the private field says who may land there.
  const fields = sheet.getByTestId("diversion-field");
  await expect(fields).toHaveCount(3);
  await expect(sheet).not.toContainText("SHUT");
  await expect(fields.first()).toContainText("KAAA");
  await expect(fields.first()).not.toContainText("9 nm");
  await expect(fields.filter({ hasText: "PRIV" })).toContainText("Private: permission required");
  await expect(sheet.getByTestId("diversion-check")).toBeDisabled();

  await fields.filter({ hasText: "KBBB" }).click();
  await sheet.getByTestId("diversion-mh-input").fill("90");
  await sheet.getByTestId("diversion-ete-input").fill("10");
  await sheet.getByTestId("diversion-check").click();

  await expect(sheet.getByTestId("diversion-clock")).toContainText("You took");
  // South to KBBB: a heading of 090 is no estimate of it.
  await expect(sheet.getByTestId("diversion-mh")).toContainText("Not quite");
  await expect(sheet.getByText("To KBBB, worked out")).toBeVisible();
  // The engine's pick by runway, weather and time, a public field before
  // the private one nearer.
  await expect(sheet.getByTestId("diversion-nearest")).toContainText("The best by runway, weather and time was KAAA, 9 nm");
  // Not typed, not marked.
  await expect(sheet.getByTestId("diversion-fuel")).not.toContainText("Not quite");
  await page.unrouteAll({ behavior: "ignoreErrors" });
});
