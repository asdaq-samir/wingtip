import { test, expect, type Page } from "@playwright/test";
import { grabberTo, settle, sideDrawer, slow } from "./helpers";
import { bar, expectShown, openAirport, tapAirportOnMap } from "./sheetPages";

/**
 * Every way to a route from an airport -- Fly Here from a card opened on
 * the map, from the search, from Nearest and Favorites, a card over a
 * card; the top hit's Fly Here and Depart From; Add Stop; the first
 * flight's Plan it -- lands on FPL, the page in sight and live, its route
 * box taking a tap. All by a finger's taps (touch events, as a phone's).
 * The owner, 2026-11-12, on his iPhone: "When I tap fly here, it still
 * shows the search sheet" -- Fly Here to the airport the route already
 * went to left the sheet on Search (usePanelView's route key).
 */

// Over Stoughton, south-east of Madison: the map opens on the position with
// Madison (KMSN) and Middleton's Morey Field (C29) on the chart, Nearest by
// them. Inside the box the suite's overlay tiles are cut to (41.4 to 43.4 N,
// scripts/build/e2e-overlay-tiles.sh): Oshkosh, north of it, has no marks.
test.use({ geolocation: { latitude: 42.92, longitude: -89.22 }, permissions: ["geolocation"], hasTouch: true });

const card = (page: Page) => sideDrawer(page).getByTestId("place-card").last();
const ROUTE = "/app/plan?dep=C81&dest=KDLH";

/** Fly Here on the card up, and the route to `ident` in the address. */
async function flyHere(page: Page, ident: string) {
  await card(page).getByTestId("fly-here").tap();
  await expect(page).toHaveURL(new RegExp(`[?&]dest=${ident}`), { timeout: slow(15_000) });
}

/** FPL in sight and live, and its route box taking a finger's tap: the
 *  middle of the route's row is the row's, not something over it. */
async function expectPlanLive(page: Page) {
  await expectShown(page, 1);
  const fpl = sideDrawer(page).locator('[data-sheet-page="1"]');
  const row = fpl.getByTestId("route-box").or(fpl.getByTestId("route-line")).first();
  await expect(row).toBeVisible({ timeout: slow(15_000) });
  // Till "Route Replaced · Undo" has gone by (lib/toast's UNDO_MS): all the
  // way up it sits over the box's top a few seconds.
  await expect(async () => {
    const box = (await row.boundingBox())!;
    const hit = await page.evaluate(
      ({ x, y }) => {
        const at = document.elementFromPoint(x, y);
        return !!at && !at.closest("[inert]") && !!at.closest('[data-testid="route-box"], [data-testid="route-line"]');
      },
      { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 20) },
    );
    expect(hit, "a tap on the route box is the route box's").toBe(true);
  }).toPass({ timeout: slow(12_000) });
}

test("Fly Here from an airport tapped on the map lands on FPL, live", { tag: "@smoke" }, async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  await tapAirportOnMap(page, "KMSN");
  await flyHere(page, "KMSN");
  await expectPlanLive(page);
});

test("Fly Here from the map over a route, from Search at the pill", async ({ page }) => {
  await page.goto(ROUTE);
  await settle(page);
  await grabberTo(page, "half");
  await bar(page, 0).tap();
  await grabberTo(page, "peek");
  // Dubuque, towered: drawn with the whole route in sight, clear of its line.
  await tapAirportOnMap(page, "KDBQ");
  await flyHere(page, "KDBQ");
  await grabberTo(page, "half");
  await expectPlanLive(page);
});

// Not from the pill: the field there lists nothing until the sheet comes up.
for (const size of ["half", "full"] as const) {
  test(`Fly Here from the search's card, the sheet at ${size}`, async ({ page }) => {
    await page.goto(size === "full" ? ROUTE : "/app/plan");
    await settle(page);
    await grabberTo(page, size);
    if (size === "full") await bar(page, 0).tap();
    await openAirport(page, "KOSH", true);
    await flyHere(page, "KOSH");
    await grabberTo(page, "half");
    await expectPlanLive(page);
  });
}

test("Fly Here again to the airport the route already goes to brings FPL back", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  await openAirport(page, "KOSH", true);
  await flyHere(page, "KOSH");
  await expectShown(page, 1);
  await bar(page, 0).tap();
  await expectShown(page, 0);
  // The same route asked for again: the address's points are as they were.
  await openAirport(page, "KOSH", true);
  await card(page).getByTestId("fly-here").tap();
  await expect(card(page)).toBeHidden({ timeout: slow(15_000) });
  await expectPlanLive(page);
});

test("the top hit's Fly Here and Depart From land on FPL", async ({ page }) => {
  await page.goto(ROUTE);
  await settle(page);
  await grabberTo(page, "half");
  await bar(page, 0).tap();
  const search = page.getByTestId("search-airports");
  await search.tap();
  await search.fill("KOSH");
  await page.getByTestId("search-top-depart-from").tap({ timeout: slow(10_000) });
  await expect(page).toHaveURL(/[?&]dep=KOSH/, { timeout: slow(15_000) });
  await expectPlanLive(page);
  await bar(page, 0).tap();
  await search.tap();
  await search.fill("KMSN");
  await page.getByTestId("search-top-fly-here").tap({ timeout: slow(10_000) });
  await expect(page).toHaveURL(/[?&]dest=KMSN/, { timeout: slow(15_000) });
  await expectPlanLive(page);
});

test("Fly Here from Nearest's row lands on FPL", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  await sideDrawer(page)
    .getByTestId("nearest-strip-field")
    .first()
    .tap({ timeout: slow(15_000) });
  const name = card(page).getByTestId("place-name");
  await expect(name).not.toBeEmpty({ timeout: slow(10_000) });
  await flyHere(page, await name.innerText());
  await expectPlanLive(page);
});

test("Fly Here from a Favorite lands on FPL", async ({ page }) => {
  await page.addInitScript(() => {
    const kept = { ident: "KOSH", name: "Wittman Regional Airport", municipality: "Oshkosh", lat: 43.9844, lon: -88.5569 };
    localStorage.setItem("wingtip.preferences", JSON.stringify({ state: { favoriteAirports: [kept], waypoints: true }, version: 1 }));
  });
  await page.goto("/app/plan");
  await settle(page);
  // All the way up: at half Favorites is under Nearest and Find Nearby.
  await grabberTo(page, "full");
  await sideDrawer(page).getByTestId("pill-favorites-row").getByRole("button", { name: /KOSH/ }).first().tap();
  await flyHere(page, "KOSH");
  await expectPlanLive(page);
});

test("Fly Here from a card opened over another card lands on FPL", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  await openAirport(page, "KMSN", true);
  await tapAirportOnMap(page, "C29");
  await expect(card(page).getByTestId("place-name")).toHaveText("C29", { timeout: slow(10_000) });
  await flyHere(page, "C29");
  await expectPlanLive(page);
});

test("Add Stop from Search's card over a route lands on FPL", async ({ page }) => {
  await page.goto(ROUTE);
  await settle(page);
  await grabberTo(page, "half");
  await bar(page, 0).tap();
  await openAirport(page, "KOSH", true);
  await card(page).getByTestId("place-add-stop").tap();
  await expect(page).toHaveURL(/[?&]stops=[^&]*KOSH/, { timeout: slow(15_000) });
  await expectPlanLive(page);
});
