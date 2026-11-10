import { test, expect, type Page } from "@playwright/test";
import { airportSearch, closeCard, drawn, settle, sideDrawer, slow } from "./helpers";

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
  },
];

async function nearestStubbed(page: Page) {
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airports/nearest"),
    (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ airports: FIELDS }) }),
  );
}

/** "near C81" typed and sent from its Search Nearby row. */
async function sendNear(page: Page, words = "near C81") {
  const search = await airportSearch(page);
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
  // The field keeps what was typed, let go; the title row's ✕ in the
  // account button's place.
  await expect(page.getByTestId("search-airports")).toHaveValue("near C81");
  await expect(page.getByTestId("search-airports")).not.toBeFocused();
  await expect(sideDrawer(page).getByTestId("search-results-close")).toBeVisible();
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

  // ✕: the search let go, the start again.
  await sideDrawer(page).getByTestId("search-results-close").click();
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
