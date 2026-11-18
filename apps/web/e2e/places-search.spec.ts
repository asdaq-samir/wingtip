import { test, expect } from "@playwright/test";
import { clearTheRoute, closeCard, grabberTo, inSheet, searchAirports, settle, showTabs, sideDrawer, slow, frontSheet } from "./helpers";
import { card, cardWeather, holdPlannerSearch } from "./placeCard";
import { ownHomeBase, showPage } from "./oneSearch";

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
  // With no route there is no route's menu at all (the owner,
  // 2026-11-18): the first row is the airplane's strip alone, and the
  // empty box offers the route just cleared back.
  await expect(sideDrawer(page).getByTestId("share-route")).toHaveCount(0);
  await expect(sideDrawer(page).getByTestId("route-undo")).toBeVisible();
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
 * microphone and read by the engine (features/place/atis, read_atis), the runway in
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
    /Wind.*210°M 12G18 kt/,
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
