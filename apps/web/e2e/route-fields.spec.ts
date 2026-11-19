import { test, expect, type Page } from "@playwright/test";
import { openPanel, settle, sideDrawer, slow, timelineLine } from "./helpers";
import { airportMarks } from "./mapHelpers";

/**
 * FPL's route on the ground, its timeline (the owner, 2026-11-17: "Yes
 * let's try that"), read and edited at once with the sheet at half: a line
 * a point, Apple Maps' Directions' look -- its mark (its menu), its ident,
 * no city ("We don't need to say the city name"), its time and its grip.
 * A tap on a field's line opens it under it, one at a time: its wind and
 * elevation, then its runway and procedure chips; a point is changed from
 * its mark's menu by the one search. The rest of the suite starts with the
 * fields open (auth.setup's wingtip.fieldsOpen); here they start as a
 * pilot's do.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem("wingtip.fieldsOpen");
    } catch {
      /* no storage */
    }
  });
});

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

/** A field's line opened by a tap on it, off its ident. */
async function openLine(page: Page, ident: string) {
  const line = timelineLine(page, ident);
  // Below full, two stops or more are one row, a tap on it taking the
  // sheet all the way up where each is its own.
  const stops = sideDrawer(page).getByTestId("timeline-stops");
  if ((await stops.count()) > 0) await stops.click();
  await line.getByTestId("timeline-toggle").click();
  await expect(line).toHaveAttribute("data-open", "");
}

test("each line is its ident and time, no city; a tap opens its wind and elevation, then its chips, one line at a time", async ({
  page,
}) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  for (const ident of ["C81", "KDLH"]) {
    const line = timelineLine(page, ident);
    await expect(line.getByTestId("timeline-ident")).toHaveText(ident, { timeout: slow(30_000) });
    await expect(line.getByTestId("timeline-time")).toBeVisible();
    await expect(line.getByTestId("route-grip")).toBeVisible();
    // Folded: nothing under the line.
    await expect(line.getByTestId("timeline-details")).toHaveCount(0);
  }
  await openLine(page, "C81");
  const dep = timelineLine(page, "C81");
  await expect(dep.getByTestId("field-wind")).toBeVisible({ timeout: slow(30_000) });
  await expect(dep.getByTestId("point-figures")).toBeVisible();
  await expect(dep.getByTestId("timeline-chips").getByTestId("procedure-pattern").first()).toBeVisible({ timeout: slow(30_000) });
  // Another line opened folds the first.
  await openLine(page, "KDLH");
  await expect(dep).not.toHaveAttribute("data-open", "");
  // The open line again folds it.
  await timelineLine(page, "KDLH").getByTestId("timeline-toggle").click();
  await expect(timelineLine(page, "KDLH")).not.toHaveAttribute("data-open", "");
});

test("a stop opens to its landing and its takeoff, and a fuel stop wears the pump as its mark", async ({ page }) => {
  // The fields alone: the plan through the stop is not what is tried.
  await page.route(
    (url) => /\/(course|checkpoints|navlog|briefing)$/.test(url.pathname) && !!url.searchParams.get("stops"),
    (route) => route.abort(),
  );
  await page.goto("/app/plan?dep=C81&stops=KMSN&dest=KDLH&fuel=KMSN");
  await settle(page);
  await openPanel(page);
  const stop = timelineLine(page, "KMSN");
  // One stop is its own row, never in a stops' row.
  await expect(stop).toBeVisible({ timeout: slow(30_000) });
  await expect(sideDrawer(page).getByTestId("timeline-stops")).toHaveCount(0);
  // The pump is a zero-size sr-only img: its mark is drawn, not its box.
  await expect(stop.getByTestId("timeline-fuel")).toBeVisible();
  await expect(stop.getByRole("img", { name: "fuel stop" })).toHaveCount(1);
  await expect(sideDrawer(page).getByTestId("route-summary")).not.toContainText("Fuel stop");
  await openLine(page, "KMSN");
  await expect(stop.getByRole("img", { name: "landing" })).toBeVisible({ timeout: slow(30_000) });
  await expect(stop.getByRole("img", { name: "takeoff" })).toBeVisible();
  // A stop of the pilot's own: no pump.
  await page.goto("/app/plan?dep=C81&stops=KMSN&dest=KDLH");
  await openPanel(page);
  await expect(timelineLine(page, "KMSN")).toBeVisible({ timeout: slow(30_000) });
  await expect(sideDrawer(page).getByRole("img", { name: "fuel stop" })).toHaveCount(0);
});

test("a point is changed from its mark's menu by the one search, the departure, a stop, the destination and My Location alike", async ({
  page,
}) => {
  // The owner, 2026-11-17: "should be able to change any of the stops
  // including my location"; changing moved from the row to the mark's menu.
  await page.goto("/app/plan?dep=C81&stops=KMSN&dest=KDLH");
  await settle(page);
  await openPanel(page);
  const search = page.getByTestId("search-airports");
  const change = async (ident: string, to: string) => {
    await timelineLine(page, ident).getByTestId("point-menu").click();
    await page.getByTestId("point-menu-change").click();
    await expect(search).toBeFocused({ timeout: slow(10_000) });
    await search.fill(to);
    await search.press("Enter");
  };
  await change("C81", "KUGN");
  await expect(page).toHaveURL(/dep=KUGN/, { timeout: slow(15_000) });
  await change("KMSN", "KRST");
  await expect(page).toHaveURL(/stops=KRST/, { timeout: slow(15_000) });
  await change("KDLH", "KMSP");
  await expect(page).toHaveURL(/dest=KMSP/, { timeout: slow(15_000) });
  // A Direct To's start, My Location, changed to a field: a route from it.
  await page.goto("/app/plan?dep=@42.2333,-87.9883&dest=KUGN&direct=KUGN&was=C81%7C%7CKUGN");
  await settle(page);
  await openPanel(page);
  const here = sideDrawer(page).getByTestId("timeline-line").first();
  await expect(here.getByTestId("timeline-ident")).toHaveText("My Location", { timeout: slow(30_000) });
  // My Location has no second row.
  await expect(here.getByTestId("timeline-toggle")).toHaveCount(0);
  await here.getByTestId("point-menu").click();
  await page.getByTestId("point-menu-change").click();
  await expect(search).toBeFocused({ timeout: slow(10_000) });
  await search.fill("C81");
  await search.press("Enter");
  await expect(page).toHaveURL(/dep=C81/, { timeout: slow(15_000) });
  await expect(page).not.toHaveURL(/[?&]direct=/);
});

test("Add a Stop, the timeline's last row, asks the one search and puts the pick before the destination", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await sideDrawer(page).getByTestId("timeline-add-stop").click();
  const search = page.getByTestId("search-airports");
  await expect(search).toBeFocused({ timeout: slow(10_000) });
  await search.fill("KMSN");
  await search.press("Enter");
  await expect(page).toHaveURL(/stops=KMSN/, { timeout: slow(15_000) });
});

test("while a line is open the map shows the route's points alone; folded, everything again", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  // The chart's other airports drawn now (AirportsGl's probe, rendered
  // marks only): some with every line folded, none while one is open.
  await expect.poll(async () => (await airportMarks(page)).length, { timeout: slow(30_000) }).toBeGreaterThan(0);
  // The departure's line, so the map is centred on C81 and folded shows
  // Chicago's fields: CI's overlay tiles are cut round Chicago (41.4 to
  // 43.4 N, scripts/build/e2e-overlay-tiles.sh), and centred on Duluth,
  // KDLH's line, its map had no other field to draw again.
  await openLine(page, "C81");
  await expect.poll(async () => (await airportMarks(page)).length, { timeout: slow(10_000) }).toBe(0);
  await timelineLine(page, "C81").getByTestId("timeline-toggle").click();
  await expect.poll(async () => (await airportMarks(page)).length, { timeout: slow(10_000) }).toBeGreaterThan(0);
});
