import { test, expect, type Page } from "@playwright/test";
import { controlsInSight, grabberTo, settle, sideDrawer, slow } from "./helpers";
import { NO_OWN_FIGURES } from "./airplaneMocks";
import { showSearch } from "./oneSearch";
import { FAA } from "./faaRecord";

/**
 * An airplane looked up by its N-number in the one search (the owner,
 * 2026-11-14: "Why does looking up a plane takes a long time?"): the FAA's
 * record at once, "Checking whether it's in the air…" while the live find
 * is out, then its answer, in place; and its card's Flights, each replayed
 * over the card ("How do I see the flights of airplane and play them?").
 * The planner is stubbed: the registry, adsb.lol and ADS-B Exchange are not
 * the suite's.
 */

// An individual's airplane, not the pilot's: the registry is public, so its owner is shown.
const PIPER = {
  ...FAA,
  n_number: "N654FL",
  mode_s_hex: "A89C1E",
  manufacturer: "Piper",
  model: "PA-28-140",
  year: 1971,
  owner: "Jane Q Pilot",
  owner_type: "Individual",
  city: "Meridian",
  state: "ID",
};
const OFF = Math.floor(Date.now() / 1000 - 30 * 3600);
const LCI = { ident: "LCI", name: "Laconia Municipal Airport", city: "Laconia", region: "US-NH" };
const LWM = { ident: "LWM", name: "Lawrence Municipal Airport", city: "Lawrence", region: "US-MA" };

/** The planner's answers for N654FL, the live find held until `answer` is
 *  called: the record at once, the find when the test says. */
async function stubbed(page: Page) {
  let answer: (json: object) => void = () => {};
  const held = new Promise<object>((resolve) => (answer = resolve));
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/traffic/registered"),
    (route) => route.fulfill({ json: new URL(route.request().url()).searchParams.get("q") === "N654FL" ? PIPER : null }),
  );
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/traffic/find"),
    async (route) => {
      const q = new URL(route.request().url()).searchParams.get("q");
      const none = { aircraft: [], checked: true, source: "adsb.lol", license: "ODbL 1.0" };
      await route.fulfill({ json: q === "N654FL" ? await held : none });
    },
  );
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/traffic"),
    (route) => route.fulfill({ json: { aircraft: [], age_s: 1, source: "adsb.lol", license: "ODbL 1.0" } }),
  );
  await page.route(
    (url) => /\/api\/planner\/traffic\/flight\/a89c1e\/history$/.test(url.pathname),
    (route) =>
      route.fulfill({
        json: {
          hex: "a89c1e",
          registration: "N654FL",
          type: "P28A",
          flights: [{ id: OFF, origin: LCI, destination: LWM, off: OFF, on: OFF + 79 * 60, landed: true, in_air: false, max_alt_ft: 5520 }],
        },
      }),
  );
  const points = Array.from({ length: 80 }, (_, i) => ({
    t: OFF + i * 60,
    lat: 43.57 - i * 0.0107,
    lon: -71.42 + i * 0.0038,
    alt_ft: 800 + Math.min(i, 79 - i) * 120,
    gs_kt: 100,
    track_deg: 165,
    vrate_fpm: i < 40 ? 500 : -500,
  }));
  await page.route(
    (url) => /\/api\/planner\/traffic\/flight\/a89c1e\/history\/\d+$/.test(url.pathname),
    (route) => route.fulfill({ json: { id: OFF, points } }),
  );
  await page.route(
    (url) => url.pathname === "/api/planner/traffic/flight/a89c1e",
    (route) => route.fulfill({ json: { hex: "a89c1e", faa: PIPER, registration: "N654FL", trail: [] } }),
  );
  await page.route(
    (url) => url.hostname === "api.planespotters.net",
    (route) => route.fulfill({ json: { photos: [] } }),
  );
  return (json: object) => answer(json);
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("an N-number's FAA record shows at once, whether it is in the air when the live find answers, and its card's flights replay", async ({
  page,
}) => {
  const answer = await stubbed(page);
  await page.goto("/app/plan");
  await settle(page);
  await showSearch(page);
  await page.getByTestId("search-airports").fill("N654FL");
  const row = sideDrawer(page).getByTestId("search-airplane").filter({ hasText: "N654FL" });
  // The record before the live find is back, and the find said to be out, in place.
  await expect(row).toContainText("Piper PA-28-140, 1971 · FAA registry", { timeout: slow(15_000) });
  await expect(row.getByTestId("search-airplane-live")).toHaveText("Checking whether it's in the air…");
  answer({ aircraft: [], checked: true, source: "ADS-B Exchange", license: "ADS-B Exchange terms" });
  await expect(row.getByTestId("search-airplane-live")).toHaveText("Not in the air now", { timeout: slow(10_000) });

  // Its card, as the airport card is laid out (the owner's P1): the record's make, model and year
  // under its name, four buttons in a row, the tabs Flights, Info and Figures, one status line.
  await row.click();
  const card = page.getByTestId("airplane-profile");
  await expect(card).toContainText("Piper PA-28-140, 1971", { timeout: slow(15_000) });
  for (const id of ["fly-this-airplane", "airplane-follow", "airplane-favorite", "airplane-share"])
    await expect(card.getByTestId("airplane-actions").getByTestId(id)).toBeVisible();
  for (const tab of ["flights", "info", "figures"]) await expect(card.getByTestId(`airplane-tab-${tab}`)).toBeVisible();
  await expect(card.getByTestId("airplane-tab-flights")).toHaveAttribute("aria-selected", "true");
  await expect(card.getByTestId("airplane-status")).toHaveText(/^On the ground · landed LWM /, { timeout: slow(15_000) });
  // Flights: its past flights, each ▶ its replay over this card.
  const flight = card.getByTestId("past-flight").first();
  await expect(flight).toContainText("LCI", { timeout: slow(15_000) });
  await expect(flight.getByTestId("past-flight-play")).toBeVisible();
  await flight.click();
  await expect(page).toHaveURL(new RegExp(`[?&]past=${OFF}`));
  await expect(page).toHaveURL(/[?&]flight=a89c1e/);
  await expect(page.getByTestId("past-flight-card").getByTestId("past-flight-name")).toHaveText("LCI → LWM", { timeout: slow(15_000) });
});

test("the airplane card's Info is the FAA's record, its owner named for an airplane not the pilot's", async ({ page }) => {
  const answer = await stubbed(page);
  answer({ aircraft: [], checked: true, source: "adsb.lol", license: "ODbL 1.0" });
  // The rest of its public record (the planner's /api/airplanes/{n}) and its photo.
  await page.route(
    (url) => url.pathname === "/api/planner/airplanes/N654FL",
    (route) =>
      route.fulfill({
        json: {
          n_number: "N654FL",
          registration: { ...PIPER, co_owner_names: [] },
          model: {
            code: "7102806",
            manufacturer: "PIPER",
            model: "PA-28-140",
            category: "Land",
            tc_data_sheet: "2A13",
            tc_holder: "Piper Aircraft",
          },
          past_registrations: [
            {
              n_number: "N654FL",
              owner: "Earlier Owner",
              city: "Boise",
              state: "ID",
              status: "Sale reported",
              cancel_date: "2015-03-02",
              same_airframe: true,
            },
          ],
          ntsb: [
            {
              ev_id: "20190101X00001",
              ntsb_no: "WPR19LA001",
              date: "2019-01-01",
              city: "Nampa",
              state: "ID",
              kind: "Accident",
              damage: "Substantial",
              carol_url: "https://data.ntsb.gov/carol-repgen/api/Aviation/ReportMain/GenerateNewestReport/1/pdf",
            },
          ],
          based: { field: LWM, count: 12, ends: 20 },
          based_pending: false,
        },
      }),
  );
  await page.route(
    (url) => url.pathname === "/api/planner/airplanes/N654FL/photo",
    (route) =>
      route.fulfill({
        json: {
          thumbnail_large: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
          width: 420,
          height: 280,
          photographer: "Jane Spotter",
          link: "https://www.planespotters.net/photo/1/n654fl",
          source: "Planespotters.net",
        },
      }),
  );
  await page.goto("/app/plan?airplane=N654FL");
  await settle(page);
  const card = page.getByTestId("airplane-profile");
  await card.getByTestId("airplane-tab-info").click();
  const info = card.getByTestId("airplane-info");
  await expect(info.getByTestId("airplane-info-model")).toContainText("Piper PA-28-140", { timeout: slow(15_000) });
  await expect(info).toContainText("A89C1E");
  // The FAA aircraft registry is public: an individual's name shown, with the town, never a street.
  await expect(info.getByTestId("airplane-info-owner")).toContainText("Jane Q Pilot");
  await expect(info).toContainText("Meridian, ID");
  await expect(info).toContainText("Individual");
  await expect(info.getByTestId("airplane-info-tcds")).toContainText("2A13");
  // History: past registrations, then the NTSB's, each its report; where it is based; its photo, credited.
  await expect(info.getByTestId("airplane-past-registration")).toContainText("Earlier Owner");
  await expect(info.getByTestId("airplane-ntsb")).toHaveAttribute("href", /data\.ntsb\.gov/);
  await expect(info.getByTestId("airplane-based-field")).toContainText("LWM");
  await expect(info.getByTestId("airplane-photo-credit")).toContainText("Jane Spotter");
  await expect(info.getByTestId("airplane-photo-credit")).toHaveAttribute("href", "https://www.planespotters.net/photo/1/n654fl");
  // Figures: the planning figures, as the card had them.
  await card.getByTestId("airplane-tab-figures").click();
  await expect(card.locator("[data-figure]").first()).toBeVisible();
});

test("an N-number in the air says so, with its height and speed, and Track opens its flight", async ({ page }) => {
  const answer = await stubbed(page);
  await page.goto("/app/plan");
  await settle(page);
  await showSearch(page);
  await page.getByTestId("search-airports").fill("N654FL");
  const row = sideDrawer(page).getByTestId("search-airplane").filter({ hasText: "N654FL" });
  await expect(row.getByTestId("search-airplane-live")).toHaveText("Checking whether it's in the air…", { timeout: slow(15_000) });
  const flying = {
    hex: "a89c1e",
    registration: "N654FL",
    type: "P28A",
    lat: 42.4,
    lon: -88.2,
    altitude_ft: 4520,
    pressure_altitude: false,
    speed_kt: 108,
    track_deg: 90,
  };
  answer({ aircraft: [flying], checked: true, source: "ADS-B Exchange", license: "ADS-B Exchange terms" });
  await expect(row.getByTestId("search-airplane-live")).toHaveText("In the air · 4,500 ft · 108 kt", { timeout: slow(10_000) });
  await row.getByTestId("search-airplane-track").click();
  await expect(page).toHaveURL(/[?&]flight=a89c1e/);
});

test("the FPL's airplane field suggests as it is typed: the pilot's own, the type-the-rest row, the registry's, and a pick flies it", async ({
  page,
}) => {
  const answer = await stubbed(page);
  answer({ aircraft: [], checked: true, source: "adsb.lol", license: "ODbL 1.0" });
  // Signed in with one airplane of their own, N65AB.
  await page.route("**/api/me", (route) =>
    route.fulfill({ json: { id: 1, email: "pilot@example.com", displayName: "A Pilot", developer: false } }),
  );
  await page.route("**/api/aircraft", (route) =>
    route.fulfill({
      json: [
        {
          id: 7,
          tailNumber: "N65AB",
          typeDesignator: "C172",
          figures: NO_OWN_FIGURES,
          cruiseTasKt: 110,
          fuelBurnGph: 8,
          usableFuelGal: 53,
        },
      ],
    }),
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await grabberTo(page, "full");
  await controlsInSight(page);
  const field = page.getByTestId("aircraft-input");
  await field.click();
  await field.pressSequentially("65");
  // Typed "N65": the pilot's own airplane, and the registry's row asking for the rest.
  const list = page.getByTestId("aircraft-suggestions");
  await expect(list.getByTestId("aircraft-suggestions-your")).toContainText("N65AB", { timeout: slow(15_000) });
  await expect(list.getByTestId("aircraft-suggestions-faa")).toContainText("Type the rest to look it up");
  // The whole N-number: the registry's record, its type and year.
  await field.pressSequentially("4FL");
  await expect(list.getByTestId("aircraft-suggestions-faa")).toContainText("Piper PA-28-140, 1971 · FAA registry", {
    timeout: slow(15_000),
  });
  await list.getByTestId("aircraft-suggestions-faa").getByTestId("aircraft-suggestion").click();
  // Picked: the FPL flies it, the list gone.
  await expect(field).toHaveValue("N-654FL");
  await expect(list).toHaveCount(0);
  // Escape closes the list, what is typed kept.
  await field.click();
  await field.press("End");
  await field.press("Backspace");
  await expect(list.getByTestId("aircraft-suggestions-faa")).toBeVisible({ timeout: slow(15_000) });
  await field.press("Escape");
  await expect(list).toHaveCount(0);
});
