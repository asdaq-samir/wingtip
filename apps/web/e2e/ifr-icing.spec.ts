import { test, expect } from "@playwright/test";
import { openSection, openTab, settle, slow } from "./helpers";
import { pickAirplane } from "./startState";

test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

// A route's handler still running as the test ends -- the Recents and Saved planned ahead at idle ask the planner then -- found the page
// closed and failed the test (navlog-fit.spec, CI, 2026-10-28): the handlers taken off, their errors let go, as each test ends.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("under IFR a leg in cloud at or above the freezing level is icing possible, in the Go / No-Go and the adverse conditions", async ({
  page,
}) => {
  test.slow();
  await page.addInitScript(() => {
    const kept = JSON.parse(localStorage.getItem("wingtip.preferences") ?? '{"state":{},"version":0}');
    localStorage.setItem(
      "wingtip.preferences",
      JSON.stringify({ ...kept, state: { ...kept.state, flightRules: "ifr", waypoints: false } }),
    );
  });
  // The day's weather pinned: the freezing level at 2,000 ft with cloud,
  // under any IFR altitude out of C81, a report of moderate icing, and no
  // hazard or alternate to say anything first.
  await page.route("**/api/planner/navlog?*", async (route) => {
    const response = await route.fetch();
    const body = (await response.text())
      .split("\n")
      .map((line) => {
        if (!line.trim()) return line;
        const message = JSON.parse(line);
        if (message.type === "altitude")
          Object.assign(message.altitude_selection, { freezing_level_ft: 2000, freezing_level_at_or_below: false, icing_possible: true });
        return JSON.stringify(message);
      })
      .join("\n");
    await route.fulfill({ response, body });
  });
  await page.route("**/api/planner/briefing?*", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    Object.assign(json, {
      hazards: [],
      gairmets: [],
      vfr_not_recommended: [],
      pireps: [
        {
          observed_at: null,
          altitude_ft: 6000,
          aircraft: "C172",
          urgent: false,
          turbulence: null,
          icing: "MOD",
          raw: "UA /OV DLH/FL060/TP C172/IC MOD RIME",
          along_track_nm: 120,
        },
      ],
    });
    await route.fulfill({ response, json });
  });
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/alternate"),
    (route) =>
      route.fulfill({
        json: {
          destination: {
            ident: "KDLH",
            approach: true,
            ceiling_ft: null,
            visibility_sm: 6,
            taf: "TAF KDLH ...",
            required: false,
            reasons: [],
          },
          alternate: null,
          suggestions: [],
        },
      }),
  );
  // The AWC's forecast icing says nothing here: its own test is below.
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/icing/route"),
    (route) => route.fulfill({ json: { legs: [], worst: null, unchecked: [], line: null, issued: "2026-11-08T14:00:00Z" } }),
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await page.getByTestId("sidebar-trigger-button").click();
  await openTab(page, "Brief");
  const weather = page.getByTestId("verdict-weather");
  await expect(weather).toContainText(/Icing possible at [\d,]+ ft: the freezing level at 2,000 ft, in cloud; 1 pilot report of icing/, {
    timeout: slow(90000),
  });
  await expect(weather).toHaveAttribute("data-finding", "caution");
  await openTab(page, "Weather");
  await openSection(page, "Adverse Conditions");
  const alert = page.getByTestId("icing-alert");
  await expect(alert).toContainText("14 CFR 91.9(a)");
  await expect(page.getByTestId("icing-flag")).toBeVisible();
});

test("under IFR the AWC's forecast icing at the altitude flown is a caution, leg by leg in the adverse conditions", async ({ page }) => {
  test.slow();
  await page.addInitScript(() => {
    const kept = JSON.parse(localStorage.getItem("wingtip.preferences") ?? '{"state":{},"version":0}');
    localStorage.setItem(
      "wingtip.preferences",
      JSON.stringify({ ...kept, state: { ...kept.state, flightRules: "ifr", waypoints: false } }),
    );
  });
  // Nothing else to say first: no freezing level in reach, no hazard, no
  // alternate needed.
  await page.route("**/api/planner/navlog?*", async (route) => {
    const response = await route.fetch();
    const body = (await response.text())
      .split("\n")
      .map((line) => {
        if (!line.trim()) return line;
        const message = JSON.parse(line);
        if (message.type === "altitude") Object.assign(message.altitude_selection, { freezing_level_ft: null, icing_possible: false });
        return JSON.stringify(message);
      })
      .join("\n");
    await route.fulfill({ response, body });
  });
  await page.route("**/api/planner/briefing?*", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    Object.assign(json, { hazards: [], gairmets: [], vfr_not_recommended: [], pireps: [] });
    await route.fulfill({ response, json });
  });
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/alternate"),
    (route) =>
      route.fulfill({
        json: {
          destination: {
            ident: "KDLH",
            approach: true,
            ceiling_ft: null,
            visibility_sm: 6,
            taf: "TAF KDLH ...",
            required: false,
            reasons: [],
          },
          alternate: null,
          suggestions: [],
        },
      }),
  );
  // The engine's answer for the legs asked (icing_forecast_route): moderate
  // on the first leg at its altitude, the rest clear.
  let asked: URLSearchParams | null = null;
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/icing/route"),
    (route) => {
      asked = new URL(route.request().url()).searchParams;
      const altitudes = (asked.get("alt_ft") ?? "").split(",").map(Number);
      return route.fulfill({
        json: {
          legs: altitudes.map((altitude_ft, index) => ({
            index,
            altitude_ft,
            severity: index === 0 ? "moderate" : "none",
            share: index === 0 ? 0.5 : 0,
            layer: index === 0 ? { bottom_ft: 4000, top_ft: 9000 } : null,
            valid_s: 1794195000,
          })),
          worst: { severity: "moderate", altitudes_ft: [altitudes[0]], legs: [0] },
          unchecked: [],
          line: `Forecast icing, moderate, at ${altitudes[0]!.toLocaleString("en-US")} ft on leg 1`,
          issued: "2026-11-08T14:00:00Z",
        },
      });
    },
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await page.getByTestId("sidebar-trigger-button").click();
  await openTab(page, "Brief");
  const weather = page.getByTestId("verdict-weather");
  await expect(weather).toContainText(/Forecast icing, moderate, at [\d,]+ ft on leg 1/, { timeout: slow(90000) });
  await expect(weather).toHaveAttribute("data-finding", "caution");
  // Asked with the nav log's legs: one more fix than altitudes.
  const query = asked as URLSearchParams | null;
  expect(query!.get("fixes")!.split(";")).toHaveLength(query!.get("alt_ft")!.split(",").length + 1);
  await openTab(page, "Weather");
  await openSection(page, "Adverse Conditions");
  await expect(page.getByTestId("icing-flag")).toContainText("Icing forecast");
  const rows = page.getByTestId("icing-forecast-leg");
  await expect(rows.first()).toContainText(/Moderate at [\d,]+ ft, 50% of it/);
  await expect(rows.first()).toContainText("Icing forecast 4,000–9,000 ft");
});
