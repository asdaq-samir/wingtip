import { test, expect, type Locator, type Page } from "@playwright/test";
import { inSheet, library, openConsole, showTabs } from "./helpers";
import { fillDate } from "./ariaFields";
import { NO_OWN_FIGURES } from "./airplaneMocks";

/**
 * An airplane's inspections and tests in its form (the Library's
 * Aircraft): each recorded date with the last day it is good for -- the
 * annual's past due -- the 100-hour by hours, and the whole saved
 * together. The gateway's answers are stubbed: the calendar months are
 * AircraftControllerTest's, and what the risk assessment makes of them
 * airworthiness.test's.
 */

/** The airplane's form: on a phone a card of its own over You
 *  (ResponsivePopover's SheetCard), opened half way as every card is. */
const editCard = (page: Page) =>
  page.locator("[data-sheet-card]").filter({ has: page.getByRole("heading", { name: "Edit airplane", exact: true }) });

/** Tapped where a finger reaches it: the card pulled up to a row under its
 *  edge (inSheet). */
async function tap(page: Page, target: Locator) {
  await inSheet(page, target);
  await target.click();
}
test("an airplane's inspections say how long each is good for, and are saved together", async ({ page }) => {
  const plane = {
    id: 5,
    tailNumber: "N12345",
    typeDesignator: "C172",
    figures: NO_OWN_FIGURES,
    cruiseTasKt: 110,
    fuelBurnGph: 8.5,
    cruisePowerPct: null,
    climbTasKt: null,
    climbFuelBurnGph: null,
    usableFuelGal: 40,
    createdAt: "2026-01-01T00:00:00Z",
    vorCheck: null,
    openSquawks: [],
    inspections: {
      annualOn: "2020-01-15",
      annualGoodThrough: "2021-01-31",
      hundredHourAtHours: 1200.5,
      hoursNow: 1250,
      hundredHourDueAtHours: 1300.5,
      staticCheckOn: null,
      staticCheckGoodThrough: null,
      transponderCheckOn: null,
      transponderCheckGoodThrough: null,
      eltInspectedOn: "2026-02-01",
      eltInspectionGoodThrough: "2099-02-28",
      eltBatteryDueOn: "2099-06-01",
      forHire: true,
    },
    dueItems: [],
  };
  const saved: Record<string, unknown>[] = [];
  await page.route(
    (url) => url.pathname === "/api/aircraft",
    (route) => route.fulfill({ json: [plane] }),
  );
  await page.route(
    (url) => url.pathname === "/api/aircraft/5/inspections",
    async (route) => {
      saved.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ json: plane });
    },
  );
  await page.goto("/app/plan");
  await showTabs(page);
  await openConsole(page);
  const console = page.getByTestId("console-sheet");
  await library(console, "Airplanes");
  await console.getByRole("button", { name: "Edit N12345" }).click();
  await expect(page.getByTestId("inspection-annual-on")).toHaveText("Past due since 2021-01-31");
  await expect(page.getByTestId("inspection-elt-inspected-on")).toHaveText("To 2099-02-28");
  await expect(page.getByTestId("inspection-elt-battery")).toHaveText("By 2099-06-01");
  await expect(page.getByTestId("inspection-hundred-hour")).toHaveText(", 50.5 h to go");

  await fillDate(page.getByTestId("inspection-annual-on-date"), "2026-09-20");
  await fillDate(page.getByTestId("inspection-transponder-check-on-date"), "2025-03-02");
  await page.getByTestId("inspection-hours-now").fill("1262.3");
  await tap(page, page.getByTestId("inspections-save"));
  await expect
    .poll(() => saved.at(-1))
    .toMatchObject({
      annualOn: "2026-09-20",
      transponderCheckOn: "2025-03-02",
      hoursNow: 1262.3,
      hundredHourAtHours: 1200.5,
      eltInspectedOn: "2026-02-01",
      eltBatteryDueOn: "2099-06-01",
      staticCheckOn: null,
      forHire: true,
    });
  // Not flown for hire, the 100-hour is not owed (91.409(b)): its standing
  // goes, and the toggle's word is saved with the rest.
  await tap(page, page.getByTestId("inspection-for-hire"));
  await expect(page.getByTestId("inspection-hundred-hour")).toHaveCount(0);
  await tap(page, page.getByTestId("inspections-save"));
  await expect.poll(() => saved.at(-1)).toMatchObject({ forHire: false });
});

test("an AD is kept on the airplane with its next due day, and comes up in the Logbook", async ({ page }) => {
  const plane = {
    id: 5,
    tailNumber: "N12345",
    typeDesignator: "C172",
    figures: NO_OWN_FIGURES,
    cruiseTasKt: 110,
    fuelBurnGph: 8.5,
    cruisePowerPct: null,
    climbTasKt: null,
    climbFuelBurnGph: null,
    usableFuelGal: 40,
    createdAt: "2026-01-01T00:00:00Z",
    vorCheck: null,
    openSquawks: [],
    inspections: null,
    dueItems: [] as Record<string, unknown>[],
  };
  const written: Record<string, unknown>[] = [];
  await page.route(
    (url) => url.pathname === "/api/aircraft",
    (route) => route.fulfill({ json: [plane] }),
  );
  await page.route(
    (url) => url.pathname === "/api/aircraft/5/due-items",
    async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      written.push(body);
      plane.dueItems = [{ id: 1, ...body }];
      await route.fulfill({ json: { id: 1, ...body } });
    },
  );
  await page.route(
    (url) => url.pathname === "/api/paperwork",
    (route) =>
      route.fulfill({
        json: {
          today: "2026-11-08",
          items: [
            {
              what: "item",
              title: "Oil filter adapter",
              rule: "AD 2011-10-09, 14 CFR 39.7",
              aircraftId: 5,
              tailNumber: "N12345",
              itemId: 1,
              dueOn: "2099-12-01",
              daysLeft: 26690,
              dueAtHours: null,
              hoursLeft: null,
            },
          ],
        },
      }),
  );
  await page.goto("/app/plan");
  await showTabs(page);
  await openConsole(page);
  const console = page.getByTestId("console-sheet");
  await library(console, "Airplanes");
  await console.getByRole("button", { name: "Edit N12345" }).click();
  // The form is its own card over You, not a part of it.
  const form = editCard(page);
  await tap(page, form.getByTestId("due-item-add"));
  await form.getByTestId("due-item-title").fill("Oil filter adapter");
  await form.getByTestId("due-item-reference").fill("AD 2011-10-09");
  await form.getByTestId("due-item-method").fill("Inspect each 100 h");
  await fillDate(form.getByTestId("due-item-dueOn"), "2099-12-01");
  await tap(page, form.getByTestId("due-item-save"));
  await expect
    .poll(() => written[0])
    .toMatchObject({
      kind: "AD",
      title: "Oil filter adapter",
      reference: "AD 2011-10-09",
      method: "Inspect each 100 h",
      dueOn: "2099-12-01",
      dueAtHours: null,
    });

  await page.goto("/app/plan");
  await showTabs(page);
  await openConsole(page);
  await library(page.getByTestId("console-sheet"), "Logbook");
  await expect(page.getByTestId("coming-up")).toContainText("N12345 · Oil filter adapter");
  await expect(page.getByTestId("coming-up")).toContainText("AD 2011-10-09, 14 CFR 39.7");
});

test("an airplane's checklists are written from its handbook, kept on this device, then run item by item", async ({ page }) => {
  const plane = {
    id: 5,
    tailNumber: "N12345",
    typeDesignator: "C172",
    figures: NO_OWN_FIGURES,
    cruiseTasKt: 110,
    fuelBurnGph: 8.5,
    cruisePowerPct: null,
    climbTasKt: null,
    climbFuelBurnGph: null,
    usableFuelGal: 40,
    createdAt: "2026-01-01T00:00:00Z",
    vorCheck: null,
    openSquawks: [],
    inspections: {
      annualOn: null,
      annualGoodThrough: null,
      hundredHourAtHours: null,
      hoursNow: null,
      hundredHourDueAtHours: null,
      staticCheckOn: null,
      staticCheckGoodThrough: null,
      transponderCheckOn: null,
      transponderCheckGoodThrough: null,
      eltInspectedOn: null,
      eltInspectionGoodThrough: null,
      eltBatteryDueOn: null,
    },
  };
  await page.route(
    (url) => url.pathname === "/api/aircraft",
    (route) => route.fulfill({ json: [plane] }),
  );
  await page.goto("/app/plan");
  await showTabs(page);
  await openConsole(page);
  const console = page.getByTestId("console-sheet");
  await library(console, "Airplanes");
  await console.getByRole("button", { name: "Edit N12345" }).click();
  // The form's own Checklists, this airplane's: You's Airplanes page under
  // the form has one too, the picked airplane's (YouRows).
  await tap(page, editCard(page).getByRole("button", { name: /^Checklists/ }));
  await expect(console).toContainText("No checklist yet");
  await tap(page, console.getByTestId("checklist-edit"));
  // An empty editor offers the phases' headings alone, nothing under them.
  await tap(page, console.getByTestId("checklist-phases"));
  await expect(console.getByTestId("checklist-text")).toHaveValue(/^# Preflight inspection\n/);
  await console.getByTestId("checklist-text").fill("# Before takeoff\nFuel selector -- Both\nMixture ..... Rich");
  await tap(page, console.getByTestId("checklist-save"));
  // Kept in this browser under the airplane's key, not sent anywhere.
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("wingtip.checklists") ?? "{}") as unknown))
    .toEqual({ "mine:5": { normal: "# Before takeoff\nFuel selector -- Both\nMixture ..... Rich" } });
  const items = console.getByTestId("checklist-item");
  await expect(items).toHaveCount(2);
  await tap(page, items.first());
  await expect(items.first()).toHaveAttribute("aria-checked", "true");
  await expect(console).toContainText("1 of 2");
  await tap(page, console.getByTestId("checklist-reset"));
  await expect(items.first()).toHaveAttribute("aria-checked", "false");
  // The emergency list is the airplane's other, empty until written.
  await console.getByTestId("checklist-kind").getByText("Emergency").click();
  await expect(console).toContainText("No emergency checklist yet");
});

test("a squawk is written with its 91.213(d) deferral, and fixed", async ({ page }) => {
  const plane = {
    id: 5,
    tailNumber: "N12345",
    typeDesignator: "C172",
    figures: NO_OWN_FIGURES,
    cruiseTasKt: 110,
    fuelBurnGph: 8.5,
    cruisePowerPct: null,
    climbTasKt: null,
    climbFuelBurnGph: null,
    usableFuelGal: 40,
    createdAt: "2026-01-01T00:00:00Z",
    vorCheck: null,
    inspections: null,
    openSquawks: [] as unknown[],
  };
  let squawks: Record<string, unknown>[] = [];
  const written: Record<string, unknown>[] = [];
  await page.route(
    (url) => url.pathname === "/api/aircraft",
    (route) => route.fulfill({ json: [plane] }),
  );
  await page.route(
    (url) => url.pathname.startsWith("/api/aircraft/5/squawks"),
    async (route) => {
      const method = route.request().method();
      if (method === "POST" || method === "PUT") {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        written.push(body);
        const id = method === "POST" ? squawks.length + 1 : Number(new URL(route.request().url()).pathname.split("/").pop());
        squawks = [...squawks.filter((s) => s.id !== id), { id, ...body }];
        return route.fulfill({ json: { id, ...body } });
      }
      await route.fulfill({ json: squawks });
    },
  );
  await page.goto("/app/plan");
  await showTabs(page);
  await openConsole(page);
  const console = page.getByTestId("console-sheet");
  await library(console, "Airplanes");
  await console.getByRole("button", { name: "Edit N12345" }).click();
  await tap(page, editCard(page).getByRole("button", { name: /^Squawks/ }));
  await expect(console).toContainText("None open");

  await console.getByTestId("squawk-text").fill("Landing light out");
  await tap(page, console.getByTestId("squawk-inoperative"));
  await tap(page, console.getByTestId("squawk-deferred"));
  await page.getByRole("option", { name: "Deferred for VFR by day" }).click();
  await tap(page, console.getByTestId("squawk-add"));
  await expect
    .poll(() => written[0])
    .toMatchObject({ text: "Landing light out", inoperative: true, deferredFor: "VFR_DAY", fixedOn: null });
  const open = console.getByTestId("squawk-open");
  await expect(open).toContainText("Deferred for VFR by day");

  await tap(page, open);
  await console.getByTestId("squawk-fix-note").fill("Bulb replaced");
  await tap(page, console.getByTestId("squawk-fix"));
  await expect.poll(() => written[1]).toMatchObject({ text: "Landing light out", fixNote: "Bulb replaced" });
  await expect(console).toContainText("None open");
  await expect(console).toContainText("Bulb replaced");
});
