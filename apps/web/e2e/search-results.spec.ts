import { test, expect, type Page } from "@playwright/test";
import { airportSearch, closeCard, drawn, inSheet, settle, sheetUpToType, sideDrawer, slow } from "./helpers";

/**
 * A search sent (the one search's "Search Nearby"), laid out as Apple Maps
 * lays out a search's results (the owner's screenshots, 2026-11-10): the
 * title row's ✕, the field keeping what was typed, the chips (stock
 * Toggles and Menus) and the Filters page they share one state with, the
 * fields in one group, each opening its card, whose close comes back to
 * the list; and the fields marked on the map, clustered, a mark opening
 * its card. The fields are the planner's Nearest, put in its answer here,
 * so where they are is known.
 */

const FIELD = { kind: "small", flight_category: "VFR", military: null, private: false, elevation_ft: 900, airspace_class: null };
const FIELDS = [
  {
    ...FIELD,
    ident: "C81",
    name: "Campbell",
    lat: 42.3246,
    lon: -88.0741,
    distance_nm: 0.1,
    bearing_deg: 0,
    towered: false,
    longest_runway_ft: 2600,
    fuel: ["100LL"],
    runway_surfaces: ["paved", "turf"],
    instrument_approach: true,
    wind_dir_true_deg: 270,
    wind_speed_kt: 12,
    wind_gust_kt: 18,
    visibility_sm: 10,
  },
  {
    ...FIELD,
    ident: "KUGN",
    name: "Waukegan National",
    lat: 42.4222,
    lon: -87.8679,
    distance_nm: 11,
    bearing_deg: 55,
    towered: true,
    longest_runway_ft: 6000,
    fuel: ["100LL", "Jet A"],
    runway_surfaces: ["paved"],
    instrument_approach: true,
  },
  {
    ...FIELD,
    ident: "10C",
    name: "Galt Field",
    lat: 42.4029,
    lon: -88.3751,
    distance_nm: 15,
    bearing_deg: 290,
    towered: false,
    longest_runway_ft: 2650,
    flight_category: "MVFR",
    fuel: [],
    runway_surfaces: ["turf"],
    instrument_approach: false,
  },
];

/** Each field's forecast at the time asked (`at`), as the planner reads it
 *  from the TAF: Waukegan IFR then, the rest VFR. */
const forecastAt = (at: number) =>
  FIELDS.map((f) => ({ ...f, forecast: { at, category: f.ident === "KUGN" ? "IFR" : "VFR", station: "KUGN", distance_nm: null } }));

async function nearestStubbed(page: Page, asked: (number | null)[] = []) {
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airports/nearest"),
    (route) => {
      const at = new URL(route.request().url()).searchParams.get("at");
      asked.push(at == null ? null : Number(at));
      const airports = at == null ? FIELDS : forecastAt(Number(at));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ airports }) });
    },
  );
}

/** "near C81" typed and sent from its Search Nearby row. */
async function sendNear(page: Page, words = "near C81") {
  const search = await airportSearch(page);
  // Typing leaves the sheet where it is (5db1f8b10): from the pill the
  // Search Nearby row is under its edge, so it is pulled up half way.
  await sheetUpToType(page);
  await search.fill(words);
  await sideDrawer(page).getByTestId("search-do-nearby").click();
  const list = sideDrawer(page).getByTestId("search-results");
  await expect(list).toBeVisible({ timeout: slow(10_000) });
  return list;
}

test("a search sent lists the fields round the place, its chips and Filters narrow them, a row's card closes back to it, and ✕ clears it", async ({
  page,
}) => {
  await nearestStubbed(page);
  await page.goto("/app/plan");
  await settle(page);
  const list = await sendNear(page);
  // The field keeps what was typed, let go; Cancel beside it in the
  // account button's place, as Apple Maps' is.
  await expect(page.getByTestId("search-airports")).toHaveValue("near C81");
  await expect(page.getByTestId("search-airports")).not.toBeFocused();
  await expect(sideDrawer(page).getByTestId("one-search-cancel")).toBeVisible();
  const rows = list.getByTestId("search-result");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("Airport · 0.1 nm");
  await expect(rows.nth(1)).toContainText("Towered");

  // A chip on, filled in the tint, narrows the list.
  const towered = list.getByTestId("chip-towered");
  await towered.click();
  await expect(towered).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute("data-ident", "KUGN");

  // The Filters page, in the sheet in the list's place: its switch is the
  // chip's state; Cancel lets a change go, Apply keeps one.
  await list.getByTestId("chip-filters").click();
  const filters = sideDrawer(page).getByTestId("search-filters");
  await expect(filters).toBeVisible();
  await expect(filters.getByTestId("filter-towered")).toHaveAttribute("aria-checked", "true");
  await filters.getByTestId("filter-towered").click();
  await filters.getByTestId("filters-cancel").click();
  await expect(rows).toHaveCount(1);
  await list.getByTestId("chip-filters").click();
  await filters.getByTestId("filter-towered").click();
  await filters.getByTestId("filters-apply").click();
  await expect(rows).toHaveCount(3);

  // A row opens its card, the search put away over it; its close comes
  // back to the list, the words still in the field.
  await rows.nth(1).click();
  const card = sideDrawer(page).getByTestId("place-card");
  await expect(card.getByTestId("place-name")).toHaveText("KUGN", { timeout: slow(10_000) });
  await expect(page.getByTestId("search-airports")).toBeHidden();
  await closeCard(page, "place-close");
  await expect(card).toHaveCount(0);
  await expect(list).toBeVisible();
  await expect(page.getByTestId("search-airports")).toHaveValue("near C81");

  // Cancel: the search let go, the start again.
  await sideDrawer(page).getByTestId("one-search-cancel").click();
  await expect(list).toHaveCount(0);
  await expect(page.getByTestId("search-airports")).toHaveValue("");
  await expect(sideDrawer(page).getByTestId("account-button")).toBeVisible();
});

test("a search sent marks its fields on the map, and a mark opens its card", async ({ page }) => {
  await nearestStubbed(page);
  await page.goto("/app/plan");
  await settle(page);
  await sendNear(page);
  // Marked once the map has fitted them and come to rest (useGlProbe).
  let mark: Record<string, unknown> | undefined;
  await expect(async () => {
    mark = (await drawn(page, "search-result-marks")).find((m) => m.ident === "KUGN");
    expect(mark).toBeTruthy();
  }).toPass({ timeout: slow(15_000) });
  const map = (await page.getByTestId("gl-map").first().boundingBox())!;
  await page.mouse.click(map.x + Number(mark!.x), map.y + Number(mark!.y));
  await expect(sideDrawer(page).getByTestId("place-card").getByTestId("place-name")).toHaveText("KUGN", { timeout: slow(10_000) });
});

test("a search's fuel, approach, surface and VFR at… filters narrow its fields, and each row says its weather and facilities", async ({
  page,
}) => {
  const asked: (number | null)[] = [];
  await nearestStubbed(page, asked);
  await page.goto("/app/plan");
  await settle(page);
  const list = await sendNear(page);
  const rows = list.getByTestId("search-result");
  await expect(rows).toHaveCount(3);
  // The METAR's wind and visibility, and what the field has.
  await expect(rows.first().getByTestId("search-result-weather")).toContainText("Wind 270° at 12 kt, gusts 18 · 10 SM");
  await expect(rows.first().getByTestId("search-result-facts")).toContainText("Paved, Turf · Approach · 100LL");

  // Jet A from the fuel chip's menu: Waukegan alone.
  await list.getByTestId("chip-fuel").click();
  await page.getByTestId("chip-fuel-jet-a").click();
  await page.keyboard.press("Escape");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute("data-ident", "KUGN");
  await expect(list.getByTestId("chip-fuel")).toContainText("Jet A");
  await list.getByTestId("chip-fuel").click();
  await page.getByTestId("chip-fuel-jet-a").click();
  await page.keyboard.press("Escape");
  await expect(rows).toHaveCount(3);

  // An instrument approach: Galt Field has none.
  await list.getByTestId("chip-approach").click();
  await expect(rows).toHaveCount(2);
  await list.getByTestId("chip-approach").click();

  // Turf, from the Filters page's surfaces (a stock ToggleGroup): Campbell and Galt.
  await list.getByTestId("chip-filters").click();
  const filters = sideDrawer(page).getByTestId("search-filters");
  // Half way, where the search was sent: the surfaces under the sheet's
  // edge are reached by pulling it up (the card rule's 11: nothing raises it).
  const turf = filters.getByTestId("filter-surface").getByRole("button", { name: "Turf" });
  await inSheet(page, turf);
  await turf.click();
  await filters.getByTestId("filters-apply").click();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toHaveAttribute("data-ident", "10C");
  await list.getByTestId("chip-surface").click();
  await page.getByTestId("chip-surface-turf").click();
  await page.keyboard.press("Escape");
  await expect(rows).toHaveCount(3);

  // VFR at… three hours on: the planner asked for the forecast at the top
  // of that hour, Waukegan forecast IFR then and left out, each row
  // saying its category then.
  await list.getByTestId("chip-vfr-at").click();
  await page.getByTestId("chip-vfr-at-3").click();
  await expect(rows).toHaveCount(2);
  await expect(rows.first().getByTestId("search-result-weather")).toContainText(/VFR at \d\d:00/);
  const at = asked.find((t) => t != null)!;
  expect(at % 3600).toBe(0);
  expect(at * 1000).toBeGreaterThan(Date.now() + 2 * 3600_000);
});
