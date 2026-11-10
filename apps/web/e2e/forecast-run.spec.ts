import { test, expect } from "@playwright/test";
import { openPanel, openProfile, pressDryRunStart, settle, sideDrawer, slow } from "./helpers";

/**
 * The dry run played against the forecast (features/plan/forecastRun):
 * forecast mode on among the run's controls, the run is sent once to the
 * planner (stubbed here: the weather on CI's runner is whatever the day
 * brings) and its strip shows each leg's hour and forecast category, what
 * the airplane meets now and, once reached, the alert with its source.
 */
test("forecast mode plays the dry run against the forecast: the legs' hours and categories, and the alert cited", async ({ page }) => {
  let asked: { track: { t: number; row: number }[]; fields: { role: string }[]; rules: string } | null = null;
  await page.route(
    (url) => url.pathname.endsWith("/api/forecast/run"),
    async (route) => {
      asked = route.request().postDataJSON();
      const t0 = asked!.track[0]!.t;
      await route.fulfill({
        json: {
          samples: asked!.track.map((p, i) => ({
            t: p.t,
            lat: 46,
            lon: -91,
            category: i === 0 ? "VFR" : "IFR",
            ceiling_ft: i === 0 ? null : 800,
            ceiling_unknown: false,
            visibility_sm: i === 0 ? 10 : 2,
            source: "TAF KDLH",
            wind_dir_true_deg: 270,
            wind_speed_kt: 25,
            areas: [],
          })),
          legs: [
            { row: 1, from_t: t0, to_t: t0 + 1800, category: "VFR", worst_t: null },
            { row: 2, from_t: t0 + 1800, to_t: t0 + 3600, category: "IFR", worst_t: t0 + 1800 },
          ],
          fields: [],
          areas: [],
          alerts: [
            {
              t: t0,
              lat: 46,
              lon: -91,
              kind: "vfr_minimums",
              words: "At 1400Z the forecast is under VFR minimums: ceiling 800 ft, under 1,000 ft",
              source: "14 CFR 91.155; TAF KDLH",
            },
          ],
          unavailable: ["spc-outlook"],
        },
      });
    },
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await openProfile(page);
  const panel = sideDrawer(page);
  const start = panel.getByTestId("dry-run-start");
  await expect(start).toBeVisible({ timeout: slow(60_000) });
  await pressDryRunStart(page, start);
  await expect(panel.getByTestId("dry-run")).toBeVisible();

  const toggle = panel.getByTestId("dry-run-forecast");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  const legs = panel.getByTestId("forecast-run-legs");
  await expect(legs).toBeVisible({ timeout: slow(10_000) });
  await expect(legs.locator("[data-category]")).toHaveCount(2);
  await expect(legs.locator('[data-category="IFR"]')).toContainText("IFR");
  await expect(panel.getByTestId("forecast-run-alert")).toContainText("Source: 14 CFR 91.155; TAF KDLH");
  await expect(panel.getByTestId("forecast-run")).toContainText("Played without the SPC outlook.");
  // Sent from the departure, VFR, its points each with the row it flies to.
  expect(asked!.rules).toBe("VFR");
  expect(asked!.fields[0]!.role).toBe("departure");
  expect(asked!.track.at(-1)!.row).toBeGreaterThan(0);

  // Off again: the strip goes.
  await toggle.click();
  await expect(panel.getByTestId("forecast-run")).toHaveCount(0);
});
