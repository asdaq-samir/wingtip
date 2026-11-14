import { test, expect } from "@playwright/test";
import {
  airportMark,
  airportMarks,
  clearTheRoute,
  closeCard,
  consoleSheet,
  drawn,
  expectDrawerClosed,
  firstRow,
  grabberTo,
  inSheet,
  mapStill,
  openConsole,
  openMapSettings,
  openPanel,
  searchAirports,
  settle,
  settled,
  showTabs,
  sideDrawer,
  slow,
  tapNear,
  tapTheChart,
  frontSheet,
} from "./helpers";
import { markWith } from "./marks";
import { airportToTap, card, cardWeather, closeInOn, holdPlannerSearch, tafFromNow, withPrivateFields } from "./placeCard";
import { ownHomeBase, showPage } from "./oneSearch";
import { pickAirplane } from "./startState";

/** Airports as places, as Maps has them: a tap on one on the chart opens its card in the panel -- its name, what kind of field it is, the
 *  weather there as pilots read it -- with Fly Here, Weather and Frequencies; the card is the address's (?place=) and puts itself away. */

test("the departure's own card says no distance from itself while the pilot's position is not known", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH&place=C81");
  await settle(page);
  // No Distance row: no "here of C81", as the phones said no "From KMSN 0 nm" (PlaceCard's distanceOf).
  await expect(card(page).getByTestId("place-elevation")).toBeVisible({ timeout: slow(15000) });
  await expect(card(page).getByTestId("place-distance")).toHaveCount(0);
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
  // Measured from the route's departure while the pilot's own position is not known, a row of the Details.
  await expect(card(page).getByTestId("place-line")).toHaveCount(0);
  await expect(card(page).getByTestId("place-distance")).toHaveText(/^Distance\d+ nm NW of C81$/);
  // Its share at the head's start, the name centred, ✕ at its end (cards.spec), the star a tile (2026-11-11); the card the whole sheet.
  for (const id of ["place-share", "place-favorite", "place-close"]) await expect(card(page).getByTestId(id)).toBeInViewport();
  await expect(firstRow(page)).toBeHidden();
  // Four tiles in a row at half, nothing else -- Add Stop for the route's
  // destination greyed, saying why (0612a82b3, the owner: "show it but
  // disable it") -- Info open.
  await expect(card(page).getByTestId("place-actions")).toBeInViewport({ ratio: 1 });
  await expect(card(page).getByTestId("place-actions").locator(":scope > *")).toHaveText([/Fly Here|≈ \d/, /Add Stop/, /Call/, /Favorite/]);
  await expect(card(page).getByTestId("place-add-stop")).toBeDisabled();
  await expect(card(page).getByTestId("place-add-stop")).toHaveAccessibleName(/already on the route/);
  await expect(card(page).getByRole("tab")).toHaveText(["Info", "Weather", "Runways", /^Charts\d*$/]);
  await expect(card(page).getByTestId("place-tab-radio")).toHaveAttribute("aria-selected", "true");
  const [actions, bar] = await Promise.all(
    [card(page).getByTestId("place-actions"), card(page).getByRole("tablist")].map(async (l) => (await l.boundingBox())!),
  );
  expect(bar.y).toBeGreaterThanOrEqual(actions.y + actions.height);

  // Weather: the panel all the way up, the weather's card at the tab's top, its category in the FAA's colour:
  // with no TAF, a sentence from the report and Now alone; its first row ends in the card's Refresh (the owner, 2026-11-11).
  await card(page).getByTestId("place-tab-weather").click();
  // A tab only switches what is shown (the owner, 2026-11-11): pulled all
  // the way up to read it, as a pilot would.
  await grabberTo(page, "full");
  await expect(card(page).getByTestId("place-category")).toBeVisible();
  await expect(card(page).getByTestId("place-forecast-sentence")).toHaveText("VFR now, no forecast for this field.");
  await card(page).getByTestId("place-weather-summary").getByTestId("airport-refresh").click();
  await expect(card(page).getByTestId("place-hour")).toHaveCount(1);
  await expect(card(page).getByTestId("place-hour").first()).toContainText("Now");

  // Info: the field's elevation and airspace in its details.
  await card(page).getByTestId("place-tab-radio").click();
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "full");
  await expect(card(page).getByTestId("place-elevation")).toContainText(/[\d,]+ ft$/);
  await expect(card(page).getByTestId("place-airspace")).toHaveText(/^AirspaceClass D$/);
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
  // Its aerial too, so the order is the card's and not the photos' absence.
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airport/KDLH/photos"),
    (route) => route.fulfill({ json: { aerial_url: "/api/planner/airport-aerial/KDLH.jpg", photo: null } }),
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH&place=KDLH");
  await settle(page);
  // The aerial the first page of the pictures, the runways after it (the
  // owner's ask, 2026-10-29).
  const pages = card(page).getByTestId("place-pictures").locator('[data-slot="carousel-item"]');
  await expect(pages).toHaveCount(2, { timeout: slow(15000) });
  await expect(pages.nth(0).getByTestId("place-aerial")).toHaveCount(1);
  await expect(pages.nth(1).getByTestId("place-runway-sketch")).toBeVisible();

  // The weather's card at the top of the Weather tab.
  await card(page).getByTestId("place-tab-weather").click();
  // A tab only switches what is shown (the owner, 2026-11-11): pulled all
  // the way up to read it, as a pilot would.
  await grabberTo(page, "full");
  // The sentence, written from the TAF: when it goes MVFR and what does
  // it, until when, and the gust (features/plan/lib/hourly).
  await expect(card(page).getByTestId("place-forecast-sentence")).toHaveText(
    /^Ceilings lowering to 2,500 ft around \d\d:00, MVFR until \d\d:00\. Gusts up to 22 kt\.$/,
  );
  // Under it the hours, Now first from the report, then each hour of the
  // TAF, its ceiling and its wind as FPL writes a field's.
  const hours = card(page).getByTestId("place-hour");
  await expect(hours.first()).toContainText("Now");
  await expect(hours.first()).toContainText("270°T");
  expect(await hours.count()).toBeGreaterThan(12);
  await expect(hours.nth(1)).toContainText(/\d\d:00/);
  await expect(hours.filter({ hasText: "2,500" }).first()).toContainText("15G22");
  // Only the row scrolls sideways, not the card.
  const row = card(page).getByTestId("place-hours");
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
  await card(page).getByTestId("place-tab-weather").click();
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
  // this field's own (the title says it is the nearest's).
  await expect(from).toContainText(/\d{4}Z · (just now|(\d+h )?\d+[hm] ago)/);

  // Twelve miles off: the report still said, no chip.
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await cardWeather(page, "C81", { metar: null, nearby_metar: { ...nearby, distance_nm: 12, near: false } });
  await page.goto("/app/plan?place=C81");
  await settle(page);
  await expect(card(page).getByTestId("place-name")).toBeVisible({ timeout: slow(15000) });
  await expect(card(page).getByTestId("place-runway-sketch")).toBeVisible();
  await card(page).getByTestId("place-tab-weather").click();
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
  await card(page).getByTestId("place-tab-weather").click();
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
        json: { ...(await answer.json()), phone: "218-727-2968", address: "4701 Grinden Dr, Duluth, MN 55811" },
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
    "https://maps.apple.com/?q=Duluth%20International%20Airport&address=4701%20Grinden%20Dr%2C%20Duluth%2C%20MN%2055811",
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
    let last = await measure();
    await expect
      .poll(
        async () => {
          await page.waitForTimeout(300);
          const now = await measure();
          const still = JSON.stringify(now) === JSON.stringify(last);
          last = now;
          return still;
        },
        { timeout: slow(10000) },
      )
      .toBe(true);
    return last;
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

test("an airport's card has four tabs right under its actions, in sight at half, Info first; a tab takes the panel up, and the open one again, down", async ({
  page,
}) => {
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airport/C81"),
    async (route) => {
      const answer = await route.fetch();
      await route.fulfill({
        response: answer,
        json: {
          ...(await answer.json()),
          airport_diagram_url: null,
          airport_diagram_cycle: null,
          procedures: [{ kind: "IAP", name: "RNAV (GPS) RWY 24", url: "https://aeronav.faa.gov/d-tpp/2610/05887R24.PDF" }],
        },
      });
    },
  );
  await page.goto("/app/plan?place=C81");
  await settle(page);
  // Opened half way: the actions whole in it, then the pictures and the tabs' bar (Apple Maps' card, 2026-11-10).
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
  await expect(card(page).getByTestId("fly-here")).toBeEnabled({ timeout: slow(15000) });
  await expect(card(page).getByTestId("place-actions")).toBeInViewport({ ratio: 1 });
  const tabs = card(page).getByRole("tab");
  await expect(tabs).toHaveText(["Info", "Weather", "Runways", /^Charts\d*$/]);
  await expect(card(page).getByTestId("place-tab-radio")).toHaveAttribute("aria-selected", "true");
  // No weather summary over the bar: the weather is its tab's.
  await expect(card(page).getByTestId("place-weather-summary")).toHaveCount(0);

  // All the way up, the bar in sight under the actions; Runways: the pattern and the runways.
  await grabberTo(page, "full");
  await expect(card(page).getByRole("tablist")).toBeInViewport({ ratio: 1 });
  await card(page).getByTestId("place-tab-runways").click();
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "full");
  const runways = card(page).getByRole("tabpanel").getByTestId("place-runways");
  await expect(runways).toContainText("Pattern altitude");
  await expect(runways).toContainText(/Runway \d/);

  // Charts: the airport's (none from the FAA: the card's sketch instead),
  // and its approach as the FAA prints its title.
  await card(page).getByTestId("place-tab-diagrams").click();
  const charts = card(page).getByRole("tabpanel").getByTestId("place-charts");
  await expect(charts.getByTestId("airport-diagram-sketch")).toContainText("A sketch of the runways");
  const approach = charts.getByTestId("terminal-chart");
  await expect(approach).toHaveText(/RNAV \(GPS\) RWY 24/);
  // Shown in the app (airport-diagram.spec), not a link out of it.
  await expect(approach).not.toHaveAttribute("href", /.*/);

  // The open tab tapped again: the sheet stays where it was dragged (the
  // owner, 2026-11-11: a tab only switches what is shown).
  await card(page).getByTestId("place-tab-diagrams").click();
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "full");
  await expect(card(page).getByRole("tablist")).toBeVisible();
});

test("an airport's Info lists its first frequencies, and its title the way to every one; scrolled past the pictures, a bar with the ident keeps the close in sight", async ({
  page,
}) => {
  await page.goto("/app/plan?place=KDLH");
  await settle(page);
  await grabberTo(page, "full"); // Info's frequencies, under its pictures, out of a phone's half sheet
  await card(page).getByTestId("place-tab-radio").click();
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "full");
  const rows = card(page).getByTestId("place-frequency");
  await expect(rows).toHaveCount(3, { timeout: slow(15000) });
  const more = card(page).getByTestId("place-frequencies-more");
  await expect(card(page).getByTestId("place-frequencies")).toContainText(/3 of \d+/);
  await more.click();
  expect(await rows.count()).toBeGreaterThan(3);
  // Opened in place, its title closes it again, its chevron turned down
  // (18df8d6b4, the owner: "how do you go back to shorter list once it's
  // expanded?"): the stock Collapsible's trigger, said expanded.
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(card(page).getByTestId("place-frequencies")).not.toContainText(/3 of \d+/);
  // Down past them to the Details' address: the card's one head row, name and close, pinned at its top (PinnedHead).
  await card(page).getByTestId("place-address").scrollIntoViewIfNeeded();
  await expect(card(page).getByTestId("place-close")).toBeInViewport({ ratio: 1 });
});

/** A field's procedures' list, not one procedure's drawing. */
const isProcedureList = (url: string) => new URL(url).pathname.endsWith("/procedures");

test("the route's Procedures open its destination's card on its approaches, and Nearest is on the map's left", async ({ page }) => {
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airport/KDLH"),
    async (route) => {
      const answer = await route.fetch();
      await route.fulfill({
        response: answer,
        json: {
          ...(await answer.json()),
          procedures: [
            { kind: "MIN", name: "TAKEOFF MINIMUMS", url: "https://aeronav.faa.gov/d-tpp/2610/NC1TO.PDF" },
            { kind: "IAP", name: "ILS OR LOC RWY 09", url: "https://aeronav.faa.gov/d-tpp/2610/00125IL9.PDF" },
            { kind: "IAP", name: "RNAV (GPS) RWY 27", url: "https://aeronav.faa.gov/d-tpp/2610/00125R27.PDF" },
          ],
        },
      });
    },
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  // Nearest is the search's own page's (its Nearest section), not a button
  // on the map's left; the map's own buttons stay on its right.
  await expect(page.locator("[data-map-controls-left]")).toHaveCount(0);
  await showTabs(page);
  await expect(page.getByTestId("search-airports")).toBeVisible();
  const settings = page.locator("[data-map-controls]").getByTestId("map-settings-button");
  const width = page.viewportSize()!.width;
  expect((await settings.boundingBox())!.x).toBeGreaterThan(width / 2);

  // The destination's approach charts, from an approach's page in FPL's
  // route all the way up: the route's own Approach charts row went (the
  // owner's "no need for the approach plates section because this can be
  // looked at by selecting the approach").
  await page.route(
    (url) => /\/airport\/KDLH\/procedures/.test(url.pathname),
    (route) =>
      route.fulfill({
        json: isProcedureList(route.request().url())
          ? {
              airport: "KDLH",
              cycle: "261001",
              stale: false,
              procedures: [
                { kind: "approach", id: "I09", name: "ILS OR LOC RWY 09", runway: "RW09", transitions: [], runway_transitions: [] },
              ],
            }
          : {
              airport: "KDLH",
              kind: "approach",
              id: "I09",
              name: "ILS OR LOC RWY 09",
              transition: null,
              cycle: "261001",
              stale: false,
              lines: [],
              holds: [],
              fixes: [],
            },
      }),
  );
  await grabberTo(page, "full");
  await sideDrawer(page).getByRole("region", { name: "KDLH · Arrive" }).locator("[data-testid=procedure-kind][data-kind=approach]").click();
  // The pull-down's foot opens the field's whole list (ProcedureMenu).
  await page.getByTestId("procedure-menu-all").click();
  await page.getByTestId("procedure-option").first().click();
  await page.getByTestId("procedure-chart").click();
  await expect(card(page).getByTestId("place-name")).toHaveText("KDLH", { timeout: slow(15000) });
  // Half way, as every card opens (f874bc242: no longer all the way up;
  // the pilot swipes up for the plates).
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
  // On its Charts tab.
  await expect(card(page).getByTestId("place-tab-diagrams")).toHaveAttribute("aria-selected", "true");
  const approaches = card(page).locator('[data-chart-group="Approaches"]');
  await expect(approaches.getByTestId("terminal-chart")).toHaveText([/ILS or LOC rwy 09/, /RNAV \(GPS\) rwy 27/]);
  await expect(approaches).toBeInViewport();
});

// A card opened from a Favorite -- here, from the address on a page just
// loaded -- names the field and has its tiles in their places, and the map
// is on the field with its ring, before the card's answer is in: on a
// phone the answer queued behind the page's first requests, and the card
// stood empty under its ident with the map on the pilot's position.
test("a Favorite's card names it and the map goes to it before the card's answer is in", async ({ page }) => {
  await page.addInitScript(() => {
    const kept = { ident: "KBUR", name: "Hollywood Burbank/Bob Hope Airport", municipality: "Burbank", lat: 34.2007, lon: -118.3587 };
    localStorage.setItem("wingtip.preferences", JSON.stringify({ state: { favoriteAirports: [kept] }, version: 0 }));
  });
  let answer: () => void = () => {};
  const held = new Promise<void>((go) => {
    answer = go;
  });
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airport/KBUR"),
    async (route) => {
      await held;
      await route.fallback();
    },
  );
  await page.goto("/app/plan?place=KBUR");
  await settle(page);
  await expect(card(page).getByTestId("place-name")).toHaveText("KBUR");
  await expect(card(page).getByTestId("place-full-name")).toContainText("Hollywood Burbank/Bob Hope Airport");
  await expect(card(page).getByTestId("fly-here")).toBeDisabled();
  // The field's ring drawn on the chart, in sight: a layer of the map now,
  // read through its probe (AirportsGl's selected-airport), not an HTML mark.
  await expect(async () => {
    const ring = (await drawn(page, "selected-airport"))[0] as { x: number; y: number } | undefined;
    expect(ring, "the selected field's ring drawn").toBeDefined();
    const map = (await page.locator(".maplibregl-map").boundingBox())!;
    expect(ring!.x).toBeGreaterThanOrEqual(0);
    expect(ring!.x).toBeLessThanOrEqual(map.width);
    expect(ring!.y).toBeGreaterThanOrEqual(0);
    expect(ring!.y).toBeLessThanOrEqual(map.height);
  }).toPass({ timeout: slow(10_000) });
  // Its own shape already, at the pilot's ask: the actions and the star
  // in their places, the star a Favorite's, waiting on the answer.
  await expect(card(page).getByTestId("place-favorite")).toHaveAttribute("aria-pressed", "true");
  await expect(card(page).getByTestId("place-favorite")).toBeDisabled();
  // Measured once the card has come up: its slide in is not a move.
  await settled(sideDrawer(page));
  const actionsBefore = (await card(page).getByTestId("fly-here").boundingBox())!;

  answer();
  await expect(card(page).getByTestId("fly-here")).toBeEnabled({ timeout: slow(15_000) });
  await expect(card(page).getByTestId("place-favorite")).toBeEnabled();
  // And the head and its actions where they were: nothing above the
  // frequencies grew or moved as it came.
  expect(Math.abs((await card(page).getByTestId("fly-here").boundingBox())!.y - actionsBefore.y)).toBeLessThan(2);
  // Nothing to measure from: no line under the name, no Distance row.
  await expect(card(page).getByTestId("place-line")).toHaveCount(0);
  await expect(card(page).getByTestId("place-distance")).toHaveCount(0);
});

// A planner out of reach for a moment (restarted, say) is not an airport
// that does not exist: the card says it could not look it up, and asks
// again where it is.
test("an airport's card that could not be had says so, and Try again brings it", { tag: "@smoke" }, async ({ page }) => {
  let down = true;
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airport/KDLH"),
    (route) => (down ? route.fulfill({ status: 502, body: "" }) : route.fallback()),
  );
  await page.goto("/app/plan?place=KDLH");
  await settle(page);
  await expect(card(page)).toContainText("Could not be looked up", { timeout: slow(30_000) });
  // No star and no tabs on a card that could not be had: a greyed star
  // that never enables would have nothing to say why.
  await expect(card(page).getByTestId("place-favorite")).toHaveCount(0);
  down = false;
  await card(page).getByTestId("place-retry").click();
  await expect(card(page).getByTestId("place-name")).toHaveText("KDLH");
  await expect(card(page).getByTestId("place-retry")).toHaveCount(0);
  // The answer in: its star enabled, and NASR's name (wingtip.field_use.named),
  // which the map's mark had given the card while it waited.
  await expect(card(page).getByTestId("place-favorite")).toBeEnabled();
  await expect(card(page).getByTestId("place-full-name")).toContainText("Duluth Intl");
});

test("an airport tapped on the chart while Setup is up puts Setup away and opens its card on Airport", async ({ page }) => {
  // The owner's notice: "When selecting airport marker while being on
  // setup tab doesn't open the [airport] tab."
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "Setup leaves the chart in sight on a phone");
  await withPrivateFields(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  // A route's link opens on FPL; the account button is the Search page's
  // (its toggle, PageToggle).
  await showPage(page, 0);
  await openConsole(page);
  await expect(consoleSheet(page)).toBeVisible();
  await grabberTo(page, "peek");
  const at = await airportToTap(page);
  await page.mouse.click(at.x, at.y);
  await expect(page).toHaveURL(/[?&]place=[A-Z0-9]+/);
  await expect(consoleSheet(page)).toHaveCount(0);
  await expect(card(page).getByTestId("place-name")).not.toBeEmpty();
  // The account page put away for the card, the card the whole sheet; closed, the title row and its button back.
  await closeCard(page, "place-close");
  await grabberTo(page, "half");
  await expect(page.getByTestId("account-button")).toBeVisible();
});

test("a tap on an airport on the chart opens its card, a tap elsewhere puts it away, and Fly Here makes it the destination", async ({
  page,
}) => {
  await withPrivateFields(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const at = await airportToTap(page);
  await page.mouse.click(at.x, at.y);
  await expect(page).toHaveURL(/[?&]place=[A-Z0-9]+/);
  await expect(card(page).getByTestId("place-name")).not.toBeEmpty();
  // Half way, as Maps opens a place.
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
  await expect(card(page).getByTestId("fly-here")).toBeVisible();

  // A tap on the chart elsewhere puts it away, as in Maps, the map left at
  // the zoom the pilot put it (MapShell); the location arrow brings the
  // whole route back, and an airport tapped again brings a card back.
  await tapTheChart(page);
  await expect(page).not.toHaveURL(/[?&]place=/);
  await expect(card(page)).toHaveCount(0);
  await expectDrawerClosed(page);
  const arrow = page.locator("[data-map-controls]").getByTestId("my-position-button");
  await expect(arrow).toHaveAttribute("data-face", "route");
  await arrow.click();
  await expect(arrow).toHaveAttribute("data-face", "position");
  await mapStill(page);
  const again = await airportToTap(page);
  await page.mouse.click(again.x, again.y);
  await expect(card(page).getByTestId("place-name")).not.toBeEmpty();

  // Fly Here: the field becomes the destination, from the route's
  // departure, and the card goes.
  const ident = new URL(page.url()).searchParams.get("place")!;
  await card(page).getByTestId("fly-here").click();
  await expect(page).toHaveURL(new RegExp(`[?&]dest=${ident}(&|$)`));
  await expect(page).toHaveURL(/[?&]dep=C81(&|$)/);
  await expect(page).not.toHaveURL(/[?&]place=/);
  await expect(card(page)).toHaveCount(0);
});

test("the airport whose card is open wears a ring round its mark, clear of it on every side, its ident over it", async ({ page }) => {
  // C81 reporting VFR: its weather's dot on the tiles' mark.
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airports/in-view"),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          airports: [
            {
              ident: "C81",
              name: "Campbell",
              lat: 42.3246,
              lon: -88.0741,
              kind: "small",
              flight_category: "VFR",
              military: null,
              airspace_class: "G",
            },
          ],
        }),
      }),
  );
  await page.goto("/app/plan?place=C81");
  await settle(page);
  // Its card at the pill's size, the chart over it in sight.
  await grabberTo(page, "peek");
  // The ring on the map's canvas, under the airports' marks and idents (its
  // layer is drawn before theirs: AirportsGl), as its probe says.
  const ring = async () => (await drawn(page, "selected-airport"))[0] as { x: number; y: number } | undefined;
  await expect.poll(async () => (await airportMark(page, "C81"))?.chip, { timeout: slow(15000) }).toBe(true);
  await expect.poll(async () => !!(await ring())).toBe(true);
  // Round the mark itself, once the map has stopped moving the two together.
  await expect(async () => {
    const r = (await ring())!;
    const c = (await airportMark(page, "C81"))!;
    const map = (await page.locator(".maplibregl-map").boundingBox())!;
    expect(Math.abs(c.x - (map.x + r.x))).toBeLessThan(1);
    expect(Math.abs(c.y - (map.y + r.y))).toBeLessThan(1);
  }).toPass({ timeout: slow(10000) });

  // Put away, the ring goes with the card.
  await closeCard(page, "place-close");
  await expect.poll(async () => !!(await ring())).toBe(false);
});

test("the chart's airports wear their weather's dot, from the METARs of the fields in view", async ({ page }) => {
  // The fields are the overlay tiles' (the suite's archive round Chicago);
  // their weather the planner's reporting fields in view, joined on by
  // ident (AirportsGl): Campbell VFR, Waukegan IFR.
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airports/in-view"),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          airports: [
            { ident: "C81", name: "Campbell", lat: 42.3246, lon: -88.0741, kind: "small", flight_category: "VFR", military: null },
            {
              ident: "KUGN",
              name: "Waukegan National",
              lat: 42.4222,
              lon: -87.8679,
              kind: "medium",
              flight_category: "IFR",
              military: null,
            },
          ],
        }),
      }),
  );
  await page.goto("/app/plan?place=C81");
  await settle(page);
  // The disc in its METAR's colour: VFR green, IFR red (no report's
  // grey, classb.spec).
  await expect.poll(async () => (await airportMark(page, "C81"))?.weather.toLowerCase(), { timeout: slow(15000) }).toBe("#1a7f37");
  await expect.poll(async () => (await airportMark(page, "KUGN"))?.weather.toLowerCase(), { timeout: slow(15000) }).toBe("#b3261e");
  expect((await airportMark(page, "C81"))!.use).toBe("");
});

test("the map's Private setting draws the private fields, off by default and kept across a reload", async ({ page }) => {
  // The owner, 2026-10-27: "toggles to show private airports or not", and
  // "Make private airports hidden by default". Donald Alfred Gade (IL11),
  // a private field north of Campbell in the suite's overlay tiles, drawn
  // from the app's level 10 (wingtip.vector_tiles' AIRPORT_MIN_ZOOM): its
  // card's map brought in to it, round it.
  await closeInOn(page, "IL11", 10);
  // Other fields drawn round it, it not.
  await expect.poll(async () => (await airportMarks(page)).length, { timeout: slow(15000) }).toBeGreaterThan(0);
  expect(await airportMark(page, "IL11")).toBeFalsy();
  await openMapSettings(page);
  await expect(page.getByTestId("private-toggle")).toHaveAttribute("aria-pressed", "false");
  // Under the Map card's edge at half, as every card opens: pulled up to it.
  await inSheet(page, page.getByTestId("private-toggle"));
  await page.getByTestId("private-toggle").click();
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await airportMark(page, "IL11"))?.use, { timeout: slow(15000) }).toBe("private");
  // The airport's card kept under the settings', as it was.
  await expect(page).toHaveURL(/[?&]place=IL11/);
  // Loaded afresh: the setting kept.
  await closeInOn(page, "IL11", 10);
  await expect.poll(async () => (await airportMark(page, "IL11"))?.use, { timeout: slow(15000) }).toBe("private");
});

test("closer in, the airports that report wear their weather's colour, and a tap on one opens its card", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const chips = { count: async () => (await airportMarks(page)).filter((m) => m.chip).length };
  await expect.poll(markWith(page, "route-marks", "KDLH"), { timeout: slow(30000) }).not.toBeNull();
  // At the whole route's zoom on a phone, past the sectional's scale, only
  // the biggest fields that report wear their marks, each with its room
  // round it (AirportsLayer's OUT_APART_PX, 80 px), where a state's worth
  // would bury the chart; a computer's view of the route is zoom 7 or in,
  // where every field that reports wears one (REPORTING_FROM_ZOOM). Measured
  // once they are in: the count of none this asked for lost the race with
  // their answer (CI, 2026-10-17, 52 of them as they should be).
  if (page.viewportSize()!.width < 768) {
    await mapStill(page);
    await expect.poll(() => chips.count(), { timeout: slow(20000) }).toBeGreaterThan(0);
    const at = (await airportMarks(page)).filter((m) => m.chip);
    let nearest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < at.length; i++) {
      for (let j = i + 1; j < at.length; j++) nearest = Math.min(nearest, Math.hypot(at[i]!.x - at[j]!.x, at[i]!.y - at[j]!.y));
    }
    expect(nearest).toBeGreaterThanOrEqual(78);
  }

  // In on the departure, a notch at a time with the map still between
  // them, as tapTheChart waits: turned while the route was still being
  // fitted, a wheel's zoom can be undone by the fit. On a loaded machine
  // the chips never came, three runs of 2026-10-09.
  const departure = markWith(page, "route-marks", "C81");
  for (let notch = 0; notch < 3; notch++) {
    await mapStill(page);
    const at = (await departure())!;
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, -60);
  }
  await mapStill(page);
  await expect.poll(() => chips.count(), { timeout: slow(20000) }).toBeGreaterThan(0);
  // The route's own airports keep their own chips: none drawn twice.
  expect((await airportMarks(page)).filter((m) => m.chip && m.ident === "C81")).toHaveLength(0);

  // One whose middle nothing else covers, found and tapped again while
  // the map is still settling from the zoom (a CI runner's last frames
  // moved the chip from under the tap).
  await expect(async () => {
    const drawn = (await airportMarks(page)).filter((m) => m.chip);
    const at = await page.evaluate((marks) => {
      for (const m of marks) {
        const hit = document.elementFromPoint(m.x, m.y);
        if (hit?.matches("canvas.maplibregl-canvas")) return m;
      }
      return null;
    }, drawn);
    expect(at, "a chip with nothing over it").not.toBeNull();
    await page.mouse.click(at!.x, at!.y);
    await expect(page).toHaveURL(new RegExp(`[?&]place=${at!.ident}`), { timeout: 2000 });
  }).toPass({ timeout: slow(20000) });
  await expect(card(page).getByTestId("fly-here")).toBeVisible({ timeout: slow(15000) });
});

test("a tap a little off an airport's mark opens its card, the route's own as any field of the chart's", async ({ page }) => {
  // Waukegan, a field of the chart's own (the overlay tiles), some 90
  // points from the route's departure at a card's zoom, reporting VFR. A
  // tap that near the route's own field put the card away: only the
  // chart's own were near.
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airports/in-view"),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          airports: [
            {
              ident: "KUGN",
              name: "Waukegan National",
              lat: 42.4222,
              lon: -87.8679,
              kind: "medium",
              flight_category: "VFR",
              military: null,
              airspace_class: "D",
            },
          ],
        }),
      }),
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH&place=KUGN");
  await settle(page);
  await expect(card(page)).toBeVisible({ timeout: slow(15000) });
  // The departure's mark, the route's own, not the chart's.
  await tapNear(page, markWith(page, "route-marks", "C81"), /[?&]place=C81(&|$)/);
  await tapNear(page, () => airportMark(page, "KUGN"), /[?&]place=KUGN(&|$)/);
});

test("the airport search answers from the phone's own copy, asking the planner nothing as it is typed", async ({ page }) => {
  // The planner's index (wingtip.airports.search_index), two fields of it.
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airports/index"),
    (route) =>
      route.fulfill({
        json: {
          airports: [
            ["KOSH", "Wittman Regional Airport", "Oshkosh", "WI", 1, "OSH"],
            ["2WN8", "Oshkosh Sky Ranch Airport", "Omro", "WI", 2],
          ],
        },
      }),
  );
  // The planner's answer held (holdPlannerSearch): the airports the phone's.
  const release = await holdPlannerSearch(page);
  const asked: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/airports/search")) asked.push(request.url());
  });
  const index = () => page.waitForResponse((response) => response.url().includes("/api/planner/airports/index"));
  // Downloaded once the page is idle; read once the pilot goes to type.
  const downloaded = index();
  await page.goto("/app/plan");
  await settle(page);
  await downloaded;
  // Out, on the one search.
  await grabberTo(page, "full");
  await showTabs(page);
  const search = page.getByTestId("search-airports");
  const read = index();
  await search.click();
  await read;
  await search.pressSequentially("oshk");
  // Wittman by its town, the bigger field first, from the browser's own
  // copy (the waypoints and navaids beside them are the planner's).
  await expect(searchAirports(page)).toHaveText([/KOSH/, /2WN8/]);
  expect(asked.filter((url) => !/fixes=true/.test(url))).toEqual([]);
  release();
});

test("with no route the panel is a search bar: Home is set from Favorites, an airport found is starred onto Favorites, and Fly Here flies from Home", async ({
  page,
}) => {
  await ownHomeBase(page); // this test's Home its own, not the shared account's
  await page.goto("/app/plan");
  await settle(page);
  // A browser's own Favorites, from nothing.
  await page.evaluate(() => localStorage.removeItem("wingtip.preferences"));
  await page.reload();
  await settle(page);
  const search = page.getByTestId("search-airports");
  // The pill, as a fresh load opens; out on the one search.
  await expect(sideDrawer(page)).toHaveAttribute("data-capsule", "true");
  await grabberTo(page, "full");
  await showTabs(page);
  await expect(search).toBeVisible();

  // Focused, the sheet stays all the way up on Favorites, Home not set
  // yet; its Add asks the search bar for the field.
  await search.click();
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "full");
  // Favorites' strip, where it is at the pill's size (the owner's "I want
  // the favorites filter to stay when it's full").
  await expect(page.getByTestId("pill-home")).toContainText("Add");
  await page.getByTestId("pill-home").click();
  await expect(search).toHaveAttribute("placeholder", "Search for your home airport");
  await search.fill("C81");
  await searchAirports(page).filter({ hasText: "C81" }).first().click();
  await expect(page.getByTestId("pill-home")).not.toContainText("Add");

  // A word of the town finds the field, the bigger one first; the star
  // on its card makes it a favorite.
  await search.click();
  await search.fill("duluth");
  const first = searchAirports(page).first();
  await expect(first).toContainText("KDLH", { timeout: slow(10000) });
  await first.click();
  await expect(card(page).getByTestId("place-name")).toHaveText("KDLH");
  await card(page).getByTestId("place-favorite").click();
  await expect(card(page).getByTestId("place-favorite")).toHaveAttribute("aria-pressed", "true");
  // Put away, back to the search as typed (29eabc410); cleared, Favorites.
  await closeCard(page, "place-close");
  await expect(search).toHaveValue("duluth");
  await sideDrawer(page).getByTestId("search-clear").click();
  await search.click();
  const kept = page.getByTestId("pill-favorites").getByRole("button", { name: /^KDLH\b.*Class [BCDEG]$/ });
  await expect(kept).toBeVisible();

  // Its tile opens its card, whose Fly Here goes from Home.
  await kept.click();
  await card(page).getByTestId("fly-here").click();
  await expect(page).toHaveURL(/dep=C81/);
  await expect(page).toHaveURL(/dest=KDLH/);
  // The card away, the sheet the size it was under it, full (571dc31a0).
  await expect(card(page)).toHaveCount(0);
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "full");

  // Lowered, the route rests as the one row (its figures under it in the
  // side panel, on a phone from half), the departure Home in the box half way; Clear the route, in its
  // Share menu, clears it -- its box and the controls left in their places
  // for another, what needs a route greyed, the route's own tabs gone
  // until there is one (at the pilot's ask) -- and the Airport tab is the
  // search. The chips are all the way up's, the panel there throughout.
  await grabberTo(page, "peek");
  await expect(sideDrawer(page)).toHaveAttribute("data-capsule", "true");
  await grabberTo(page, "half");
  await expect(sideDrawer(page).getByTestId("flight-line")).toBeVisible();
  await expect(page.getByLabel(/^(\S+, )?Departure$/)).toContainText("C81");
  await clearTheRoute(page);
  await expect(page).not.toHaveURL(/dep=/);
  await expect(sideDrawer(page).getByTestId("route-type")).toBeVisible();
  await expect(sideDrawer(page).getByTestId("aircraft-select")).toBeEnabled();
  // With no route the route's menu holds only Show Route As (the owner,
  // 2026-11-13): nothing to share, save or clear.
  await sideDrawer(page).getByTestId("share-route").click();
  await expect(page.getByTestId("route-edit-select")).toBeVisible();
  await expect(page.getByTestId("share-link")).toHaveCount(0);
  await expect(page.getByTestId("route-clear")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(sideDrawer(page).getByTestId("panel-tab-enroute")).toBeHidden();
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "full");
  await showTabs(page);
  // The search's own page (the sheet's first) all the way up, as it was.
  await showPage(page, 0);
  await search.click();
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "full");
  await expect(sideDrawer(page).getByTestId("search-home")).toBeVisible();

  // Favorites in full: Edit lets KDLH go.
  await search.click();
  await page.getByTestId("pill-section-favorites-more").click();
  const list = page.getByTestId("favorites-list");
  await expect(list).toContainText("KDLH");
  await list.getByTestId("favorites-edit").click();
  await list.getByRole("button", { name: "Remove KDLH from Favorites…", exact: true }).click(); // the toast's Undo puts it back
  await expect(list).toContainText("A star on an airport's card adds it here");
  await page.getByTestId("favorites-undo").click();
  await expect(list).toContainText("KDLH");
});

test("an airport's card says which lights a pilot turns on with the mic, and the weather it reads out on so many clicks", async ({
  page,
}) => {
  // 3CK, Lake in the Hills: its Chart Supplement remarks, from the FAA's
  // own airport data, read by the engine (lighting_read) and in plain English.
  await page.goto("/app/plan?place=3CK");
  await expect(card(page).getByTestId("place-name")).not.toBeEmpty({ timeout: slow(15000) });
  // On Info, all the way up.
  await grabberTo(page, "full");
  // With the radio, under the frequencies: it is the mic that turns
  // them on.
  const lights = card(page).getByTestId("place-light");
  await expect(lights.first()).toContainText(/Runway end identifier lights \(REIL\)\s*Runways 08, 26\s*Key the mic on CTAF/);
  // The standard keying a row of its own, where it was a footnote.
  await expect(card(page).getByTestId("place-keying")).toContainText("7 high · 5 medium · 3 low");
  await expect(card(page)).toContainText("Weather advisory - CTAF 5 clicks");
});

/**
 * Listen to ATIS on the Weather tab: one broadcast heard through the
 * microphone and read by the engine (features/plan/lib/atis, read_atis), the runway in
 * use and the altimeter in one line, the figures under it, the
 * transcript folded. The browser's recognizer is a stand-in saying the
 * broadcast.
 */
test("the Weather tab listens to an ATIS and shows the runway in use and the altimeter at a glance", async ({ page }) => {
  await page.addInitScript(() => {
    class Heard {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        const said =
          "Duluth information Charlie, one eight five two zulu, wind two one zero at one two gust one eight, visibility one zero, " +
          "few clouds at four thousand five hundred, temperature one eight, dew point one two, altimeter two niner niner two, " +
          "ILS runway two seven approach in use, landing and departing runway two seven, advise on initial contact you have information Charlie";
        setTimeout(() => this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: said }], { isFinal: true })] }), 300);
      }
      stop() {
        setTimeout(() => this.onend?.(), 50);
      }
    }
    Object.assign(window, {
      SpeechRecognition: Object.assign(Heard, { available: async () => "available" }),
      webkitSpeechRecognition: Heard,
    });
  });
  await cardWeather(page, "KDLH", {
    metar: { raw: "KDLH 102155Z 27008KT 10SM CLR 12/02 A3001", flight_category: "VFR", ceiling_ft: null },
    taf: null,
  });
  await page.goto("/app/plan?dep=C81&dest=KDLH&place=KDLH");
  await settle(page);
  await card(page).getByTestId("place-tab-weather").click();
  const listen = card(page).getByTestId("place-atis-listen");
  await expect(listen).toContainText("Listen to ATIS");
  // A tab only switches what is shown (the owner, 2026-11-11): the card
  // pulled up to its control, under the edge at half.
  await inSheet(page, listen);
  await listen.click();
  await expect(listen).toContainText("Listening", { timeout: slow(5000) });
  // The pause after the broadcast ends the hearing, and the engine's
  // reading is the line and the table.
  const glance = card(page).getByTestId("place-atis-glance");
  await expect(glance).toContainText("Runway 27 · 29.92 inHg", { timeout: slow(15_000) });
  await expect(glance).toContainText("Information C");
  const rows = card(page).getByTestId("place-atis-row");
  await expect(rows).toHaveText([
    /Information.*C · 1852Z/,
    /Wind.*210° at 12 kt, gusts 18/,
    /Visibility.*10 sm/,
    /Sky.*Few 4,500 ft/,
    /Temperature.*18 °C, dew point 12 °C/,
    /Altimeter.*29.92 inHg/,
    /Approach.*ILS runway 27/,
    /Runways.*27/,
  ]);
  // The transcript folded under them until asked for.
  await expect(card(page).getByTestId("place-atis-raw")).toBeHidden();
  await card(page).getByTestId("place-atis-transcript").click();
  await expect(card(page).getByTestId("place-atis-raw")).toContainText("altimeter two niner niner two");
});
