import { test, expect } from "@playwright/test";
import { closeCard, drawn, findAirplane, grabberTo, inSheet, settle, sideDrawer, slow, trafficOnMap } from "./helpers";
import { FAA } from "./faaRecord";
import { DETAIL, UAL, sky } from "./trackingSky";

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
  const card = page.getByTestId("flight-card");
  // At the pill's size, as every card opens; its pages all the way up.
  await grabberTo(page, "full");
  await expect(page.getByTestId("flight-name")).toHaveText("UAL2088");
  await expect(card.getByTestId("flight-line")).toHaveCount(0);
  // Its callsign large over its pictures, what it is and who flies it
  // under it (the owner's pick of the redesign, A2).
  await expect(card.getByTestId("flight-name")).toHaveText("UAL2088");
  await expect(card.getByTestId("flight-what")).toHaveText("Airbus A-321neo · United Airlines Inc");
  // The flight it is on in a card under the actions, as FlightAware's:
  // where it left and where it is bound, and how it is flying.
  await expect(card.getByTestId("flight-departed")).toContainText("TJSJ");
  await expect(card.getByTestId("flight-bound")).toContainText("KORD");
  await expect(card.getByTestId("flight-altitude")).toContainText("7,000 ft");
  // What it is, in the one scroll: its make and model and who flies it.
  // Its flight number's route, and its FAA registration, at the pilot's ask.
  await expect(card.getByTestId("flight-route")).toContainText("TJSJ → KORD");
  await expect(card.getByTestId("flight-route")).toContainText("San Juan to Chicago");
  await expect(card.getByTestId("flight-model")).toHaveText("Airbus A-321neo");
  await expect(card.getByTestId("flight-operator")).toHaveText("United Airlines Inc");
  await expect(card.getByTestId("faa-owner")).toContainText("United Airlines Inc · Corporation · Chicago, IL");
  await expect(card.getByTestId("faa-status")).toContainText("Valid");
  await expect(card.getByTestId("faa-status")).toContainText(/expires (Apr 30, 2031|30 Apr 2031)/);
  await expect(card.getByTestId("faa-aircraft")).toContainText("Airbus S A S A321-271NX");
  await expect(card.getByTestId("faa-engine")).toContainText("2 engines · Turbo-fan · 33,110 lb thrust");
  await expect(card.getByTestId("flight-follow")).toHaveAttribute("aria-pressed", "true");
  // Ringed on the map, its path behind it in its heights' colours.
  await expect.poll(async () => (await drawn(page, "traffic-marks")).filter((m) => m.tracked).length).toBe(1);
  await expect.poll(async () => (await drawn(page, "tracked-path")).length).toBeGreaterThan(0);
  // Put away: the search it was found by again, as an airport's card's close goes back.
  await closeCard(page, "flight-close");
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
  await expect(page.getByTestId("flight-name")).toHaveText("UAL2088");
  await expect(page.getByTestId("flight-departed")).toHaveCount(0);
  // One tapped on the map where its probe says it is: the Cessna, the second heard.
  await closeCard(page, "flight-close");
  await expect.poll(async () => (await drawn(page, "traffic-marks")).length).toBe(2);
  const cessna = (await drawn(page, "traffic-marks")).find((m) => m.hex === "a128b9") as { x: number; y: number };
  const box = (await page.locator(".maplibregl-map").first().boundingBox())!;
  await page.mouse.click(box.x + cessna.x, box.y + cessna.y);
  await expect(page).toHaveURL(/[?&]flight=a128b9/);
  await expect(page.getByTestId("flight-name")).toHaveText("N174HA");
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
  // Found by its N-number in the one search, it opens its profile, its
  // flights there (airplane-lookup.spec); its flight's card by its link.
  await page.goto("/app/plan?flight=a89c1e");
  await settle(page);
  const card = page.getByTestId("flight-card");
  // Named by its FAA record, not its address, with no trace today to name it.
  await expect(page.getByTestId("flight-name")).toHaveText("N654FL");
  // Not heard now: on its flights, and its sketch says when it was last
  // heard, on the ground where its trace ends there.
  await grabberTo(page, "full");
  await expect(card.getByTestId("flight-now")).toHaveCount(0);
  await expect(card.getByTestId("flight-chip")).toContainText("Last heard");
  await expect(card.getByTestId("flight-state")).toHaveText("GND");
  await expect(card.getByTestId("faa-owner")).toContainText("Roca Roja LLC · LLC · Meridian, ID");
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

test("an airplane's photo is in its card's pictures, the photographer named on it and the photo linked to its page, its sketch a swipe across", async ({
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
  await page.goto("/app/plan?flight=a0b7d8");
  await settle(page);
  const card = page.getByTestId("flight-card");
  const photo = card.getByTestId("flight-photo");
  await expect(photo).toBeVisible({ timeout: slow(15_000) });
  await expect(card.getByTestId("flight-photo-credit")).toHaveText("© Jane Spotter · Planespotters");
  // The picture is the link to its page, as Planespotters' terms ask.
  const link = card.getByTestId("flight-photo-open");
  await expect(link).toHaveAttribute("href", "https://www.planespotters.net/photo/1773250/n14511");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).not.toHaveAttribute("rel", /nofollow/);
  // Under its facts, as the airport card's pictures (C1); the photo the strip's first.
  // At half a card's body does not scroll (index.css, the one scrolling
  // rule): pulled up to it, as a finger would (inSheet).
  await inSheet(page, link);
  await expect(photo).toBeInViewport({ ratio: 0.9 });
  // The stock carousel's own next page (PictureSlides), as a swipe is.
  await card
    .locator('[data-slot="carousel"]')
    .evaluate((el) => el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
  await expect(card.getByTestId("flight-trail")).toBeInViewport({ ratio: 0.9 });
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
  const card = page.getByTestId("flight-card");
  await card.getByTestId("flight-alert").click();
  const menu = page.getByTestId("flight-alert-menu");
  await expect(menu).toContainText("Tell me when UAL2088");
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
  await closeCard(page, "flight-close");
  await expect.poll(() => asked, { timeout: slow(15_000) }).toBeGreaterThan(0);
  landed = true;
  const banner = page.getByTestId("aircraft-alert");
  await expect(banner.getByTestId("aircraft-alert-title")).toHaveText("UAL2088 landed at KORD", { timeout: slow(45_000) });
  await expect(banner).toContainText("Chicago");
  await expect(banner).toHaveCount(1);
  // Show: its card again, the alert let go once said.
  await banner.getByTestId("aircraft-alert-show").click();
  await expect(banner).toHaveCount(0);
  await expect(page).toHaveURL(/[?&]flight=a0b7d8/);
  await expect(page.getByTestId("flight-card").getByTestId("flight-alerts-set")).toHaveCount(0);
});
