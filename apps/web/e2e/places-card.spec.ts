import { test, expect } from "@playwright/test";
import { drawn, grabberTo, openPanel, settle, settled, showPlan, showTabs, sideDrawer, slow, frontSheet, openRoute } from "./helpers";
import { showPage } from "./oneSearch";
import { card } from "./placeCard";

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
  expect((await tabs.evaluateAll((t) => t.map((x) => x.ariaLabel))).join("|")).toMatch(/^Info\|Weather(, \w+)?\|Runways\|Charts(, \d+)?$/);
  await expect(card(page).getByTestId("place-tab-radio")).toHaveAttribute("aria-selected", "true");
  // No weather summary over the bar: the weather is its tab's.
  await expect(card(page).getByTestId("place-weather-summary")).toHaveCount(0);

  // All the way up, the bar in sight under the actions; Runways: the pattern and the runways.
  await grabberTo(page, "full");
  await expect(card(page).getByRole("tablist")).toBeInViewport({ ratio: 1 });
  await card(page).getByTestId("place-tab-runways").click();
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "full");
  const runways = card(page).getByRole("tabpanel").getByTestId("place-runways");
  await expect(runways).toContainText("Pattern Altitude");
  await expect(runways).toContainText(/Runway \d/);

  // Charts: the airport's (none from the FAA: the card's sketch instead),
  // and its approach's title in the FAA's codes, its words in sentence
  // case (the engine's faa_words: "ILS or LOC rwy 36").
  await card(page).getByTestId("place-tab-diagrams").click();
  const charts = card(page).getByRole("tabpanel").getByTestId("place-charts");
  await expect(charts.getByTestId("airport-diagram-sketch")).toContainText("A sketch of the runways");
  const approach = charts.getByTestId("terminal-chart");
  await expect(approach).toHaveText(/RNAV \(GPS\) rwy 24/);
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
  // The one search is the sheet's other page, behind FPL's while a route
  // is up (the page toggle at the first row's end).
  await showTabs(page);
  await showPage(page, 0);
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
  await showPlan(page);
  await grabberTo(page, "full");
  await openRoute(page);
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
    // Named as NASR files it (field_use.named), as the planner's lists
    // and its search name it too.
    const kept = { ident: "KBUR", name: "Hollywood Burbank", municipality: "Burbank", lat: 34.2007, lon: -118.3587 };
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
  await expect(card(page).getByTestId("place-full-name")).toContainText("Hollywood Burbank");
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
  // Nothing to measure from: no line under the name, the facts' Distance a dash.
  await expect(card(page).getByTestId("place-line")).toHaveCount(0);
  await expect(card(page).getByTestId("place-fact-distance")).toHaveText("Dist.—");
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
