import { test, expect } from "@playwright/test";
import { foldRoute, openPanel, openRoute, settle, sideDrawer, slow } from "./helpers";
import { airportMarks } from "./mapHelpers";

/**
 * FPL's route open to edit, one grouped list as Apple Maps' Directions (the
 * owner, 2026-11-17): each row a point, a tap on it changed by the one
 * search, its runways and procedures from its menu. Before, as the owner picked (boards 4 and 5
 * of the canvas): the ident on top, a fuel stop's pump before it and the
 * fuel in the tanks after it, the time over the elevation, the wind under;
 * opened, a line for the landing and one for the takeoff, no words for
 * either ("no need to use the word depart, fuel stop, arrive"). The rest of
 * the suite starts with them opened (auth.setup's vfr.fieldsOpen); here
 * they start as a pilot's do.
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

/** A field's runways and procedures opened under its row from its menu
 *  (the open route, where a tap on the row changes the point). */
async function details(page: import("@playwright/test").Page, field: import("@playwright/test").Locator) {
  await field.getByTestId("point-menu").click();
  await page.getByTestId("point-menu-details").click();
}

test("open to edit, the route is one grouped list: each field its ident over its city and its time, its runways from its menu", async ({
  page,
}) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await openRoute(page);
  const route = sideDrawer(page).getByTestId("procedures");
  for (const [name, ident] of [
    ["C81 · Depart", "C81"],
    ["KDLH · Arrive", "KDLH"],
  ] as const) {
    const field = route.getByRole("region", { name });
    // Apple Maps' Directions' row: its ident, its city under it, its time;
    // no role, wind or elevation on the row, and no fold of its own.
    await expect(field.getByTestId("field-ident")).toHaveText(ident, { timeout: slow(30_000) });
    await expect(field.getByTestId("field-city")).not.toBeEmpty();
    await expect(field.getByTestId("field-role")).toHaveCount(0);
    await expect(field.getByTestId("field-toggle")).toHaveCount(0);
    await expect(field.getByTestId("point-figures").first()).toBeVisible();
    // Its runways and procedures, and its wind, from its menu.
    if ((await field.getByTestId("procedure-pattern").count()) === 0) await details(page, field);
    await expect(field.getByTestId("procedure-pattern").first()).toBeVisible({ timeout: slow(30_000) });
    await expect(field.getByTestId("field-wind")).toBeVisible();
  }
});

test("a stop's landing and takeoff from its menu, and a fuel stop wears the pump on its mark", async ({ page }) => {
  // The fields alone: the plan through the stop is not what is tried.
  await page.route(
    (url) => /\/(course|checkpoints|navlog|briefing)$/.test(url.pathname) && !!url.searchParams.get("stops"),
    (route) => route.abort(),
  );
  await page.goto("/app/plan?dep=C81&stops=KMSN&dest=KDLH&fuel=KMSN");
  await settle(page);
  await openPanel(page);
  await openRoute(page);
  const route = sideDrawer(page).getByTestId("procedures");
  const stop = route.getByRole("region", { name: "KMSN · Arrive" });
  await expect(stop).toBeVisible({ timeout: slow(30_000) });
  await expect(stop.getByRole("img", { name: "fuel stop" })).toBeVisible();
  await expect(route).not.toContainText("Fuel stop");
  if ((await route.getByRole("region", { name: "KMSN · Depart" }).count()) === 0) await details(page, stop);
  await expect(stop.getByRole("img", { name: "landing" })).toBeVisible();
  await expect(route.getByRole("region", { name: "KMSN · Depart" }).getByRole("img", { name: "takeoff" })).toBeVisible();
  // A stop of the pilot's own: no pump.
  await page.goto("/app/plan?dep=C81&stops=KMSN&dest=KDLH");
  await openPanel(page);
  await openRoute(page);
  await expect(route.getByRole("region", { name: "KMSN · Arrive" })).toBeVisible({ timeout: slow(30_000) });
  await expect(route.getByRole("img", { name: "fuel stop" })).toHaveCount(0);
});

test("a tap on a row changes its point by the one search, the departure, a stop, the destination and My Location alike", async ({
  page,
}) => {
  // The owner, 2026-11-17: "should be able to change any of the stops
  // including my location", "Changeable by tapping".
  await page.goto("/app/plan?dep=C81&stops=KMSN&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await openRoute(page);
  const route = sideDrawer(page).getByTestId("procedures");
  const search = page.getByTestId("search-airports");
  const change = async (name: string, to: string) => {
    await route.getByRole("button", { name: new RegExp(`^${name}.*: change$`) }).click();
    await expect(search).toBeFocused({ timeout: slow(10_000) });
    await search.fill(to);
    await search.press("Enter");
  };
  await change("Departure C81", "KUGN");
  await expect(page).toHaveURL(/dep=KUGN/, { timeout: slow(15_000) });
  await change("Stop KMSN", "KRST");
  await expect(page).toHaveURL(/stops=KRST/, { timeout: slow(15_000) });
  await change("Destination KDLH", "KMSP");
  await expect(page).toHaveURL(/dest=KMSP/, { timeout: slow(15_000) });
  // A Direct To's start, My Location, changed to a field: a route from it.
  await page.goto("/app/plan?dep=@42.2333,-87.9883&dest=KUGN&direct=KUGN&was=C81%7C%7CKUGN");
  await settle(page);
  await openPanel(page);
  await openRoute(page);
  await route.getByRole("button", { name: /^My Location: change$/ }).click();
  await expect(search).toBeFocused({ timeout: slow(10_000) });
  await search.fill("C81");
  await search.press("Enter");
  await expect(page).toHaveURL(/dep=C81/, { timeout: slow(15_000) });
  await expect(page).not.toHaveURL(/[?&]direct=/);
});

test("while the route is open the map shows its points alone; folded, everything again", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  // The chart's other airports drawn now (AirportsGl's probe, rendered
  // marks only): some folded, none while the route is open.
  await expect.poll(async () => (await airportMarks(page)).length, { timeout: slow(30_000) }).toBeGreaterThan(0);
  await openRoute(page);
  await expect.poll(async () => (await airportMarks(page)).length, { timeout: slow(10_000) }).toBe(0);
  await foldRoute(page);
  await expect.poll(async () => (await airportMarks(page)).length, { timeout: slow(10_000) }).toBeGreaterThan(0);
});
