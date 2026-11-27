import { test, expect } from "@playwright/test";
import { closeCard, drawn, findAirplane, grabberTo, inSheet, mapStill, settle, sideDrawer, slow, trafficOnMap } from "./helpers";
import { FAA } from "./faaRecord";
import { DETAIL, UAL, sky } from "./trackingSky";
// The parked features it exercises, on (Settings' Extras, src/lib/extras).

/**
 * Tracking an airplane, as FlightAware and ForeFlight do, at the pilot's
 * ask: found by the one search among the airplanes the map hears (the
 * traffic's own page and search went for it, 2026-11-14), a tap on one on
 * the map, its card and its path flown; and own ship's own
 * path. adsb.lol is stubbed through the planner: its sky is not the
 * suite's.
 */

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("the one search finds an airplane the map hears by its callsign, and a tap on one tracks it: its card, its path, the map on it", async ({
  page,
}) => {
  await sky(page);
  await trafficOnMap(page);
  await page.goto("/app/plan");
  await settle(page);
  // Found among the airplanes heard, by the one search (it was the traffic's own).
  await (await findAirplane(page, "UAL2088")).click();
  await expect(page).toHaveURL(/[?&]flight=a0b7d8/);
  // One card for it (the owner's design, 2026-11-26): its N-number's, its call sign and what it is
  // under it, one page, no tab bar.
  const card = page.getByTestId("airplane-profile");
  // At the pill's size, as every card opens; its pages all the way up.
  await grabberTo(page, "full");
  await expect(card).toContainText("N14511");
  await expect(card).toContainText("UAL2088 · Airbus A-321neo");
  // Two tabs, Info open (the owner, 2026-11-27); its flight now heads Flights.
  await expect(card.getByTestId("airplane-tab-bar")).toBeVisible();
  await card.getByTestId("airplane-tab-flights").click();
  // The flight it is on, as FlightAware's: where it left and where it is bound, and how it is flying.
  await expect(card.getByTestId("flight-departed")).toContainText("TJSJ");
  await expect(card.getByTestId("flight-bound")).toContainText("KORD");
  await expect(card.getByTestId("flight-altitude")).toContainText("7,000 ft");
  // Who flies it in the facts strip, its flight number's route its slide's
  // ends (the owner, 2026-11-27, the Now section gone); its make and model
  // in its record's sections.
  await expect(card.getByTestId("airplane-facts-operator")).toHaveText("United Airlines Inc");
  // Tracked, the map on it, as it is opened from the search.
  await expect(card.getByTestId("airplane-track")).toHaveAttribute("aria-pressed", "true");
  // Its FAA registration on Info, from the flight's detail before its N-number's own record.
  await card.getByTestId("airplane-tab-info").click();
  const info = card.getByTestId("airplane-info");
  await expect(info.getByTestId("airplane-info-owner")).toContainText("United Airlines Inc");
  await expect(info).toContainText("Chicago, IL");
  // Its status the Registration section's fifth row, under its title (FirstFew).
  await info.getByTestId("airplane-info-registration-more").click();
  await expect(info).toContainText("Valid");
  await expect(info.getByTestId("airplane-info-model")).toContainText("Airbus S A S A321-271NX");
  await expect(info).toContainText("33,110 lb thrust");
  // Ringed on the map, its path behind it in its heights' colours.
  await expect.poll(async () => (await drawn(page, "traffic-marks")).filter((m) => m.tracked).length).toBe(1);
  await expect.poll(async () => (await drawn(page, "tracked-path")).length).toBeGreaterThan(0);
  // Put away: the search it was found by again, as an airport's card's close goes back.
  await closeCard(page, "sheet-card-close");
  await expect(page).not.toHaveURL(/[?&]flight=/);
  await expect(sideDrawer(page).getByTestId("one-search-results").or(sideDrawer(page).getByTestId("search-home")).first()).toBeVisible();
});

test("an airplane is found by its callsign typed with a space, and a tap on one on the map tracks it too", async ({ page }) => {
  await sky(page, { ...DETAIL, departed: null });
  await trafficOnMap(page);
  await page.goto("/app/plan");
  await settle(page);
  await (await findAirplane(page, "ual 2088", "UAL2088")).click();
  await expect(page).toHaveURL(/[?&]flight=a0b7d8/);
  // No field it took off from in its track: no Departed row.
  await expect(page.getByTestId("airplane-profile")).toContainText("N14511");
  await expect(page.getByTestId("flight-departed")).toHaveCount(0);
  // One tapped on the map where its probe says it is: the Cessna, the second heard.
  await closeCard(page, "sheet-card-close");
  await expect.poll(async () => (await drawn(page, "traffic-marks")).length).toBe(2);
  // Where it is drawn once the map is at rest: it was read as the map
  // still moved under the closing card, and the tap met the chart there.
  await mapStill(page);
  const cessna = (await drawn(page, "traffic-marks")).find((m) => m.hex === "a128b9") as { x: number; y: number };
  const box = (await page.locator(".maplibregl-map").first().boundingBox())!;
  await page.mouse.click(box.x + cessna.x, box.y + cessna.y);
  await expect(page).toHaveURL(/[?&]flight=a128b9/);
  await expect(page.getByTestId("airplane-profile")).toContainText("N174HA");
});

test("the one search finds the airplanes heard as it is typed, before a whole name", async ({ page }) => {
  await sky(page);
  await trafficOnMap(page);
  await page.goto("/app/plan");
  await settle(page);
  // On the map already: found by the start of its name, asking nothing.
  await findAirplane(page, "N17", "N174HA");
});

test("an airplane not in the air opened by its link: its card says when it was last heard", async ({ page }) => {
  const piper = {
    ...FAA,
    n_number: "N654FL",
    mode_s_hex: "a89c1e",
    manufacturer: "Piper",
    model: "PA-28-140",
    year: 1971,
    engines: 1,
    seats: 4,
    engine: "Lycoming 0-320 Series",
    engine_type: "Reciprocating",
    horsepower: 180,
    thrust_lb: null,
    owner: "Roca Roja LLC",
    owner_type: "LLC",
    city: "Meridian",
    state: "ID",
  };
  const landed = Date.now() / 1000 - 3600;
  await sky(page, {
    hex: "a89c1e",
    faa: piper,
    registration: "N654FL",
    departed: null,
    trail: [
      { t: landed - 600, lat: 43.5, lon: -116.3, alt_ft: 3000 },
      { t: landed, lat: 43.56, lon: -116.22, alt_ft: null },
    ],
  });
  // Found by its N-number in the one search or by its link, it is the one card (the owner's design,
  // 2026-11-26).
  await page.goto("/app/plan?flight=a89c1e");
  await settle(page);
  const card = page.getByTestId("airplane-profile");
  // Named by its FAA record, not its address, with no trace today to name it.
  await expect(card).toContainText("N654FL", { timeout: slow(15_000) });
  // Not heard now: no flight's box, its one line under the actions instead, and no Track.
  await grabberTo(page, "full");
  await expect(card.getByTestId("airplane-info-owner")).toContainText("Roca Roja LLC");
  await expect(card.getByTestId("airplane-track")).toHaveCount(0);
  await card.getByTestId("airplane-tab-flights").click();
  await expect(card.getByTestId("flight-now")).toHaveCount(0);
  await expect(card.getByTestId("airplane-status")).toBeVisible();
});

test("in the air, own ship's path flown is drawn behind it", async ({ page }) => {
  await page.context().grantPermissions(["geolocation"]);
  await page.addInitScript(() => {
    const started = Date.now();
    // East at 360 kt, a tenth of a mile a second, at 3,000 ft.
    const position = () =>
      ({
        coords: {
          latitude: 42.3246,
          longitude: -88.0741 + (((Date.now() - started) / 1000) * 0.1) / (60 * 0.7392),
          accuracy: 10,
          heading: 90,
          speed: 360 / 1.943844,
          altitude: 3000 * 0.3048, // 3,000 ft in metres, by the international foot (0.3048 m exactly)
          altitudeAccuracy: 10,
          toJSON() {
            return this;
          },
        },
        timestamp: Date.now(),
        toJSON() {
          return this;
        },
      }) as unknown as GeolocationPosition;
    Geolocation.prototype.watchPosition = function (success: PositionCallback) {
      window.setTimeout(() => success(position()), 0);
      return window.setInterval(() => success(position()), 1000);
    };
    Geolocation.prototype.clearWatch = function (id: number) {
      window.clearInterval(id);
    };
    localStorage.removeItem("wingtip.owntrail");
    localStorage.setItem(
      "wingtip.ownship",
      JSON.stringify({ state: { enabled: true, follow: true, lastFix: { lat: 42.325, lon: -88.074 } }, version: 0 }),
    );
  });
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airspace/ahead"),
    (route) => route.fulfill({ json: { alerts: [], unavailable: [] } }),
  );
  await page.goto("/app/plan");
  await settle(page);
  await expect.poll(async () => (await drawn(page, "own-trail")).length, { timeout: slow(15_000) }).toBeGreaterThan(0);
});

test("an airplane's photo is in its card's pictures, the photographer named on it and the photo linked to its page, a swipe across from its sketch", async ({
  page,
}) => {
  // The owner's ask: "I also like the idea of having the actual airframe
  // photo", as Planespotters' terms have it shown.
  await sky(page);
  await page.route(
    (url) => url.hostname === "api.planespotters.net",
    (route) =>
      route.fulfill({
        json: {
          photos: [
            {
              id: "1773250",
              thumbnail_large: { src: "https://t.plnspttrs.net/30652/1773250_280.jpg", size: { width: 420, height: 280 } },
              link: "https://www.planespotters.net/photo/1773250/n14511",
              photographer: "Jane Spotter",
            },
          ],
        },
      }),
  );
  await page.route(
    (url) => url.hostname === "t.plnspttrs.net",
    (route) =>
      route.fulfill({
        contentType: "image/png",
        body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"),
      }),
  );
  // Traffic the FAA's registry does not hold (the design's "Unregistered"): its photo in the card's
  // top row, its registration in its Flights tab, the card having no Info. The later route answers first.
  const foreign = { ...UAL, registration: "C-FSES" };
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/traffic"),
    (route) => route.fulfill({ json: { aircraft: [foreign], age_s: 1, source: "adsb.lol", license: "ODbL 1.0" } }),
  );
  await page.route(
    (url) => url.pathname.startsWith("/api/planner/traffic/flight/"),
    (route) => route.fulfill({ json: { ...DETAIL, faa: null, registration: "C-FSES" } }),
  );
  await page.goto("/app/plan?flight=a0b7d8");
  await settle(page);
  const card = page.getByTestId("airplane-profile");
  await expect(card).toContainText("UAL2088", { timeout: slow(15_000) });
  await expect(card.getByTestId("airplane-info")).toHaveCount(0);
  await expect(card.getByTestId("airplane-figures-open")).toBeDisabled(); // greyed in its place (the owner, 2026-11-27)
  // Its mark at its head, its ICAO address in the facts strip, the card having no record's sections.
  await expect(card).toContainText("C-FSES");
  await expect(card.getByTestId("airplane-facts-address")).toContainText("A0B7D8");
  const photo = card.getByTestId("flight-photo");
  await expect(photo).toBeVisible({ timeout: slow(15_000) });
  await expect(card.getByTestId("flight-photo-credit")).toHaveText("© Jane Spotter · Planespotters");
  // The picture is the link to its page, as Planespotters' terms ask.
  const link = card.getByTestId("flight-photo-open");
  await expect(link).toHaveAttribute("href", "https://www.planespotters.net/photo/1773250/n14511");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).not.toHaveAttribute("rel", /nofollow/);
  // Info's pictures, as the airport card's (C1): its photo, then the
  // sketch, a picture that arrives later never going in front of the one in
  // view (CardPictures, FL-23); its flight now is the Flights tab's (the
  // owner, 2026-11-27). At half a card's body does not scroll (index.css,
  // the one scrolling rule): pulled up to it, as a finger would (inSheet).
  await inSheet(page, photo);
  await expect(card.getByTestId("airplane-pictures").getByTestId("flight-trail")).toBeAttached();
  // The stock carousel's own next page (PictureSlides), as a swipe is, until the photo is in view.
  await expect(async () => {
    await card
      .getByTestId("airplane-pictures")
      .evaluate((el) => el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    await expect(photo).toBeInViewport({ ratio: 0.9, timeout: 1_000 });
  }).toPass({ timeout: slow(10_000) });
});

test("an alert set on an airplane goes off on the map when it lands, once, and Show opens its card", async ({ page }) => {
  // The owner's pick: "Just the alert button for all alerts".
  await sky(page);
  let landed = false;
  let asked = 0;
  await page.route(
    (url) => /\/api\/planner\/traffic\/flight\/a0b7d8\/status$/.test(url.pathname),
    (route) => {
      asked += 1;
      return route.fulfill({
        json: landed
          ? {
              hex: "a0b7d8",
              heard_s: 130,
              airborne: false,
              aircraft: null,
              departed: null,
              arrived: {
                ident: "KORD",
                name: "Chicago O'Hare International Airport",
                city: "Chicago",
                region: "US-IL",
                at: Date.now() / 1000 - 60,
              },
            }
          : { hex: "a0b7d8", heard_s: 1, airborne: true, aircraft: UAL, departed: null, arrived: null },
      });
    },
  );
  await page.goto("/app/plan?flight=a0b7d8");
  await settle(page);
  const card = page.getByTestId("airplane-profile");
  await card.getByTestId("airplane-alerts").click();
  const menu = page.getByTestId("flight-alert-menu");
  await expect(menu).toContainText("Tell me when N14511");
  // In the air now: not "takes off"; and no own ship, so not "near me".
  await expect(menu.getByTestId("flight-alert-takeoff")).toHaveAttribute("aria-disabled", "true");
  await expect(menu.getByTestId("flight-alert-takeoff")).toContainText("It is in the air now");
  await expect(menu.getByTestId("flight-alert-near-me")).toContainText("Your position is off");
  await menu.getByTestId("flight-alert-land").click();
  await expect(menu.getByTestId("flight-alert-land")).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(card.getByTestId("flight-alerts-set")).toHaveText("When it lands");
  // Watched with the card put away.
  await closeCard(page, "sheet-card-close");
  await expect.poll(() => asked, { timeout: slow(15_000) }).toBeGreaterThan(0);
  landed = true;
  const banner = page.getByTestId("aircraft-alert");
  await expect(banner.getByTestId("aircraft-alert-title")).toHaveText("N14511 landed at KORD", { timeout: slow(45_000) });
  await expect(banner).toContainText("Chicago");
  await expect(banner).toHaveCount(1);
  // Show: its card again, the alert let go once said.
  await banner.getByTestId("aircraft-alert-show").click();
  await expect(banner).toHaveCount(0);
  await expect(page).toHaveURL(/[?&]flight=a0b7d8/);
  await expect(page.getByTestId("airplane-profile").getByTestId("flight-alerts-set")).toHaveCount(0);
});
