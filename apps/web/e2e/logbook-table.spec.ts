import { test, expect, type Route } from "@playwright/test";
import { library, openConsole, showTabs } from "./helpers";

/**
 * The logbook on a desktop (web.md §9): a table with a header that stays
 * over the rows, each header sorting by its column with aria-sort said, a
 * row's date opening the flight as a card under it, Save never greyed
 * out ahead of time. Spring's
 * endpoints are mocked, as logbook.spec's are. The phone's list is
 * logbook.spec's.
 */
test.beforeEach(({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "a desktop's table");
});

const A_PILOT = { id: 1, email: "pilot@example.com", displayName: "A Pilot", developer: false };
const flight = (id: number, flownOn: string, route: string, totalHours: number) => ({
  id,
  flownOn,
  aircraft: "N12345",
  aircraftType: "C172",
  route,
  totalHours,
  nightHours: 0,
  crossCountryHours: totalHours,
  dayLandings: 1,
  nightLandings: 0,
  remarks: null,
  dualHours: 0,
  soloHours: 0,
  instrumentHours: 0,
  toweredLandings: 1,
  distanceNm: 100,
  longestLegNm: 100,
  approaches: 0,
  holding: false,
  tracking: false,
  airHours: 0,
  touchAndGoes: 0,
  fromTrack: false,
  flightId: null,
});

test("a desktop's logbook is a table sorted by its headers, a row opening as a card", async ({ page }) => {
  const flights = [flight(1, "2026-10-01", "KMSN-KDLH", 2.3), flight(2, "2026-11-03", "C81-KJVL", 0.8)];
  await page.route("**/api/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(A_PILOT) }));
  await page.route(
    (url) => /\/api\/logbook(\/\d+)?$/.test(url.pathname),
    (route: Route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(flights) }),
  );
  await page.goto("/app/plan");
  await showTabs(page);
  await openConsole(page);
  const console = page.getByTestId("console-sheet");
  await library(console, "Logbook");

  const table = console.getByTestId("logbook-table");
  await expect(table).toBeVisible();
  const routes = table.getByTestId("logbook-entry").locator("td:nth-child(2)");
  // Newest first, the date's header saying so.
  await expect(routes).toHaveText(["C81-KJVL", "KMSN-KDLH"]);
  await expect(table.locator("th[aria-sort]")).toHaveAttribute("aria-sort", "descending");

  // The total's header: the longest flight first, said on its header.
  await table.getByTestId("logbook-sort-total").click();
  await expect(routes).toHaveText(["KMSN-KDLH", "C81-KJVL"]);
  await expect(table.locator("th[aria-sort]")).toHaveText(/Total/);

  // A row's date opens the flight as a card under its row, its Save ready.
  await table.getByTestId("logbook-entry-open").first().click();
  const card = table.getByTestId("logbook-entry-form");
  await expect(card).toBeVisible();
  await expect(card.getByTestId("logbook-save")).toBeEnabled();
  // Cancel with nothing changed closes it without asking.
  await card.getByTestId("logbook-cancel").click();
  await expect(card).toHaveCount(0);
});
