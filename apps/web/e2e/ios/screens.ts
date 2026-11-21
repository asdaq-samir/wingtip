import { expect, type Page } from "@playwright/test";
import { controlsInSight, openNavLog, grabberTo, openSection, openTab, settle, sideDrawer, slow, frontSheet } from "../helpers";
import { markWith } from "../marks";

/** One state of the app as a pilot sees it, reached from a fresh page. */
import { SEARCH_SCREENS } from "./searchScreens";
import { CONSOLE_SCREENS } from "./consoleScreens";
import { FPL_SCREENS } from "./fplScreens";
import { ROUTE } from "./screenRoute";

export type Screen = { name: string; ready: (page: Page) => Promise<void> };

/**
 * The screens the iOS audit measures: the planner's map, its panel and the nav log with a leg open, the one search's places,
 * an airport's card, the training drawer with a waypoint open, both consoles and the settings. Nothing is written: a row is selected,
 * never rated, and no note is typed.
 */
export const SCREENS: Screen[] = [
  {
    name: "map",
    ready: async (page) => {
      await page.goto(`/app/plan?${ROUTE}`);
      await settle(page);
      // The route's marks drawn, and the plan in, the capsule at rest over
      // it: its checkpoints drawn and the progress toast gone.
      await expect.poll(markWith(page, "route-marks", /^\d+$/), { timeout: slow(30000) }).not.toBeNull();
      await expect(page.locator("[data-slot=toast]")).toHaveCount(0, { timeout: slow(30000) });
    },
  },
  {
    // All the way up: the route open to edit (on a phone the sheet's
    // height opens it, decision 0047), its cards, its field and the figures
    // (FPL's own, the nav log a sheet of its own, the Brief a card of its own).
    name: "flight planning drawer",
    ready: async (page) => {
      await page.goto(`/app/plan?${ROUTE}&view=full`);
      await expect(sideDrawer(page).getByTestId("route-head").or(sideDrawer(page).getByTestId("route-summary")).first()).toBeVisible({
        timeout: slow(30000),
      });
      await expect(sideDrawer(page).getByTestId("navlog-ete")).toBeVisible({ timeout: slow(120000) });
    },
  },
  {
    // Half way: the route's box, the airplane, the time, the Nav log and
    // Share, the figures at the card's foot.
    name: "route panel, half way",
    ready: async (page) => {
      await page.goto(`/app/plan?${ROUTE}&view=full`);
      await expect(sideDrawer(page).getByTestId("route-brief")).toBeVisible({ timeout: slow(30000) });
      await controlsInSight(page);
      // The plan in, its figures whole: not judged fading in.
      await expect(page.getByTestId("navlog-ete")).toBeVisible({ timeout: slow(30000) });
      await expect(page.getByTestId("share-route")).toBeEnabled();
    },
  },
  {
    name: "nav log, a leg open",
    ready: async (page) => {
      await page.goto(`/app/plan?${ROUTE}&view=full`);
      // Not tapped when it is up already: a tap on the tab up takes the
      // panel back to half, and the map's tooltips came up under the
      // pointer where the panel had been, fading in, read at 1:1 (P15).
      await openTab(page, "Nav Log");
      await page.getByTestId("navlog-ete").waitFor({ timeout: slow(120000) });
      // The nav log in its own sheet, from the route's box.
      await openNavLog(page);
      // A tap's click, without Playwright's own scroll into view first:
      // where the table is wider than its drawer (every column, on a
      // phone on its side or an iPad), that scrolled it to its far end,
      // which no finger does.
      await page.locator('[role="row"][data-kind="checkpoint"]').nth(2).dispatchEvent("click");
      await expect(page.getByTestId("navlog-list").locator("textarea").first()).toBeVisible();
    },
  },
  // The Brief's pages, each laid out once its briefing is in.
  ...(
    [
      ["Preflight", "verdict"],
      ["Depart", "takeoff-landing"],
      ["En Route", "weather-places"],
      ["Arrive", "weather-places"],
    ] as const
  ).map(([tab, shown]): Screen => ({
    name: `panel, ${tab} tab`,
    ready: async (page) => {
      await page.goto(`/app/plan?${ROUTE}&view=full`);
      await page.getByTestId("navlog-ete").waitFor({ timeout: slow(120000) });
      await openTab(page, tab);
      if (tab === "En Route") await openSection(page, "Along the Route");
      await expect(sideDrawer(page).locator('[role="tabpanel"]:not([hidden]):not([inert])').getByTestId(shown).first()).toBeVisible({
        timeout: slow(30000),
      });
      // And the briefing in: the Brief's Go / No-Go says what it found.
      if (tab === "Preflight") {
        await expect(sideDrawer(page).getByTestId("verdict-weather")).not.toHaveAttribute("data-finding", "pending", {
          timeout: slow(60000),
        });
      }
    },
  })),
  // An airport's card half way, its pictures across the top, its actions
  // and its tabs right under them (A2, the tabs back); all the way up on
  // Info; and on Weather, the hourly card over the reports.
  ...["", ", all the way up", ", its Weather tab"].map((part) => ({
    name: `airport card${part}`,
    ready: async (page: Page) => {
      await page.goto(`/app/plan?${ROUTE}&place=KDLH`);
      await expect(page.getByTestId("place-name")).toHaveText("KDLH", { timeout: slow(30000) });
      await expect(page.getByTestId("fly-here")).toBeEnabled({ timeout: slow(30000) });
      if (part === ", all the way up") {
        await grabberTo(page, "full");
        await expect(sideDrawer(page).getByTestId("place-details")).toBeVisible();
      }
      if (part === ", its Weather tab") {
        await sideDrawer(page).getByTestId("place-tab-weather").click();
        await expect(frontSheet(page)).toHaveAttribute("data-panel", "full");
        await expect(sideDrawer(page).getByTestId("place-weather-summary")).toBeVisible();
      }
    },
  })),
  {
    name: "training drawer, a waypoint open",
    ready: async (page) => {
      await page.goto(`/app/dev?${ROUTE}`);
      await settle(page);
      await grabberTo(page, "full");
      const rows = sideDrawer(page).locator("[data-waypoint-row]");
      await expect.poll(() => rows.count(), { timeout: slow(60000) }).toBeGreaterThan(10);
      await rows.nth(2).click();
      await expect(sideDrawer(page).getByTestId("rating-card").getByRole("button", { name: "Rate 5" })).toBeVisible();
    },
  },
  ...CONSOLE_SCREENS,
  ...SEARCH_SCREENS,
  // An airplane's card in the air, half way as it opens: its pictures
  // across the top (no photo: the stand-in), Follow, Alert, Debrief and
  // the star, the flight it is on (adsb.lol and Planespotters stubbed);
  // then its Alert's menu open; and all the way up, its one scroll.
  ...["card", "Alert menu", "card all the way up"].map((part) => ({
    name: `an airplane's ${part}`,
    ready: async (page: Page) => {
      const now = Date.now() / 1000;
      const plane = {
        hex: "a89c1e",
        callsign: "N654FL",
        registration: "N654FL",
        type: "P28A",
        lat: 42.35,
        lon: -88.0,
        altitude_ft: 4500,
        pressure_altitude: false,
        track_deg: 45,
        speed_kt: 112,
        vertical_fpm: 500,
        seen_s: 0.5,
        squawk: "1200",
      };
      const c81 = { ident: "C81", name: "Campbell Airport", city: "Grayslake", region: "US-IL" };
      await page.route(
        (url) => url.pathname.endsWith("/api/planner/traffic"),
        (route) => route.fulfill({ json: { aircraft: [plane], age_s: 1, source: "adsb.lol", license: "ODbL 1.0" } }),
      );
      await page.route(
        (url) => /\/api\/planner\/traffic\/flight\/a89c1e\/history$/.test(url.pathname),
        (route) =>
          route.fulfill({
            json: {
              hex: "a89c1e",
              registration: "N654FL",
              type: "P28A",
              flights: [
                {
                  id: Math.floor(now - 3600),
                  origin: c81,
                  destination: null,
                  off: now - 3600,
                  on: now - 5,
                  landed: false,
                  in_air: true,
                  max_alt_ft: 4500,
                },
                {
                  id: Math.floor(now - 90000),
                  origin: c81,
                  destination: c81,
                  off: now - 90000,
                  on: now - 86100,
                  landed: true,
                  in_air: false,
                  max_alt_ft: 3000,
                },
              ],
            },
          }),
      );
      await page.route(
        (url) => /\/api\/planner\/traffic\/flight\/a89c1e$/.test(url.pathname),
        (route) =>
          route.fulfill({
            json: {
              hex: "a89c1e",
              registration: "N654FL",
              type: "P28A",
              description: "PIPER PA-28-140/150/160/180",
              operator: "RYALIS LLC",
              departed: { ident: "C81", name: "Campbell Airport", at: now - 3600 },
              trail: [
                { t: now - 3600, lat: 42.32, lon: -88.07, alt_ft: null },
                { t: now - 1800, lat: 42.42, lon: -88.2, alt_ft: 3500 },
                { t: now - 5, lat: 42.35, lon: -88.0, alt_ft: 4500 },
              ],
            },
          }),
      );
      await page.route(
        (url) => url.hostname === "api.planespotters.net",
        (route) => route.fulfill({ json: { photos: [] } }),
      );
      await page.goto("/app/plan?flight=a89c1e");
      await settle(page);
      // Half way, as it opens.
      await expect(sideDrawer(page).getByTestId("flight-now")).toBeAttached({ timeout: slow(30000) });
      if (part === "Alert menu") {
        await sideDrawer(page).getByTestId("flight-alert").click();
        await expect(page.getByTestId("flight-alert-menu")).toBeVisible();
      }
      if (part === "card all the way up") {
        await grabberTo(page, "full");
        await expect(sideDrawer(page).getByTestId("flight-details")).toBeVisible();
      }
    },
  })),
  ...FPL_SCREENS,
];
