import { test, expect, type Route } from "@playwright/test";
import { library, openConsole, showTabs } from "./helpers";

/**
 * The pilot console's Logbook: where the pilot stands first, then the
 * flights. Spring's endpoints are mocked, as account.spec's are, so the
 * test is the pilot it says.
 */

const A_PILOT = { id: 1, email: "pilot@example.com", displayName: "A Pilot", developer: false };
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

test("the logbook says where the pilot stands, and a flight logged is posted as typed", async ({ page }) => {
  await page.route("**/api/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(A_PILOT) }));
  await page.route("**/api/logbook/currency", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        dayPassengersUntil: inDays(40),
        nightPassengersUntil: null,
        flightReviewOn: "2025-06-14",
        flightReviewUntil: "2027-06-30",
        medicalExpiresOn: null,
        totalHours: 3.4,
        nightHours: 0,
        crossCountryHours: 3.4,
        landings: 3,
        flights: 1,
      }),
    }),
  );
  const posted: unknown[] = [];
  await page.route("**/api/logbook", async (route: Route) => {
    if (route.request().method() === "POST") {
      posted.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: 9, ...(posted[0] as object) }) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
  });

  await page.goto("/app/plan");
  await showTabs(page);
  await openConsole(page);
  const console = page.getByTestId("console-sheet");
  await library(console, "Logbook");

  await expect(console.getByTestId("currency-day")).toHaveText(/^To /);
  await expect(console.getByTestId("currency-night")).toHaveText("Not current");
  await expect(console.getByTestId("currency-review")).toHaveText("To 30 Jun 2027");

  await console.getByTestId("logbook-add").click();
  await page.getByTestId("logbook-totalHours").fill("3.4");
  await page.getByTestId("logbook-save").click();
  await expect.poll(() => posted.length).toBe(1);
  expect(posted[0]).toMatchObject({ totalHours: 3.4, dayLandings: 1 });
});

test("a logbook that could not be fetched says so in place, and Try again fetches it", { tag: "@smoke" }, async ({ page }) => {
  // The commonality audit's N-12: a failure read "No flights logged yet".
  await page.route("**/api/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(A_PILOT) }));
  let failing = true;
  await page.route("**/api/logbook", (route) =>
    failing
      ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "down" }) })
      : route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.goto("/app/plan");
  await showTabs(page);
  await openConsole(page);
  const console = page.getByTestId("console-sheet");
  await library(console, "Logbook");
  await expect(console.getByText("Your logbook could not be fetched.")).toBeVisible();
  await expect(console.getByText("No flights logged yet")).toHaveCount(0);
  failing = false;
  await console.getByTestId("query-retry").click();
  await expect(console.getByText("No flights logged yet: Add Entry logs one.")).toBeVisible();
});

test("a logged flight is changed in its own row, and one taken out comes back from its Undo row", async ({ page }) => {
  // The phone's list; a desktop's table has its own test below.
  test.skip((page.viewportSize()?.width ?? 0) >= 1024, "a phone's list");
  const entry = {
    id: 41,
    flownOn: "2026-11-03",
    aircraft: "N12345",
    aircraftType: "C172",
    route: "KMSN-KDLH",
    totalHours: 2.3,
    nightHours: 0,
    crossCountryHours: 2.3,
    dayLandings: 1,
    nightLandings: 0,
    remarks: null,
    dualHours: 0,
    soloHours: 0,
    instrumentHours: 0,
    toweredLandings: 1,
    distanceNm: 230,
    longestLegNm: 230,
    approaches: 0,
    holding: false,
    tracking: false,
    airHours: 0,
    touchAndGoes: 0,
    fromTrack: false,
    flightId: null,
  };
  await page.route("**/api/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(A_PILOT) }));
  const asked: { method: string; body: unknown }[] = [];
  await page.route(
    (url) => /\/api\/logbook(\/\d+)?$/.test(url.pathname),
    async (route: Route) => {
      const method = route.request().method();
      if (method === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([entry]) });
      asked.push({ method, body: route.request().postDataJSON() });
      if (method === "DELETE") return route.fulfill({ status: 204, body: "" });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(entry) });
    },
  );

  await page.goto("/app/plan");
  await showTabs(page);
  await openConsole(page);
  const console = page.getByTestId("console-sheet");
  await library(console, "Logbook");

  // A tap on the row: its form in the row's place, no popover over the list.
  await console.getByTestId("logbook-entry").click();
  const form = console.getByTestId("logbook-entry-form");
  await expect(form).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Escape leaves it as it was.
  await form.getByTestId("logbook-remarks").press("Escape");
  await expect(form).toHaveCount(0);
  expect(asked).toEqual([]);

  await console.getByTestId("logbook-entry").click();
  await form.getByTestId("logbook-remarks").fill("Gusty at KDLH");
  await form.getByTestId("logbook-save").click();
  await expect.poll(() => asked.map((a) => a.method)).toEqual(["PUT"]);
  expect(asked[0]!.body).toMatchObject({ remarks: "Gusty at KDLH", totalHours: 2.3, route: "KMSN-KDLH" });
  await expect(form).toHaveCount(0);

  // Edit's minus takes it out at once; the toast's Undo logs the same
  // flight again.
  await console.getByTestId("logbook-edit").click();
  await console.getByRole("button", { name: "Delete the flight of 3 Nov 2026…", exact: true }).click();
  await expect.poll(() => asked.map((a) => a.method)).toEqual(["PUT", "DELETE"]);
  await expect(page.locator('[data-slot="toast"]').filter({ hasText: "3 Nov 2026 KMSN-KDLH Deleted" })).toBeVisible();
  await page.getByTestId("logbook-undo").click();
  await expect.poll(() => asked.map((a) => a.method)).toEqual(["PUT", "DELETE", "POST"]);
  expect(asked[2]!.body).toMatchObject({ flownOn: "2026-11-03", route: "KMSN-KDLH", totalHours: 2.3 });
});

test("signed out, the logbook opened by a link is You's one Sign In, with nothing asked of the pilot's lists", async ({ page }) => {
  await page.route("**/api/me", (route) => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  // The pilot's own lists, none of which is asked for signed out (the web
  // audit's WEB-40: five 401s and a red "could not be fetched").
  const asked: string[] = [];
  page.on("request", (r) => {
    if (/\/api\/(training|logbook|paperwork)/.test(new URL(r.url()).pathname)) asked.push(r.url());
  });
  await page.goto("/app/plan?open=logbook");
  const console = page.getByTestId("console-sheet");
  await expect(console.getByTestId("logbook-signed-out")).toBeVisible();
  await expect(console.getByRole("button", { name: "Sign In", exact: true })).toHaveCount(1);
  await expect(console.getByText(/could not be fetched/)).toHaveCount(0);
  await expect(console.getByText("Not current")).toHaveCount(0);
  expect(asked).toEqual([]);
});
