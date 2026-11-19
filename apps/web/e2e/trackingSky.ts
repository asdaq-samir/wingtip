import { type Page } from "@playwright/test";
import { FAA } from "./faaRecord";

export const UAL = {
  hex: "a0b7d8",
  callsign: "UAL2088",
  registration: "N14511",
  type: "A21N",
  lat: 42.35,
  lon: -88.0,
  altitude_ft: 7000,
  pressure_altitude: false,
  track_deg: 90,
  speed_kt: 250,
  vertical_fpm: -1200,
  seen_s: 0.5,
  squawk: "3324",
};
const CESSNA = {
  hex: "a128b9",
  callsign: "N174HA",
  registration: "N174HA",
  type: "C172",
  lat: 42.3,
  lon: -88.12,
  altitude_ft: 2500,
  pressure_altitude: false,
  track_deg: 320,
  speed_kt: 94,
  vertical_fpm: 0,
  seen_s: 0.3,
  squawk: "1200",
};
const ROUTE = {
  airports: [
    { ident: "TJSJ", name: "Luis Munoz Marin International Airport", location: "San Juan" },
    { ident: "KORD", name: "Chicago O'Hare International Airport", location: "Chicago" },
  ],
  plausible: true,
};
export const DETAIL = {
  hex: "a0b7d8",
  faa: FAA,
  registration: "N14511",
  type: "A21N",
  description: "AIRBUS A-321neo",
  operator: "UNITED AIRLINES INC",
  year: "2024",
  departed: { ident: "TJSJ", name: "Luis Munoz Marin International Airport", at: Date.now() / 1000 - 4 * 3600 },
  trail: [
    { t: Date.now() / 1000 - 600, lat: 42.35, lon: -88.6, alt_ft: 12000 },
    { t: Date.now() / 1000 - 300, lat: 42.35, lon: -88.3, alt_ft: 9000 },
    { t: Date.now() / 1000 - 10, lat: 42.35, lon: -88.01, alt_ft: 7000 },
  ],
};

/** The planner's traffic, an airplane's flight and a search, stubbed. */
export async function sky(page: Page, detail: object = DETAIL) {
  const reported = Date.now();
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/traffic"),
    (route) =>
      // Seconds old, as the planner's answer is -- never past the half
      // minute the map carries an airplane on for (CARRY_S), however long
      // the test has run: a slow run's airplanes had all aged off the map.
      route.fulfill({
        json: { aircraft: [UAL, CESSNA], age_s: Math.min(5, (Date.now() - reported) / 1000), source: "adsb.lol", license: "ODbL 1.0" },
      }),
  );
  await page.route(
    (url) => url.pathname.startsWith("/api/planner/traffic/flight/"),
    (route) => route.fulfill({ json: detail }),
  );
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/traffic/route"),
    (route) => route.fulfill({ json: new URL(route.request().url()).searchParams.get("callsign") === "UAL2088" ? ROUTE : null }),
  );
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/traffic/find"),
    (route) => route.fulfill({ json: { aircraft: new URL(route.request().url()).searchParams.get("q") === "UAL2088" ? [UAL] : [] } }),
  );
  // No photo of it, unless a test gives one: Planespotters' sky is not the suite's either.
  await page.route(
    (url) => url.hostname === "api.planespotters.net",
    (route) => route.fulfill({ json: { photos: [] } }),
  );
}
