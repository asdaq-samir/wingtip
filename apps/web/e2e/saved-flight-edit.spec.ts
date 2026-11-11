import { test, expect, type Page } from "@playwright/test";
import { consoleSheet, library, openConsole, showTabs } from "./helpers";

/**
 * A saved flight's name and notes, changed in its row (Setup's Flights,
 * features/pilot/flights): PATCH /api/flights/{id} with what changed,
 * Escape sending nothing, and a failure said in the row. Spring's
 * endpoints are mocked, as flights.spec's are.
 */

const A_PILOT = { id: 1, email: "pilot@example.com", displayName: "A Pilot", developer: false };

async function signedIn(page: Page, list: object[]) {
  await page.route("**/api/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(A_PILOT) }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/flights", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(list) }),
  );
}

test("a saved flight is named and noted in its row: Return saves, Escape leaves it as it was", async ({ page }) => {
  const patched: unknown[] = [];
  const flight = {
    id: 9,
    departureIdent: "KMSP",
    destinationIdent: "KDLH",
    stops: [],
    cruiseAltitudeFt: 5500,
    aircraftTailNumber: null,
    createdAt: "2026-09-20T12:00:00Z",
    plannedFor: null,
    totalDistanceNm: 120,
    totalEteMin: 55,
    totalFuelGal: 8,
    name: null,
    notes: null,
  };
  await signedIn(page, [flight]);
  await page.route("**/api/flights/9", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const body = route.request().postDataJSON() as { name: string | null; notes: string | null };
    patched.push(body);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...flight, ...body }) });
  });
  await page.goto("/app/plan");
  await showTabs(page);
  await openConsole(page);
  await library(page, "Flights");
  const sheet = consoleSheet(page);

  // Edit, then the name: its fields in the row's place.
  await sheet.getByTestId("flights-edit").click();
  await sheet.getByTestId("saved-flight-rename").click();
  const name = sheet.getByTestId("saved-flight-name");
  await expect(name).toBeFocused();
  // Escape: nothing sent, the row back as it was.
  await name.fill("Not this");
  await name.press("Escape");
  await expect(name).toHaveCount(0);
  expect(patched).toEqual([]);

  await sheet.getByTestId("saved-flight-rename").click();
  await sheet.getByTestId("saved-flight-notes").fill("Fuel at KHYR");
  await name.fill("Lake Superior run");
  await name.press("Enter");
  await expect.poll(() => patched).toEqual([{ name: "Lake Superior run", notes: "Fuel at KHYR" }]);
  // The row named, the route under the name, and the notes.
  await expect(sheet.getByText("Lake Superior run")).toBeVisible();
  await expect(sheet.getByTestId("saved-flight-notes-shown")).toHaveText("Fuel at KHYR");
});

test("a saved flight's name that could not be saved says so in its row, not in a toast", async ({ page }) => {
  const flight = {
    id: 9,
    departureIdent: "KMSP",
    destinationIdent: "KDLH",
    stops: [],
    cruiseAltitudeFt: 5500,
    createdAt: "2026-09-20T12:00:00Z",
  };
  await signedIn(page, [flight]);
  await page.route("**/api/flights/9", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "down" }) })
      : route.fallback(),
  );
  await page.goto("/app/plan");
  await showTabs(page);
  await openConsole(page);
  await library(page, "Flights");
  const sheet = consoleSheet(page);
  await sheet.getByTestId("saved-flight-more").click();
  await page.getByTestId("saved-flight-edit").click();
  await sheet.getByTestId("saved-flight-name").fill("Lake run");
  await sheet.getByTestId("saved-flight-name").press("Enter");
  await expect(sheet.getByTestId("saved-flight-fields").locator("[data-slot=field-error]")).toBeVisible();
  // Open again on what was typed, to put right rather than type again.
  await expect(sheet.getByTestId("saved-flight-name")).toHaveValue("Lake run");
  await expect(page.locator("[data-slot=toast]")).toHaveCount(0);
});
