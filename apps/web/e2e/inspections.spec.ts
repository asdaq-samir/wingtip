import { test, expect } from "@playwright/test";
import { library, openConsole, showTabs } from "./helpers";

/**
 * An airplane's inspections and tests in its form (the Library's
 * Aircraft): each recorded date with the last day it is good for -- the
 * annual's past due -- the 100-hour by hours, and the whole saved
 * together. The gateway's answers are stubbed: the calendar months are
 * AircraftControllerTest's, and what the risk assessment makes of them
 * airworthiness.test's.
 */
test("an airplane's inspections say how long each is good for, and are saved together", async ({ page }) => {
  const plane = {
    id: 5, tailNumber: "N12345", typeDesignator: "C172", cruiseTasKt: 110, fuelBurnGph: 8.5, cruisePowerPct: null,
    climbTasKt: null, climbFuelBurnGph: null, usableFuelGal: 40, createdAt: "2026-01-01T00:00:00Z", vorCheck: null, openSquawks: [],
    inspections: {
      annualOn: "2020-01-15", annualGoodThrough: "2021-01-31",
      hundredHourAtHours: 1200.5, hoursNow: 1250, hundredHourDueAtHours: 1300.5,
      staticCheckOn: null, staticCheckGoodThrough: null, transponderCheckOn: null, transponderCheckGoodThrough: null,
      eltInspectedOn: "2026-02-01", eltInspectionGoodThrough: "2099-02-28", eltBatteryDueOn: "2099-06-01",
    },
  };
  const saved: Record<string, unknown>[] = [];
  await page.route(url => url.pathname === "/api/aircraft", route => route.fulfill({ json: [plane] }));
  await page.route(url => url.pathname === "/api/aircraft/5/inspections", async route => {
    saved.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ json: plane });
  });
  await page.goto("/app/plan");
  await showTabs(page);
  await openConsole(page);
  const console = page.getByTestId("console-sheet");
  await library(console, "Airplanes");
  await console.getByRole("button", { name: "Edit N12345" }).click();
  await expect(page.getByTestId("inspection-annualOn")).toHaveText("Past due since 2021-01-31");
  await expect(page.getByTestId("inspection-eltInspectedOn")).toHaveText("To 2099-02-28");
  await expect(page.getByTestId("inspection-eltBattery")).toHaveText("By 2099-06-01");
  await expect(page.getByTestId("inspection-hundredHour")).toHaveText(", 50.5 h to go");

  await page.getByTestId("inspection-annualOn-date").fill("2026-09-20");
  await page.getByTestId("inspection-transponderCheckOn-date").fill("2025-03-02");
  await page.getByTestId("inspection-hoursNow").fill("1262.3");
  await page.getByTestId("inspections-save").click();
  await expect.poll(() => saved.at(-1)).toMatchObject({
    annualOn: "2026-09-20", transponderCheckOn: "2025-03-02", hoursNow: 1262.3, hundredHourAtHours: 1200.5,
    eltInspectedOn: "2026-02-01", eltBatteryDueOn: "2099-06-01", staticCheckOn: null,
  });
});

test("an airplane's checklists are written from its handbook, kept on this device, then run item by item", async ({ page }) => {
  const plane = {
    id: 5, tailNumber: "N12345", typeDesignator: "C172", cruiseTasKt: 110, fuelBurnGph: 8.5, cruisePowerPct: null,
    climbTasKt: null, climbFuelBurnGph: null, usableFuelGal: 40, createdAt: "2026-01-01T00:00:00Z", vorCheck: null, openSquawks: [],
    inspections: {
      annualOn: null, annualGoodThrough: null, hundredHourAtHours: null, hoursNow: null, hundredHourDueAtHours: null,
      staticCheckOn: null, staticCheckGoodThrough: null, transponderCheckOn: null, transponderCheckGoodThrough: null,
      eltInspectedOn: null, eltInspectionGoodThrough: null, eltBatteryDueOn: null,
    },
  };
  await page.route(url => url.pathname === "/api/aircraft", route => route.fulfill({ json: [plane] }));
  await page.goto("/app/plan");
  await showTabs(page);
  await openConsole(page);
  const console = page.getByTestId("console-sheet");
  await library(console, "Airplanes");
  await console.getByRole("button", { name: "Edit N12345" }).click();
  await page.getByRole("button", { name: /^Checklists/ }).click();
  await expect(console).toContainText("No checklist yet");
  await console.getByTestId("checklist-edit").click();
  // An empty editor offers the phases' headings alone, nothing under them.
  await console.getByTestId("checklist-phases").click();
  await expect(console.getByTestId("checklist-text")).toHaveValue(/^# Preflight inspection\n/);
  await console.getByTestId("checklist-text").fill("# Before takeoff\nFuel selector -- Both\nMixture ..... Rich");
  await console.getByTestId("checklist-save").click();
  // Kept in this browser under the airplane's key, not sent anywhere.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("wingtip.checklists") ?? "{}") as unknown))
    .toEqual({ "mine:5": { normal: "# Before takeoff\nFuel selector -- Both\nMixture ..... Rich" } });
  const items = console.getByTestId("checklist-item");
  await expect(items).toHaveCount(2);
  await items.first().click();
  await expect(items.first()).toHaveAttribute("aria-checked", "true");
  await expect(console).toContainText("1 of 2");
  await console.getByTestId("checklist-reset").click();
  await expect(items.first()).toHaveAttribute("aria-checked", "false");
  // The emergency list is the airplane's other, empty until written.
  await console.getByTestId("checklist-kind").getByText("Emergency").click();
  await expect(console).toContainText("No emergency checklist yet");
});

test("a squawk is written with its 91.213(d) deferral, and fixed", async ({ page }) => {
  const plane = {
    id: 5, tailNumber: "N12345", typeDesignator: "C172", cruiseTasKt: 110, fuelBurnGph: 8.5, cruisePowerPct: null,
    climbTasKt: null, climbFuelBurnGph: null, usableFuelGal: 40, createdAt: "2026-01-01T00:00:00Z", vorCheck: null, inspections: null,
    openSquawks: [] as unknown[],
  };
  let squawks: Record<string, unknown>[] = [];
  const written: Record<string, unknown>[] = [];
  await page.route(url => url.pathname === "/api/aircraft", route => route.fulfill({ json: [plane] }));
  await page.route(url => url.pathname.startsWith("/api/aircraft/5/squawks"), async route => {
    const method = route.request().method();
    if (method === "POST" || method === "PUT") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      written.push(body);
      const id = method === "POST" ? squawks.length + 1 : Number(new URL(route.request().url()).pathname.split("/").pop());
      squawks = [...squawks.filter(s => s.id !== id), { id, ...body }];
      return route.fulfill({ json: { id, ...body } });
    }
    await route.fulfill({ json: squawks });
  });
  await page.goto("/app/plan");
  await showTabs(page);
  await openConsole(page);
  const console = page.getByTestId("console-sheet");
  await library(console, "Airplanes");
  await console.getByRole("button", { name: "Edit N12345" }).click();
  await page.getByRole("button", { name: /^Squawks/ }).click();
  await expect(console).toContainText("None open");

  await console.getByTestId("squawk-text").fill("Landing light out");
  await console.getByTestId("squawk-inoperative").click();
  await console.getByTestId("squawk-deferred").click();
  await page.getByRole("menuitemradio", { name: "Deferred for VFR by day" }).click();
  await console.getByTestId("squawk-add").click();
  await expect.poll(() => written[0]).toMatchObject({ text: "Landing light out", inoperative: true, deferredFor: "VFR_DAY", fixedOn: null });
  const open = console.getByTestId("squawk-open");
  await expect(open).toContainText("Deferred for VFR by day");

  await open.click();
  await console.getByTestId("squawk-fix-note").fill("Bulb replaced");
  await console.getByTestId("squawk-fix").click();
  await expect.poll(() => written[1]).toMatchObject({ text: "Landing light out", fixNote: "Bulb replaced" });
  await expect(console).toContainText("None open");
  await expect(console).toContainText("Bulb replaced");
});
