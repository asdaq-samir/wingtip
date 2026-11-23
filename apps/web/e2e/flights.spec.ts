import { test, expect, type Page } from "@playwright/test";
import { FILING_OFFERED } from "./filing";
import {
  consoleSheet,
  controlsInSight,
  grabberTo,
  library,
  openBrief,
  openConsole,
  openPanel,
  showTabs,
  sideDrawer,
  openRoute,
  openBriefMenu,
} from "./helpers";
import { openSettingsPage } from "./mapCard";
import { closeBrief } from "./routeHelpers";
import { pickAirplane } from "./startState";
import { showPage } from "./sheetPages";
import { steady } from "./pacing";
test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

/**
 * "Save this flight", at the head of the briefing drawer's sections, for
 * a signed-in pilot. Spring's own endpoints are mocked, so the pilot is
 * one with no airplanes and a known list of flights; the planner and
 * its nav log are real.
 */

const A_PILOT = { id: 1, email: "pilot@example.com", displayName: "A Pilot", developer: false };

async function signedIn(page: Page, filed: Record<string, unknown>[], list: object[] = []) {
  await page.route("**/api/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(A_PILOT) }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/flights", async (route) => {
    if (route.request().method() === "POST") {
      filed.push(route.request().postDataJSON());
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: filed.length }) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(list) });
    }
  });
}

/** The plan settled: the runways picked into the wind as the route comes
 *  in write the address and plan it again with their patterns flown, a
 *  moment after Save is first offered -- a Save clicked before that saved
 *  the plan before them, and the menu rightly offered Save again for the
 *  one after (CI and locally, the first test of a fresh worker). The
 *  address the same for two seconds is the plan the page keeps. */
async function planSettled(page: Page) {
  await steady(async () => page.url(), { gap: 2000, timeout: 30_000 });
}

test("a flight is filed once, whole, and a new plan is offered for saving again", { tag: "@smoke" }, async ({ page }) => {
  test.setTimeout(120_000);
  const filed: Record<string, unknown>[] = [];
  await signedIn(page, filed);
  await page.goto("/app/plan?dep=C81&dest=KDLH&view=full");
  // Save is in the half panel's Share menu.
  await controlsInSight(page);
  const save = page.getByTestId("save-flight-button");

  // Offered once the nav log is whole -- it used to be enabled
  // mid-stream, and filed null totals. An item of Share's menu, its state
  // its name, said again in the menu as it changes.
  await openBriefMenu(page);
  await expect(save).toHaveAccessibleName("Save This Flight", { timeout: 90_000 });
  await expect(save).toBeEnabled({ timeout: 90_000 });
  await planSettled(page);
  await expect(save).toBeEnabled();
  await save.click();
  // The menu gone before it is opened again: opened as it was still going,
  // its focus was handed back to the button after, and the Escape below
  // was the sheet's, which it lowered.
  await expect(page.getByRole("menu")).toHaveCount(0);
  await openBriefMenu(page);
  await expect(save).toHaveAccessibleName("Saved");
  await expect(save).toBeDisabled();
  await page.keyboard.press("Escape");

  expect(filed).toHaveLength(1);
  const flight = filed[0] as { totalEteMin: number | null; checkpoints: { category: string; sequenceNo: number }[] };
  expect(flight.totalEteMin).not.toBeNull();
  expect(flight.checkpoints[0]).toMatchObject({ category: "departure", sequenceNo: 0 });
  expect(flight.checkpoints.at(-1)).toMatchObject({ category: "destination" });
  // Filed with its rules, the app's setting, so it reopens VFR.
  expect(new URLSearchParams((flight as { picks?: string }).picks ?? "").get("rules")).toBe("vfr");

  // A new departure time: a fresh nav log is a new plan. "Saved" used to
  // stay for the session, and a click filed a duplicate of whatever was
  // on screen. (There is no Load: every change plans again.)
  await closeBrief(page);
  await openRoute(page);
  await page.getByTestId("depart-date").click();
  // The month's last day open to pick: React Aria's days are role=button
  // cells, not buttons.
  await page.locator('[data-slot="calendar"] td [role="button"]:not([aria-disabled="true"]):not([data-outside-month])').last().click();
  await page.getByTestId("depart-done").click();
  await expect(page).toHaveURL(/[?&]depart=/);
  await openBriefMenu(page);
  await expect(save).toHaveAccessibleName("Save This Flight", { timeout: 90_000 });
  await expect(save).toBeEnabled({ timeout: 90_000 });
});

// Fly Here's Direct-To in the air starts where the airplane is, and is a
// flight to file like any other: it was offered no Save.
test("a flight from a present position is filed from that position", async ({ page }) => {
  test.setTimeout(120_000);
  const filed: Record<string, unknown>[] = [];
  await signedIn(page, filed);
  await page.goto("/app/plan?dep=%4042.2340%2C-87.9877&dest=KDLH&view=full");
  await controlsInSight(page);
  const save = page.getByTestId("save-flight-button");
  await openBriefMenu(page);
  await expect(save).toBeEnabled({ timeout: 90_000 });
  await planSettled(page);
  await expect(save).toBeEnabled();
  await save.click();
  // The menu gone before it is opened again: opened as it was still going,
  // its focus was handed back to the button after, and the Escape below
  // was the sheet's, which it lowered.
  await expect(page.getByRole("menu")).toHaveCount(0);
  await openBriefMenu(page);
  await expect(save).toHaveAccessibleName("Saved");
  expect(filed).toHaveLength(1);
  expect(filed[0]).toMatchObject({ departureIdent: "@42.2340,-87.9877", destinationIdent: "KDLH" });
});

test("signed out, there is nothing to save", async ({ page }) => {
  await page.route("**/api/me", (route) => route.fulfill({ status: 401, body: "" }));
  await page.goto("/app/plan?dep=C81&dest=KDLH&view=full");
  await controlsInSight(page);
  // Share showing means the page is not hidden behind a console: while
  // one is up, the page under it is out of reach of the queries below.
  await expect(page.getByTestId("share-route")).toBeVisible({ timeout: 30_000 });
  // Filing, the button beside FPL's tab bar signed in or not, is not
  // offered yet (FILING_OFFERED).
  await expect(page.getByTestId("file-flight-plan")).toHaveCount(FILING_OFFERED ? 1 : 0);
  await openBriefMenu(page);
  await expect(page.getByTestId("save-flight-button")).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("opening a saved flight puts its route in the header, and Load plans that route", async ({ page }) => {
  // The header read the address once. Opening a saved flight changes the
  // address in the page, so the header still showed the old route, and
  // Load quietly re-planned that one instead of the flight.
  await signedIn(
    page,
    [],
    [
      {
        id: 9,
        departureIdent: "KMSP",
        destinationIdent: "KDLH",
        cruiseAltitudeFt: 5500,
        aircraftTailNumber: null,
        createdAt: "2026-09-20T12:00:00Z",
        plannedFor: null,
        totalDistanceNm: 120,
        totalEteMin: 55,
        totalFuelGal: 8,
        altitudes: "KDLH:2400",
        // Its picks, as the connector saves them too: its altitude, its
        // fuel stop, the fuel on board leaving the departure, and IFR.
        stops: ["KMSN"],
        picks: "altitude_ft=5500&fuel=KMSN&tanks=KMSP%3A30&rules=ifr",
      },
    ],
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await openPanel(page);
  await expect(sideDrawer(page).getByTestId("route-summary")).toContainText("C81", { timeout: 15_000 });

  // The console's button is at the end of the route's capsule, lowered.
  await grabberTo(page, "peek");
  await showTabs(page);
  await openConsole(page);
  await library(page, "Flights");
  // The row opens the flight's page; Open on the map is the way in, and
  // it puts the console away.
  await page.getByRole("button", { name: /^KMSP → KDLH/ }).click();
  await page.getByTestId("flight-open").click();
  await expect(page).toHaveURL(/dep=KMSP/);
  await expect(consoleSheet(page)).toHaveCount(0);

  await openPanel(page);
  // Planned at once: there is no Load to press.
  await expect(sideDrawer(page).getByTestId("route-summary")).toContainText("KMSP");
  await expect(page).toHaveURL(/dep=KMSP/);
  await expect(page).toHaveURL(/altitude_ft=5500/);
  // And at the altitudes the pilot set at its points: Duluth's pattern.
  await expect(page).toHaveURL(/altitudes=KDLH(%3A|:)2400/);
  // With its fuel stop and the fuel on board it was saved with; its rules
  // are the app's own setting, IFR now, and leave the address.
  await expect(page).toHaveURL(/fuel=KMSN/);
  await expect(page).toHaveURL(/tanks=KMSP(%3A|:)30/);
  await expect(page).not.toHaveURL(/[?&]rules=/);
  const rules = () => page.evaluate(() => JSON.parse(localStorage.getItem("wingtip.preferences") ?? "{}").state?.flightRules);
  await expect.poll(rules).toBe("ifr");
});

test("a saved flight opened from FPL's Saved opens its page, and Open on the map plans it", async ({ page }) => {
  // The same page as Setup's, outside Setup: its Open on the map was a
  // dialog's close with no dialog round it, which threw as the page was
  // drawn and took the whole planner down.
  await signedIn(
    page,
    [],
    [
      {
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
      },
    ],
  );
  await page.goto("/app/plan");
  // The saved flights are FPL's page's (FplStrip; the owner: "We can remove
  // plan button and saved from search"), all the way up.
  await showPage(page, 1);
  await grabberTo(page, "full");
  const panel = sideDrawer(page);
  await panel.getByTestId("pill-section-saved-more").click();
  await panel.getByRole("button", { name: /^KMSP → KDLH/ }).click();
  await expect(panel.getByTestId("flight-open")).toBeVisible();
  await panel.getByTestId("flight-open").click();
  await expect(page).toHaveURL(/dep=KMSP/);
  await expect(page).not.toHaveURL(/[?&]saved=/);
});

test("Edit over the saved flights puts a minus before each, and the minus deletes one once asked", async ({ page }) => {
  const removed: string[] = [];
  await signedIn(
    page,
    [],
    [
      {
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
      },
    ],
  );
  await page.route("**/api/flights/*", async (route) => {
    removed.push(route.request().method());
    await route.fulfill({ status: 204, body: "" });
  });
  await page.goto("/app/plan");
  await showTabs(page);
  await openConsole(page);
  await library(page, "Flights");
  // Out of Edit, the row opens the flight's page and has no minus.
  await expect(page.getByRole("button", { name: /^Delete .*…$/ })).toHaveCount(0);

  await page.getByTestId("flights-edit").click();
  await expect(page.getByTestId("flights-edit")).toHaveText("Done");
  await expect(page.getByRole("link", { name: /KMSP → KDLH/ })).toHaveCount(0);
  // The minus takes it out at once, with the toast's Undo: nothing is sent
  // while the Undo is up, and Undo puts it back.
  await page.getByRole("button", { name: "Delete KMSP → KDLH…", exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete KMSP → KDLH…", exact: true })).toHaveCount(0);
  await page.getByTestId("saved-flight-undo").click();
  await expect(page.getByRole("button", { name: "Delete KMSP → KDLH…", exact: true })).toBeVisible();
  expect(removed).toEqual([]);
  // Let go, the Undo gone by itself, the flight is deleted.
  await page.getByRole("button", { name: "Delete KMSP → KDLH…", exact: true }).click();
  await expect(page.getByTestId("saved-flight-undo")).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(() => removed).toEqual(["DELETE"]);
});

test("a saved flight's ••• and its long press offer Edit, Share and Remove, as every list's do; Remove has an Undo", async ({ page }) => {
  const removed: string[] = [];
  await signedIn(
    page,
    [],
    [
      {
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
      },
    ],
  );
  await page.route("**/api/flights/*", async (route) => {
    removed.push(route.request().method());
    await route.fulfill({ status: 204, body: "" });
  });
  await page.goto("/app/plan");
  // The saved flights are FPL's page's (FplStrip; the owner: "We can remove
  // plan button and saved from search"), all the way up.
  await showPage(page, 1);
  await grabberTo(page, "full");
  const panel = sideDrawer(page);
  await panel.getByTestId("pill-section-saved-more").click();
  // A right click, as a long press on a phone, brings the same menu up.
  await panel.getByRole("button", { name: /^KMSP → KDLH/ }).click({ button: "right" });
  await expect(page.getByTestId("saved-flight-share")).toBeVisible();
  // Share and Remove, each with its icon (the owner, 2026-10-28), and
  // Edit for its name and notes since they can be changed (2026-11-09).
  await expect(page.getByRole("menuitem")).toHaveText(["Edit", "Share", "Remove"]);
  await expect(page.getByRole("menuitem").locator("svg")).toHaveCount(3);
  await page.keyboard.press("Escape");
  // Remove picked from the keyboard, as VoiceOver picks it: gone at once,
  // the toast's Undo up, and sent once that has gone.
  await panel.getByTestId("saved-flight-more").click();
  // Picked again where the pick went unanswered: on the phone project, one
  // run in ten, the menu stays open with Remove focused.
  const undo = page.getByTestId("saved-flight-undo");
  await expect(async () => {
    if (await undo.isVisible()) return;
    if (!(await page.getByTestId("saved-flight-delete").isVisible())) await panel.getByTestId("saved-flight-more").click();
    await page.getByTestId("saved-flight-delete").focus();
    await page.keyboard.press("Enter");
    await expect(undo).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await expect(undo).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(() => removed).toEqual(["DELETE"]);
});

test("Print is in the Brief's Share menu; Keep for the Air is in the map's menu, which cannot be on over plain http", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await controlsInSight(page);
  await openBrief(page);
  await page.getByTestId("card-share").click();
  await expect(page.getByTestId("print-briefing")).toBeVisible();
  await page.keyboard.press("Escape");

  // From the search bar, the route closed.
  await page.goto("/app/plan");
  await openSettingsPage(page);
  const keep = page.getByTestId("keep-offline-toggle");
  await expect(keep).toBeVisible();
  // The suite's stack is plain http, where the service worker that keeps
  // the tiles is not allowed: it cannot be turned on.
  if (!(await page.evaluate(() => window.isSecureContext))) await expect(keep).toBeDisabled();
});
