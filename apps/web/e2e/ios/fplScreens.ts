import { expect } from "@playwright/test";
import {
  controlsInSight,
  grabberTo,
  openProfile,
  openPanel,
  openTab,
  settle,
  showSearch,
  showTabs,
  sideDrawer,
  slow,
  stripShows,
} from "../helpers";
import { ROUTE } from "./screenRoute";
import type { Screen } from "./screens";

/** FPL's strip, route, procedures, nearest list and the altitude, departure and local-flight screens, in the audit's order. */
export const FPL_SCREENS: Screen[] = [
  // FPL with no route, all the way up: its strip showing the routes
  // planned last, from its filter (the Recents seeded in this browser:
  // nothing is written to the planner).
  {
    name: "FPL, Saved and Recents",
    ready: async (page) => {
      await page.addInitScript(() => {
        const kept = JSON.parse(localStorage.getItem("wingtip.preferences") ?? '{"state":{},"version":1}');
        kept.state.recentRoutes = [
          { dep: "C81", dest: "KDLH", stops: [], at: Date.UTC(2026, 9, 15, 15) },
          { dep: "C81", dest: "KMSP", stops: ["KLSE"], at: Date.UTC(2026, 9, 14, 15) },
        ];
        localStorage.setItem("wingtip.preferences", JSON.stringify(kept));
      });
      await page.goto("/app/plan");
      await settle(page);
      await showSearch(page);
      await grabberTo(page, "full");
      await stripShows(page, "fpl-strip-shows", "fpl-shows-recents");
      await expect(sideDrawer(page).getByTestId("route-recent").first()).toBeVisible();
    },
  },
  // The route's Procedures, its fields down a line in the order they are
  // flown, each runway's pattern a chip (the redesign's C), FPL's own all
  // the way up with the tops of climb and descent: the chips' hit areas
  // and their words measured as the rows' are.
  {
    name: "FPL, the route in order",
    ready: async (page) => {
      await page.route(
        (url) => /\/airport\/[^/]+\/procedures/.test(url.pathname),
        (route) => route.fulfill({ json: { airport: "KDLH", cycle: "261001", procedures: [] } }),
      );
      await page.goto(`/app/plan?${ROUTE}`);
      await settle(page);
      await openTab(page, "Nav Log");
      await expect(page.getByTestId("procedure-pattern").first()).toBeVisible({ timeout: slow(30000) });
    },
  },
  // The route's Procedures with an approach's own page open, as ForeFlight
  // picks one: its transitions and Add to Route under the map. The list
  // and the drawing stubbed, as procedures.spec has them: the FAA's file
  // is not read on CI's runner.
  {
    name: "procedures, an approach's page",
    ready: async (page) => {
      await page.route(
        (url) => /\/airport\/[^/]+\/procedures/.test(url.pathname),
        (route) => {
          const path = new URL(route.request().url()).pathname;
          if (path.endsWith("/KDLH/procedures")) {
            return route.fulfill({
              json: {
                airport: "KDLH",
                cycle: "261001",
                procedures: [
                  { kind: "approach", id: "I09", name: "ILS RWY 09", runway: "09", transitions: ["DLH"], runway_transitions: [] },
                ],
              },
            });
          }
          if (path.endsWith("/KDLH/procedures/I09")) {
            return route.fulfill({
              json: {
                airport: "KDLH",
                kind: "approach",
                id: "I09",
                name: "ILS RWY 09",
                transition: null,
                cycle: "261001",
                lines: [
                  {
                    role: "final",
                    name: null,
                    points: [
                      [46.84, -92.4],
                      [46.84, -92.3],
                      [46.842, -92.21],
                    ],
                  },
                ],
                holds: [],
                fixes: [
                  { ident: "FAKER", lat: 46.84, lon: -92.3, roles: ["FAF"], min_ft: 2700, max_ft: 2700, speed_kt: null, missed: false },
                ],
              },
            });
          }
          return route.fulfill({ json: { airport: "C81", cycle: "261001", procedures: [] } });
        },
      );
      await page.goto(`/app/plan?${ROUTE}`);
      await settle(page);
      await openTab(page, "Nav Log");
      await page
        .getByTestId("procedures")
        .getByRole("region", { name: "KDLH · Arrive" })
        .locator("[data-testid=procedure-kind][data-kind=approach]")
        .click({ timeout: slow(30000) });
      // The pull-down's foot opens the field's whole list (ProcedureMenu).
      await page.getByTestId("procedure-menu-all").click();
      await page.getByTestId("procedure-option").first().click();
      await expect(page.getByTestId("procedure-add")).toBeVisible();
    },
  },
  {
    name: "Nearest list",
    ready: async (page) => {
      await page.goto("/app/plan?near=1");
      await settle(page);
      await openPanel(page);
      await expect(sideDrawer(page).getByTestId("nearest-card")).toBeVisible();
    },
  },
  {
    name: "developer page, Perf tab",
    ready: async (page) => {
      await page.goto("/app/dev");
      await settle(page);
      await showTabs(page);
      await page.getByTestId("tab-perf").click();
      // The training page's pill is its tabs: Perf all the way up.
      await grabberTo(page, "full");
      await expect(sideDrawer(page).getByTestId("perf-panel").getByText("Model comparison")).toBeVisible({ timeout: slow(30000) });
    },
  },
  {
    // The route's box of pills -- an airport landed at and a waypoint
    // flown through -- and the airplane, the time and the actions under it.
    name: "route box with stops",
    ready: async (page) => {
      await page.route(
        (url) => /\/(checkpoints|navlog|briefing)$/.test(url.pathname) && url.searchParams.get("stops") === "VPBNG,KMSN",
        (route) => route.abort(),
      );
      await page.goto(`/app/plan?${ROUTE}&stops=VPBNG,KMSN&view=briefing`);
      await controlsInSight(page);
      await expect(page.getByTestId("route-box")).toBeVisible({ timeout: slow(30000) });
      await expect(page.getByTestId("stop")).toHaveCount(2);
    },
  },
  {
    // No legal altitude's mark beside the Nav Log, its sheet open: the
    // reasons and the ways round the high ground.
    name: "no legal altitude, opened",
    ready: async (page) => {
      await page.route("**/api/planner/navlog**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/x-ndjson",
          body:
            JSON.stringify({
              type: "error",
              retry: false,
              detail: "No legal VFR cruising altitude 1-15 nm along the route",
              reasons: ["The terrain and obstacles there need 10,600 ft."],
              advice: "Route around the high ground.",
              detours: [{ ident: "BEPKE", kind: "GPS waypoint", added_nm: 5.9, stop_index: 0, via: ["BEPKE"] }],
            }) + "\n",
        }),
      );
      await page.goto(`/app/plan?${ROUTE}&view=briefing`);
      await controlsInSight(page);
      await openProfile(page);
      await expect(page.getByTestId("unflyable-add-stop")).toBeVisible();
    },
  },
  {
    // The altitude set on the profile (the owner's pick, 2026-11-10): the
    // previewing slider beside the route from the side, its Set, and the
    // Altitude Advisor under it.
    name: "altitude on the profile",
    ready: async (page) => {
      await page.goto(`/app/plan?${ROUTE}`);
      await settle(page);
      await controlsInSight(page);
      await expect(page.getByTestId("altitude-why")).toHaveAccessibleName(/feet|FL/, { timeout: slow(60000) });
      await openProfile(page);
      await expect(page.getByTestId("altitude-wheel")).toBeVisible();
      await expect(page.getByTestId("altitude-advisor")).toBeVisible();
    },
  },
  {
    name: "departure picker",
    ready: async (page) => {
      await page.goto(`/app/plan?${ROUTE}&view=briefing`);
      await controlsInSight(page);
      await page.getByTestId("depart-date").click({ timeout: slow(30000) });
      await page.locator('[data-slot="calendar"] td [role="button"]:not([aria-disabled="true"]):not([data-outside-month])').last().click();
      await expect(page.getByTestId("depart-time")).toBeVisible();
      // The plan made again for that day, its arrival in behind the sheet:
      // not judged greyed out mid-plan.
      await expect(page.getByTestId("navlog-fuel")).toBeAttached({ timeout: slow(120000) });
    },
  },
  {
    // The planner down: the one line by the map's buttons, Try again.
    name: "a service out",
    ready: async (page) => {
      await page.route("**/api/planner/**", (route) =>
        route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ detail: "planner service unreachable" }) }),
      );
      await page.goto(`/app/plan?${ROUTE}`);
      await expect(page.locator("[data-problem-banner]").getByRole("button", { name: "Try again" })).toBeVisible({ timeout: slow(30000) });
    },
  },
  {
    name: "local flight",
    ready: async (page) => {
      await page.goto("/app/plan?dep=C81&dest=C81&view=briefing");
      await expect(page.locator('[data-slot="section-summary"]').first()).toContainText("Aloft", { timeout: slow(30000) });
      // Its fuel required among the figures.
      await openTab(page, "Local");
      await expect(page.getByTestId("navlog-fuel")).toBeVisible({ timeout: slow(30000) });
    },
  },
];
