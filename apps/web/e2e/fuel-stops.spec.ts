import { test, expect, type Page } from "@playwright/test";
import { inSheet, mapStill, openPanel, settle, sideDrawer, slow, typeRoute } from "./helpers";
import { stopsAre } from "./stopsParam";
import { drawnMarks } from "./marks";
import { noCheckpoints } from "./startState";

/** KRPD's pin on the map's canvas, as its probe says (FuelStopsGl). */
const pinned = async (page: Page) => (await drawnMarks(page, "fuel-stops")).filter((m) => m.title === "Suggested fuel stop KRPD").length;

/**
 * Fuel stops suggested as Tesla suggests chargers, at the owner's pick
 * (option A, 2026-10-21): a flight too long for its tanks gets a stop the
 * planner chose, dashed in the route's box and pinned on the map, and its
 * menu puts it in the route. FPL's list has no cards of them since the
 * route line took their job (the owner's redesign, 2026-10-26;
 * route-line.spec).
 *
 * The planner's choice is its own (wingtip.fuelstops, tested there); here the
 * live nav log for C81-KDLH, a route CI reads anyway, is answered with a
 * suggestion added to its totals, so the page is tried without planning a
 * trip long enough to need one.
 */

const STOP = {
  ident: "KRPD",
  name: "RICE LAKE RGNL - CARL'S FLD",
  city: "RICE LAKE",
  lat: 45.419,
  lon: -91.7735,
  from_nm: 220.4,
  added_nm: 1.2,
  lands_with_gal: 18.6,
  minutes: 118.0,
  fuel_types: "100LL,A",
  runway_ft: 6700,
  elevation_ft: 1109,
};
const CHOICE = {
  ...STOP,
  ident: "KEAU",
  name: "CHIPPEWA VALLEY RGNL",
  city: "EAU CLAIRE",
  lat: 44.8658,
  lon: -91.4843,
  added_nm: 6.0,
  lands_with_gal: 21.2,
};

/** The live nav log of the routes `when` picks answered with `fuelStops`
 *  in its totals. */
async function answered(page: Page, when: (url: URL) => boolean, fuelStops: unknown[], noFuelStop: unknown[] = []) {
  await page.route(when, async (route) => {
    const body = await (await route.fetch()).text();
    const lines = body
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const message = JSON.parse(line);
        if (message.type !== "done") return line;
        message.totals.fuel_stops = fuelStops;
        message.totals.no_fuel_stop = noFuelStop;
        return JSON.stringify(message);
      });
    await route.fulfill({ contentType: "application/x-ndjson", body: `${lines.join("\n")}\n` });
  });
}

async function suggested(page: Page, departure = "C81", reason: "fuel" | "break" = "fuel") {
  await answered(page, (url) => url.pathname.endsWith("/navlog") && !url.searchParams.get("stops"), [
    { departure, destination: "KDLH", usable_gal: 48, reason, stops: [STOP], choices: [CHOICE] },
  ]);
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("a fuel stop the planner suggests is dashed in the route's box and pinned on the map", async ({ page }) => {
  await suggested(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await typeRoute(page);
  await expect(sideDrawer(page).getByTestId("route-fuel-stop")).toHaveText("KRPD", { timeout: slow(60_000) });
  await expect.poll(() => pinned(page)).toBe(1);
  // No cards of it in FPL's list: the route line does their job.
  await expect(sideDrawer(page).getByTestId("fuel-stop-card")).toHaveCount(0);
});

test("a stop suggested on a flight from a present position is dashed in the route's box too", async ({ page }) => {
  // The owner's screenshot (2026-10-22): from a present position, the stop
  // was missing, the departure there no field to follow.
  // Named as the route's box names the position, as the planner sends it.
  await suggested(page, "@42.2333,-87.9883");
  await page.goto("/app/plan?dep=@42.2333,-87.9883&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await typeRoute(page);
  await expect(sideDrawer(page).getByTestId("route-fuel-stop")).toHaveText("KRPD", { timeout: slow(60_000) });
  await expect.poll(() => pinned(page)).toBe(1);
});

test("a suggested fuel stop can be taken out of the route box and put back, or added from its menu", async ({ page }) => {
  // The owner's ask (2026-10-24): "Fuel stops should also have a way to
  // delete them and add them back as pleased".
  await suggested(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await typeRoute(page);
  const chip = sideDrawer(page).getByTestId("route-fuel-stop");
  await expect(chip).toHaveText("KRPD", { timeout: slow(60_000) });
  // Its menu's Remove takes it out of the box.
  await chip.click();
  await page.getByTestId("route-fuel-stop-remove").click();
  await expect(chip).toHaveCount(0);
  // Planned again, it is back.
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await typeRoute(page);
  await expect(chip).toHaveText("KRPD", { timeout: slow(60_000) });
  // And its menu's Add to Route makes it a stop of the route.
  await chip.click();
  await page.getByTestId("route-fuel-stop-add").click();
  await expect(page).toHaveURL(stopsAre("KRPD"));
});

/** What KRPD offers on the ground, as the planner answers it (wingtip.nearby,
 *  wingtip.faa_data.airport_services): a diner a walk away, a courtesy car. */
const SERVICES = {
  ident: "KRPD",
  fuel_types: ["100LL", "A"],
  // The remarks in words, as the engine reads them (remarks_read), and as sent.
  fuel_notes: ["24 hours self service fuel available with credit card."],
  fuel_remarks: ["24 HR SELF SVC FUEL AVBL WITH CREDIT CARD."],
  landing_fee: false,
  tie_down: true,
  hangar: true,
  airframe_repair: null,
  powerplant_repair: null,
  oxygen: false,
  courtesy_car: true,
  ground_notes: ["Courtesy car available."],
  food: [{ name: "Runway Diner", kind: "Diner", distance_m: 300, walk_min: 4, phone: "+17155550100", lat: 45.42, lon: -91.77 }],
  lodging: [{ name: "Lakeside Inn", kind: "Hotel", distance_m: 3300, walk_min: null, phone: null, lat: 45.45, lon: -91.75 }],
  cars: [],
  nearby_unavailable: false,
};

// The owner's pick of the trip-stops canvas ("Ok do it", 2026-10-22): the
// stop's card a tap on it, with its figures.
test("a suggested stop's pin opens its card with its figures", async ({ page }) => {
  // The route's checkpoints off, as a pilot has them at first: drawn on the
  // map's canvas now, the route's marks take a tap before a stop's pin
  // (useGlSymbols' ranks, TAP.rank.field), and one sat beside KRPD's
  // ("River near Hunter" took the tap).
  await noCheckpoints(page);
  await suggested(page);
  await page.route(
    (url) => url.pathname.endsWith("/airport/KRPD/services"),
    (route) => route.fulfill({ json: SERVICES }),
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await expect.poll(() => pinned(page), { timeout: slow(60_000) }).toBe(1);
  await mapStill(page);
  const pin = (await drawnMarks(page, "fuel-stops")).find((m) => m.title === "Suggested fuel stop KRPD")!;
  await page.mouse.click(pin.x, pin.y);
  const card = page.getByTestId("place-card");
  await expect(card.getByTestId("place-stop")).toContainText("Suggested Fuel Stop");
  await expect(card.getByTestId("place-stop-after")).toContainText("From C81");
  await expect(card.getByTestId("place-stop-after")).toContainText("1h 58m");
  await expect(card.getByTestId("place-stop-fuel")).toContainText("18 gal");
  await expect(card.getByTestId("place-stop-added")).toContainText("+1 nm");

  // Kept from its card at its place, a fuel stop.
  await card.getByTestId("place-add-stop").click();
  await expect(page).toHaveURL(stopsAre("KRPD"));
  await expect(page).toHaveURL(/[?&]fuel=KRPD(&|$)/);
});

test("the airport's Info says its fuel in its details, and what is on the field and the places near it at its foot", async ({ page }) => {
  await page.route(
    (url) => url.pathname.endsWith("/airport/KRPD/services"),
    (route) => route.fulfill({ json: SERVICES }),
  );
  await page.goto("/app/plan?place=KRPD");
  const card = page.getByTestId("place-card");
  await expect(card).toBeVisible({ timeout: slow(30_000) });
  // Fuel first in On the field (the owner, 2026-11-11), its remarks in
  // words under it in sight and only the remarks as sent folded (e1c0cd7dd).
  const services = card.getByTestId("place-services");
  await expect(services.getByTestId("services-fuel")).toContainText("100LL, Jet A");
  await expect(services).not.toContainText("24 HR SELF SVC FUEL");
  await inSheet(page, services.getByTestId("services-fuel"));
  // In words under Fuel, in sight (the owner, 2026-11-11: "Decode fuel
  // remarks too"), as sent under As Written, as the card's Lights.
  await expect(services.getByTestId("services-fuel-note")).toHaveText("24 hours self service fuel available with credit card.");
  await expect(services.getByTestId("services-fuel-raw")).toBeHidden();
  await services.getByTestId("services-fuel-sent").click();
  await expect(services.getByTestId("services-fuel-raw")).toHaveText("24 HR SELF SVC FUEL AVBL WITH CREDIT CARD.");
  // The rest of On the field under its title, its first three rows Fuel,
  // its remarks and As Written (FirstFew; 263bd810d gave the remarks a row).
  await expect(services.getByTestId("services-courtesy-car")).toHaveCount(0);
  const onTheField = services.getByRole("button", { name: /^On the Field/ });
  await inSheet(page, onTheField);
  await onTheField.click();
  await expect(services.getByTestId("services-courtesy-car")).toBeVisible();
  await expect(services.getByTestId("services-food")).toContainText(/Runway Diner.*4 min walk/);
  await expect(services.getByTestId("services-food")).toHaveAttribute("href", "tel:+17155550100");
  await expect(services.getByTestId("services-lodging")).toContainText(/Lakeside Inn.*2\.1 mi/);
  await expect(services).toContainText("Places © Overture Maps Foundation");
});

test("a long flight the tanks hold is offered a break about half way, kept as the pilot's own stop", async ({ page }) => {
  await suggested(page, "C81", "break");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await typeRoute(page);
  const chip = sideDrawer(page).getByTestId("route-fuel-stop");
  await expect(chip).toHaveAccessibleName("Suggested stop KRPD", { timeout: slow(60_000) });
  await chip.click();
  await page.getByTestId("route-fuel-stop-add").click();
  await expect(page).toHaveURL(stopsAre("KRPD"));
  await expect(page).not.toHaveURL(/[?&]fuel=/);
});

test("FPL's Add a Stop row has the fuel glyph's Add Stops, and once they are in, Remove Stops", async ({ page }) => {
  // The owner's ask (2026-11-20): "We should have a add fuel stops pill in
  // the last row and when added, remove fuel stops pill".
  await suggested(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  const pill = sideDrawer(page).getByTestId("timeline-add-stop").locator("..").getByTestId("timeline-fuel-stops");
  await expect(pill).toHaveText("Add Stops", { timeout: slow(60_000) });
  await expect(pill).toHaveAccessibleName("Add Stops for fuel");
  await inSheet(page, pill);
  await page.screenshot({ path: "test-results/fuel-pill-add.png" });
  await pill.click();
  await expect.poll(() => new URL(page.url()).searchParams.get("fuel")).toBe("KRPD");
  await expect(pill).toHaveText("Remove Stops", { timeout: slow(60_000) });
  await expect(pill).toHaveAccessibleName("Remove Stops for fuel");
  await inSheet(page, pill);
  await page.screenshot({ path: "test-results/fuel-pill-remove.png" });
  await pill.click();
  await expect.poll(() => new URL(page.url()).searchParams.get("stops")).toBeNull();
});

test("Add Stops puts in every flight's suggested stops, a later flight's too", async ({ page }) => {
  // The owner's trip (2026-11-20): to KLAS and on to KPWK, the pill put in
  // the first flight's stops alone and the last flight still read 21 gal
  // short. Here the route C81, KMSN, KDLH, each flight with a stop of its
  // own suggested; once in, the plan suggests none and the pill takes them
  // out again.
  await answered(page, (url) => url.pathname.endsWith("/navlog") && url.searchParams.get("stops") === "KMSN", [
    { departure: "C81", destination: "KMSN", usable_gal: 48, reason: "fuel", stops: [{ ...CHOICE, ident: "KJVL" }], choices: [] },
    { departure: "KMSN", destination: "KDLH", usable_gal: 48, reason: "fuel", stops: [STOP], choices: [] },
  ]);
  await page.goto("/app/plan?dep=C81&stops=KMSN&dest=KDLH");
  await settle(page);
  await openPanel(page);
  const pill = sideDrawer(page).getByTestId("timeline-add-stop").locator("..").getByTestId("timeline-fuel-stops");
  await expect(pill).toHaveText("Add Stops", { timeout: slow(60_000) });
  // Two flights' rows put Add a Stop under the half sheet's edge, where a
  // click finds the pill outside the viewport and retries till the test's
  // end: brought up first, as the test above does.
  await inSheet(page, pill);
  await pill.click();
  await expect(page).toHaveURL(stopsAre("KJVL,KMSN,KRPD"));
  await expect.poll(() => new URL(page.url()).searchParams.get("fuel")).toBe("KJVL,KRPD");
  await expect(pill).toHaveText("Remove Stops", { timeout: slow(60_000) });
});

test("a flight short with no stop offered says why where the pill would be", async ({ page }) => {
  // The aviation audit (2026-11-21, F7.6): with too little fuel on board
  // at the start for the start, taxi and reserve, no field is in reach and
  // no stop is offered; the timeline says so (warn, never limit).
  await answered(
    page,
    (url) => url.pathname.endsWith("/navlog") && !url.searchParams.get("stops"),
    [],
    [{ departure: "C81", destination: "KDLH", on_board: true }],
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  const note = sideDrawer(page).getByTestId("timeline-no-fuel-stop");
  await expect(note).toHaveText("Too little fuel on board for C81 → KDLH", { timeout: slow(60_000) });
  await expect(sideDrawer(page).getByTestId("timeline-fuel-stops")).toHaveCount(0);
});

for (const width of [375, 393])
  test.describe(`at ${width} points and the owner's 19.65-px text`, () => {
    test.use({ viewport: { width, height: 852 } });
    test("Add a Stop, the fuel stops' pill and the route's toggle are one line, to add and to remove", async ({ page }) => {
      // The owner, 2026-11-22: "Remove fuel stops goes to the next line."
      await suggested(page);
      await page.goto("/app/plan?dep=C81&dest=KDLH");
      await settle(page);
      await page.evaluate(() => (document.documentElement.style.fontSize = "19.65px"));
      await openPanel(page);
      const drawer = sideDrawer(page);
      const pill = drawer.getByTestId("timeline-add-stop").locator("..").getByTestId("timeline-fuel-stops");
      await expect(pill).toHaveText("Add Stops", { timeout: slow(60_000) });
      // `under`: the chips on a line of their own under the words.
      const row = async (under = false) => {
        const boxes = await Promise.all(
          [drawer.getByTestId("timeline-add-stop"), pill, drawer.getByTestId("route-type-open")].map(async (l) => (await l.boundingBox())!),
        );
        const mid = (b: { y: number; height: number }) => b.y + b.height / 2;
        const card = (await drawer.getByTestId("route-summary").boundingBox())!;
        test
          .info()
          .annotations.push({
            type: "row",
            description: JSON.stringify({
              card: [card.x, card.width],
              boxes: boxes.map((b) => [Math.round(b.x), Math.round(b.y), Math.round(b.width)]),
            }),
          });
        console.log(
          "ROW",
          JSON.stringify({ card: [card.x, card.width], boxes: boxes.map((b) => [Math.round(b.x), Math.round(b.y), Math.round(b.width)]) }),
        );
        const [words, ...chips] = boxes as [(typeof boxes)[0], ...typeof boxes];
        if (under) {
          // At 375 points and 19.65-px text "Remove Stops" does not fit on
          // the words' line: Add a Stop's 153 and the chips' 183 (the pill's
          // 136, the toggle's 27 and their gap-2 and inset, 9.8 each at that
          // text) are 336 in the row's 324, 12 over; with the fuel glyph at
          // 14, no room between it and its words and the toggle's glyph
          // bare, still 3 over. So the chips go under the words, together,
          // on a line of their own (TimelineAction's flex-wrap).
          for (const b of chips) expect(Math.abs(mid(b) - mid(chips[0]!)), "the chips one line").toBeLessThan(4);
          expect(chips[0]!.y, "the chips under the words").toBeGreaterThanOrEqual(words.y + words.height - 1);
          expect(chips[0]!.x, "the pill inside the card").toBeGreaterThanOrEqual(card.x);
        } else for (const b of boxes) expect(Math.abs(mid(b) - mid(words)), "one line").toBeLessThan(4);
        // The rows' gap-2 between the pill and the toggle, so their 44-point
        // areas meet and don't cross, and the toggle 8 in from the card's
        // edge, never clipped by it (the owner's iPhone, 2026-11-22).
        const [, chip, toggle] = boxes as [unknown, { x: number; width: number }, { x: number; width: number }];
        expect(toggle.x - (chip.x + chip.width), "8 between the pill and the toggle").toBeGreaterThanOrEqual(7.5);
        expect(card.x + card.width - (toggle.x + toggle.width), "the toggle 8 in from the card's edge").toBeGreaterThanOrEqual(7.5);
      };
      await row();
      await inSheet(page, pill);
      await pill.click();
      await expect(pill).toHaveText("Remove Stops", { timeout: slow(60_000) });
      await row(width === 375);
    });
  });
