import { test, expect } from "@playwright/test";
import { closeCard, firstRow, grabberTo, settle, sideDrawer, slow, frontSheet, withFoot } from "./helpers";
import { card, cardWeather, tafFromNow } from "./placeCard";
import { pickAirplane } from "./startState";
import { steady } from "./pacing";

/** Airports as places, as Maps has them: a tap on one on the chart opens its card in the panel -- its name, what kind of field it is, the
 *  weather there as pilots read it -- with Fly Here, Weather and Frequencies; the card is the address's (?place=) and puts itself away. */

test("the departure's own card says no distance from itself while the pilot's position is not known", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH&place=C81");
  await settle(page);
  // No distance in the facts: no "here of C81", as the phones said no "From KMSN 0 nm" (PlaceCard's distanceOf).
  await expect(card(page).getByTestId("place-fact-elevation")).toBeVisible({ timeout: slow(15000) });
  await expect(card(page).getByTestId("place-fact-distance")).toHaveText("Dist.—");
});

test("an airport's card has the field's pictures across its top, its ident over them, how far it is, its actions, its tabs right under them and the weather there", async ({
  page,
}) => {
  await cardWeather(page, "KDLH", {
    metar: { raw: "KDLH 102155Z 27008KT 10SM CLR 12/02 A3001", flight_category: "VFR", ceiling_ft: null },
    taf: null,
  });
  await page.goto("/app/plan?dep=C81&dest=KDLH&place=KDLH");
  await settle(page);
  // Half way, as every card opens (the owner's ask).
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
  // The owner's pick of the redesign (A2): the pictures across the top, the ident large over them with the name and the town under it.
  await expect(card(page).getByTestId("place-head")).toBeInViewport();
  await expect(card(page).getByTestId("place-name")).toHaveText("KDLH");
  // The name under the ident, and no town, distance or elevation in the head (the owner, 2026-11-11).
  // NASR's name for it, as the FAA files it (ARPT_NAME, wingtip.field_use.named).
  await expect(card(page).getByTestId("place-full-name")).toHaveText("Duluth Intl · Towered"); // its tower after it (C1, 2026-11-14)
  await expect(card(page).getByTestId("place-ident")).toHaveCount(0);
  await expect(card(page).getByTestId("place-line")).toHaveCount(0);
  // Its share at the head's start, the name centred, ✕ at its end (cards.spec), the star a tile (2026-11-11); the card the whole sheet.
  for (const id of ["place-share", "place-favorite", "place-close"]) await expect(card(page).getByTestId(id)).toBeInViewport();
  await expect(firstRow(page)).toBeHidden();
  // Four tiles in a row at half, nothing else -- the route's destination can't be added as a stop, so Address at the end in
  // Add Stop's place (the owner, 2026-11-20: "If add stop is disabled, just show the address at the end instead") -- Info open.
  await expect(card(page).getByTestId("place-actions")).toBeInViewport({ ratio: 1 });
  await expect(card(page).getByTestId("place-actions").locator(":scope > *")).toHaveText([/Fly Here|≈ \d/, /Call/, /Favorite/, /Address/]);
  await expect(card(page).getByTestId("place-add-stop")).toHaveCount(0);
  const tabs = withFoot(card(page)).getByRole("tab");
  expect((await tabs.evaluateAll((t) => t.map((x) => x.ariaLabel))).join("|")).toMatch(/^Info\|Weather(, \w+)?\|Runways\|Charts(, \d+)?$/);
  await expect(withFoot(card(page)).getByTestId("place-tab-radio")).toHaveAttribute("aria-selected", "true");
  const [actions, bar] = await Promise.all(
    [card(page).getByTestId("place-actions"), withFoot(card(page)).getByRole("tablist")].map(async (l) => (await l.boundingBox())!),
  );
  expect(bar.y).toBeGreaterThanOrEqual(actions.y + actions.height);

  // Weather: the panel all the way up, the weather's card at the tab's top, its category in the FAA's colour:
  // with no TAF, a sentence from the report and no hours; its first row ends in the card's Refresh (the owner, 2026-11-11).
  await withFoot(card(page)).getByTestId("place-tab-weather").click();
  // A tab only switches what is shown (the owner, 2026-11-11): pulled all
  // the way up to read it, as a pilot would.
  await grabberTo(page, "full");
  await expect(card(page).getByTestId("place-category")).toBeVisible();
  await expect(card(page).getByTestId("place-forecast-sentence")).toHaveText("VFR now, no forecast for this field.");
  await card(page).getByTestId("place-weather-summary").getByTestId("airport-refresh").click();
  // No TAF, no hours; the report's age once, in the summary (UI audit C10).
  await expect(card(page).getByTestId("place-hours").or(card(page).getByTestId("place-observed"))).toHaveCount(0);

  // Info: the field's elevation and airspace in its facts (the Details only its address, 2026-11-14), and
  // the distance from the route's departure while the pilot's own position is not known.
  await withFoot(card(page)).getByTestId("place-tab-radio").click();
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "full");
  await expect(card(page).getByTestId("place-fact-elevation")).toContainText(/[\d,]+ ft$/);
  await expect(card(page).getByTestId("place-fact-airspace")).toHaveText(/^AirspaceClass D/);
  await expect(card(page).getByTestId("place-fact-distance")).toHaveText(/^From C81\d+ nm$/);
  // The tower's, named in words, its frequency as pilots write it.
  const tower = card(page).getByTestId("place-frequency").filter({ hasText: "Tower" });
  await expect(tower).toContainText("118.3");
  await tower.scrollIntoViewIfNeeded();
  await expect(tower).toBeInViewport();

  // Put away: the address forgets it, and the route is the panel again,
  // the layer under the card, where the sheet was under it -- here half,
  // the size the page opened at -- not all the way up where the card was
  // left (the owner, 2026-11-11: "Just let the drawer do what it does").
  await closeCard(page, "place-close");
  await expect(card(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]place=/);
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
});

test("the pictures open on the runways, and the Weather tab opens on the forecast in a sentence over the hours, Now first, the flight's landing marked, the reports under them", async ({
  page,
}) => {
  // An airplane, for the flight's times: with none the route has no time en
  // route, so no landing hour to mark (the owner, 2026-11-09: nothing
  // assumes one).
  await pickAirplane(page);
  await cardWeather(page, "KDLH", {
    metar: {
      raw: "KDLH 102155Z 27008KT 10SM CLR 12/02 A3001",
      flight_category: "VFR",
      ceiling_ft: null,
      wind_dir_true_deg: 270,
      wind_speed_kt: 8,
    },
    taf: tafFromNow(),
  });
  // Its aerial too, held until the runways are drawn, as it comes on a
  // phone: from its own query, after the card.
  let aerial: () => void = () => {};
  const held = new Promise<void>((go) => {
    aerial = go;
  });
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airport/KDLH/photos"),
    async (route) => {
      await held;
      await route.fulfill({ json: { aerial_url: "/api/planner/airport-aerial/KDLH.jpg", photo: null } });
    },
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH&place=KDLH");
  await settle(page);
  // The aerial's tile is held first while the photos are asked, the
  // runways after it, and the aerial fills its own tile when it comes: the
  // runways never move from the place they were drawn in.
  const pages = card(page).getByTestId("place-pictures").locator('[data-slot="carousel-item"]');
  await expect(pages.nth(1).getByTestId("place-runway-sketch")).toBeVisible({ timeout: slow(15000) });
  aerial();
  await expect(pages).toHaveCount(2, { timeout: slow(15000) });
  await expect(pages.nth(1).getByTestId("place-runway-sketch")).toBeVisible();
  await expect(pages.nth(0).getByTestId("place-aerial")).toHaveCount(1);

  // The weather's card at the top of the Weather tab.
  await withFoot(card(page)).getByTestId("place-tab-weather").click();
  // A tab only switches what is shown (the owner, 2026-11-11): pulled all
  // the way up to read it, as a pilot would.
  await grabberTo(page, "full");
  // The sentence, written from the TAF: when it goes MVFR and what does
  // it, until when, and the gust (features/place/hourly), each time with
  // the device's zone beside it (placeCardWords' zonedClock: "02:00 CST",
  // the FPL audit's A19).
  await expect(card(page).getByTestId("place-forecast-sentence")).toHaveText(
    /^Ceilings lowering to 2,500 ft around \d\d:00 [A-Z][\w+-]*, MVFR until \d\d:00 [A-Z][\w+-]*\. Gusts up to 22 kt\.$/,
  );
  // Under it the hours, Now first from the report, then each hour of the
  // TAF, its ceiling and its wind as FPL writes a field's.
  const hours = card(page).getByTestId("place-hour");
  await expect(hours.first()).toContainText("Now");
  await expect(hours.first()).toContainText("270°T");
  expect(await hours.count()).toBeGreaterThan(12);
  await expect(hours.nth(1)).toContainText(/\d\d:00/);
  await expect(hours.filter({ hasText: "2,500" }).first()).toContainText("15G22");
  // Only the row slides sideways (the stock Carousel), not the card.
  const row = card(page).getByTestId("place-hours").locator("[data-slot=carousel-content]");
  expect(await row.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await card(page).evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  // The route's destination: the hour the flight lands in outlined, once
  // its nav log has the time.
  await expect(card(page).locator("[data-testid=place-hour][data-arrival]")).toContainText(/You\s*\d\d:\d\d/, { timeout: slow(30000) });
  // The reports as sent right under it, so the sentence is not a button:
  // the row's one button is the card's Refresh at its end (334548b54).
  await expect(card(page).getByTestId("place-weather-summary").getByRole("button")).toHaveAccessibleName(/Refresh KDLH/);
  await expect(card(page).getByTestId("place-weather")).toContainText("KDLH 102155Z 27008KT");
});

test('a field with no report wears the nearest station\'s category as "≈" within ten statute miles, and none farther; its Weather tab says whose', async ({
  page,
}) => {
  const nearby = {
    ident: "KUGN",
    distance_nm: 6.2,
    bearing_deg: 70,
    near: true,
    metar: { raw: "KUGN 102152Z 18006KT 10SM BKN025 14/06 A3002", flight_category: "MVFR", observed_at: new Date().toISOString() },
  };
  await cardWeather(page, "C81", { metar: null, nearby_metar: nearby });
  await page.goto("/app/plan?place=C81");
  await settle(page);
  // On the Weather tab, the panel all the way up.
  await withFoot(card(page)).getByTestId("place-tab-weather").click();
  // A tab only switches what is shown (the owner, 2026-11-11): pulled all
  // the way up to read it, as a pilot would.
  await grabberTo(page, "full");
  const chip = card(page).getByTestId("place-category");
  await expect(chip).toContainText("≈ MVFR", { timeout: slow(15000) });
  // In words to a reader: a role-less span has no name of its own.
  await expect(chip.locator(".sr-only")).toHaveText("About MVFR, from the report of KUGN, another station, not this field's own");
  // The weather's line says whose, and the report is under it.
  await expect(card(page).getByTestId("place-weather-summary")).toContainText("Nearest report KUGN, 6.2 nm E");
  const from = card(page).getByTestId("place-nearby-metar");
  await expect(from).toBeInViewport();
  await expect(from).toContainText("Nearest report, 6.2 nm E");
  await expect(from).toContainText("KUGN 102152Z");
  // When it was observed on its row, where a footnote said it was not
  // this field's own (the title says it is the nearest's), in the words
  // every report's time is said in (Observed, amber once it is old).
  await expect(from.getByTestId("observed")).toHaveText(/^Observed \d{4}Z, (just now|(\d+h )?\d+[hm] ago)$/);

  // Twelve miles off: the report still said, no chip.
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await cardWeather(page, "C81", { metar: null, nearby_metar: { ...nearby, distance_nm: 12, near: false } });
  await page.goto("/app/plan?place=C81");
  await settle(page);
  await expect(card(page).getByTestId("place-name")).toBeVisible({ timeout: slow(15000) });
  await expect(card(page).getByTestId("place-runway-sketch")).toBeVisible();
  await withFoot(card(page)).getByTestId("place-tab-weather").click();
  await expect(card(page).getByTestId("place-weather-summary")).toContainText("Nearest report KUGN, 12.0 nm E");
  await expect(card(page).getByTestId("place-category")).toHaveCount(0);
});
test("a field with no report wears the category modelled there, before a near station's, and its Weather tab says it is a model's", async ({
  page,
}) => {
  const nearby = {
    ident: "KUGN",
    distance_nm: 6.2,
    bearing_deg: 70,
    near: true,
    metar: { raw: "KUGN 102152Z 18006KT 10SM BKN025 14/06 A3002", flight_category: "MVFR", observed_at: new Date().toISOString() },
  };
  const modelled = { ceiling_ft: 900, visibility_sm: 4, flight_category: "IFR", valid_at: "2026-10-10T22:00:00Z" };
  await cardWeather(page, "C81", { metar: null, nearby_metar: nearby, modelled_weather: modelled });
  await page.goto("/app/plan?place=C81");
  await settle(page);
  await withFoot(card(page)).getByTestId("place-tab-weather").click();
  const chip = card(page).getByTestId("place-category");
  await expect(chip).toContainText("≈ IFR", { timeout: slow(15000) });
  await expect(chip.locator(".sr-only")).toHaveText("About IFR, modelled for this field by the National Weather Service, not a report");
  await expect(card(page).getByTestId("place-weather-summary")).toContainText("Modelled: 4 sm · ceiling 900 ft");
  const model = card(page).getByTestId("place-modelled-weather");
  // Its hour in its title, where a footnote named the model.
  await expect(model).toContainText("Modelled for 2200Z");
  await expect(model).toContainText("IFR");
  await expect(model).toContainText("900 ft");
  await expect(model).toContainText("4 sm");
  // The near station's report is still there, under it.
  await expect(card(page).getByTestId("place-nearby-metar")).toContainText("KUGN 102152Z");
});
test("an airport's card calls the field and finds it in Maps, from the FAA's airport file", async ({ page }) => {
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airport/KDLH"),
    async (route) => {
      const answer = await route.fetch();
      await route.fulfill({
        response: answer,
        // Its name as NASR files it, which Maps is asked for.
        json: { ...(await answer.json()), name: "Duluth Intl", phone: "218-727-2968", address: "4701 Grinden Dr, Duluth, MN 55811" },
      });
    },
  );
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airport/C81"),
    async (route) => {
      const answer = await route.fetch();
      // And no list of charts at all, as a planner older than the list
      // answers: the card still draws.
      await route.fulfill({ response: answer, json: { ...(await answer.json()), phone: null, address: null, procedures: undefined } });
    },
  );
  await page.goto("/app/plan?place=KDLH");
  await settle(page);
  await expect(card(page).getByTestId("place-call")).toHaveAttribute("href", "tel:218-727-2968", { timeout: slow(15000) });
  await expect(card(page).getByTestId("place-address")).toHaveAttribute(
    "href",
    "https://maps.apple.com/?q=Duluth%20Intl&address=4701%20Grinden%20Dr%2C%20Duluth%2C%20MN%2055811",
  );

  // A field the FAA lists no phone for: Call greyed, and the Info tab's Address by where it is.
  await page.goto("/app/plan?place=C81");
  await settle(page);
  await expect(card(page).getByTestId("place-call")).toBeDisabled({ timeout: slow(15000) });
  await expect(card(page).getByTestId("place-address")).toHaveAttribute("href", /^https:\/\/maps\.apple\.com\/\?q=.+&ll=42\.\d+,-88\.\d+$/);
});

test("an airport's card keeps one layout whatever the field: a long name in two lines under the ident, a field with no runways to draw saying so", async ({
  page,
}) => {
  const layout = async (ident: string) => {
    await page.goto(`/app/plan?place=${ident}`);
    await settle(page);
    await expect(card(page).getByTestId("fly-here")).toBeEnabled({ timeout: slow(15000) });
    // From the pictures' top, wherever the card has scrolled to: the
    // actions under them, and the name's lines inside them.
    const measure = async () => {
      const [head, tiles, where] = await Promise.all(
        ["place-head", "fly-here", "place-full-name"].map(async (id) => (await card(page).getByTestId(id).boundingBox())!),
      );
      return { tiles: Math.round(tiles.y - head.y), whereFoot: Math.round(where.y + where.height - head.y), head: Math.round(head.height) };
    };
    return steady(measure);
  };
  const short = await layout("C81");
  // A name long enough to need two lines.
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airport/KORD"),
    async (route) => {
      const answer = await route.fetch();
      await route.fulfill({
        response: answer,
        json: { ...(await answer.json()), name: "Chicago O'Hare International Airport and Its Many Long Words" },
      });
    },
  );
  const long = await layout("KORD");
  expect(long.tiles).toBe(short.tiles);
  expect(long.head).toBe(short.head);
  // Its lines inside the pictures, over their foot.
  expect(long.whereFoot).toBeLessThanOrEqual(long.head);
  await expect(card(page).getByTestId("place-name")).toHaveText("KORD");

  // No runway the sketch can draw: its page of the pictures there all the
  // same, saying so.
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airport/3CK"),
    async (route) => {
      const answer = await route.fetch();
      await route.fulfill({
        response: answer,
        json: { ...(await answer.json()), runways: [], airport_diagram_cycle: null, airport_diagram_url: null },
      });
    },
  );
  const none = await layout("3CK");
  expect(none.tiles).toBe(short.tiles);
  await expect(card(page).getByTestId("place-runway-sketch")).toHaveText("No runways to draw");
});

test("the card's scroll runs down to the sheet's foot, over the home indicator's inset, at the pilot's ask", async ({ page, isMobile }) => {
  test.skip(!isMobile, "a phone's sheet: the card on a larger screen has no foot to run to");
  await page.goto("/app/plan?dep=C81&dest=KDLH&place=KDLH");
  await settle(page);
  await expect(card(page).getByTestId("fly-here")).toBeEnabled({ timeout: slow(15000) });
  // The body runs to the sheet's own foot (MapPanel's toEdge), no room
  // kept under it.
  await expect(async () => {
    const [scroll, sheet] = await Promise.all([card(page).boundingBox(), sideDrawer(page).boundingBox()]);
    expect(Math.abs(sheet!.y + sheet!.height - (scroll!.y + scroll!.height))).toBeLessThanOrEqual(1);
  }).toPass({ timeout: slow(10_000) });
});
