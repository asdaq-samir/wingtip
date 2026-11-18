import { test, expect } from "@playwright/test";
import { controlsInSight, openPanel, settle, sideDrawer, slow, openRoute } from "./helpers";
import { stopsAre } from "./stopsParam";
import { pickAirplane } from "./startState";
import { recordedStops } from "./recordedStops";

test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

// A recorded route's course is asked for as soon as the route goes in
// (PlanWorkspace's setRoute), and a test that has what it came for can
// end with its live half still on the way: it is let go, not failed on.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("a flight saved with a stop is filed with it and the altitude set there, and its nav log lands there", async ({ page }) => {
  await recordedStops(page);
  const filed: { stops?: string[]; altitudes?: string | null; checkpoints: { category: string; name: string }[] }[] = [];
  await page.route("**/api/me", (route) =>
    route.fulfill({ json: { id: 1, email: "pilot@example.com", displayName: "A Pilot", developer: false } }),
  );
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/flights", async (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ json: [] });
    filed.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, json: { id: 1 } });
  });
  await page.goto("/app/plan?dep=C81&dest=KDLH&stops=KMSN&altitudes=KMSN:2400&view=briefing");
  const save = page.getByTestId("save-flight-button");
  await controlsInSight(page);
  // Save, in the route's Share menu.
  await sideDrawer(page).getByTestId("share-route").click();
  await expect(save).toBeEnabled({ timeout: slow(30000) });
  await save.click();

  await expect.poll(() => filed.length).toBe(1);
  expect(filed[0]!.stops).toEqual(["KMSN"]);
  // With the altitude the pilot set there, to be planned at again.
  expect(filed[0]!.altitudes).toBe("KMSN:2400");
  expect(filed[0]!.checkpoints.filter((c) => c.category === "stop").map((c) => c.name)).toEqual(["KMSN"]);
});

test("the route's box is round, one line tall for a short route and the panel's width, the Nav log and Share inside it under its line, no words after its destination, a tap on its empty room the field at its end, and Enter takes the first airport offered for what is typed", async ({
  page,
}) => {
  await recordedStops(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  // All the way up, the route's box over its chips.
  await controlsInSight(page);
  await openRoute(page);
  const box = sideDrawer(page).getByTestId("route-box");
  await expect(box).toBeVisible();
  // Round as the search bar's field is, one line tall for a route that
  // fits one (a second as one needs it, below), the panel's width to
  // itself, at the pilot's ask; the ••• in FPL's bar over it and the actions' bar below,
  // the airplane's strip, the sheet's first row (the owner, 2026-11-14:
  // "The route box just become a single row under it").
  const shape = await box.evaluate((el) => ({ radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) }));
  expect(shape.radius).toBeGreaterThanOrEqual(20);
  const lines = (await sideDrawer(page).getByTestId("route-slide").boundingBox())!;
  expect(lines.height).toBeGreaterThanOrEqual(36);
  expect(lines.height).toBeLessThanOrEqual(48);
  const boxAt = (await box.boundingBox())!,
    panelAt = (await sideDrawer(page).boundingBox())!;
  expect(panelAt.x + panelAt.width - (boxAt.x + boxAt.width)).toBeLessThanOrEqual(16);
  const brief = (await sideDrawer(page).getByTestId("route-brief").boundingBox())!;
  const share = (await sideDrawer(page).getByTestId("share-route").boundingBox())!;
  // Share sits below the box, as the Brief does.
  expect(share.y).toBeGreaterThanOrEqual(boxAt.y + boxAt.height);
  expect(brief.y).toBeGreaterThanOrEqual(boxAt.y + boxAt.height);
  // No "Add stop" after the destination, at the pilot's ask: a reader is
  // told what typing there does.
  const end = sideDrawer(page).getByTestId("route-type");
  await expect(end).toHaveAttribute("data-placeholder", "");
  await expect(end).toHaveAccessibleName("Add stop, the new destination");

  // A tap on the box's empty room past the destination's pill, short of the
  // route's clear at the end: the field after the last point, taken.
  const destination = (await sideDrawer(page).getByTestId("route-dest").boundingBox())!;
  await page.mouse.click(destination.x + destination.width + 24, destination.y + destination.height / 2);
  await expect(end).toHaveAccessibleName("Add stop, the new destination");
  await expect(end).toBeFocused();

  // An arrow asks the one search for a stop there, no field of the box's
  // own (the one card rule, 2026-11-10): a town's name, its field offered
  // first, and Enter takes it, as a stop.
  await sideDrawer(page).getByRole("button", { name: "Add a stop between C81 and KDLH" }).click();
  await expect(sideDrawer(page).getByTestId("route-type")).not.toHaveAccessibleName("A stop here");
  const field = page.getByTestId("search-airports");
  await expect(field).toHaveAttribute("placeholder", "Search airports and waypoints");
  // A stop's rows come from the airports' copy at once and the planner's
  // answer (with the waypoints) a debounce and a request later; Enter
  // before it keeps what was typed (useAirportSearch `answered`), so on a
  // slow CI stack the first row showing was not yet the one Enter takes.
  const answer = page.waitForResponse((r) => /\/airports\/search\?/i.test(r.url()) && /madison/i.test(r.url()), { timeout: slow(15000) });
  await field.fill("madison");
  const first = page.getByRole("option").first();
  await expect(first).toContainText("KMSN", { timeout: slow(10000) });
  await answer;
  await page.waitForTimeout(300);
  await field.press("Enter");
  await expect(page).toHaveURL(stopsAre("KMSN"));
  await expect(page).toHaveURL(/[?&]dest=KDLH(&|$)/);
});

test("a town's name typed with the airports shown takes the first of them at Enter, before the planner's waypoints answer", async ({
  page,
}) => {
  // The planner's search held back: what is shown is the airports' copy
  // alone (lib/airportIndex). "madison" is no point's ident, so Enter
  // takes the first airport shown -- it was put in as typed, which is
  // nothing, and the box emptied (a CI run, 2026-10-10).
  await recordedStops(page);
  await page.route(
    (url) => url.pathname.includes("/airports/search"),
    () => new Promise(() => undefined),
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await openRoute(page);
  // Typed in the box after its last point: the new destination, Duluth a
  // stop on the way.
  const field = sideDrawer(page).getByTestId("route-type");
  await field.fill("madison");
  await expect(page.getByTestId("route-suggestions").getByRole("option").first()).toContainText("KMSN", { timeout: slow(10000) });
  await field.press("Enter");
  await expect(page).toHaveURL(/[?&]dest=KMSN(&|$)/);
  await expect(page).toHaveURL(stopsAre("KDLH"));
});

test("a short town's name (four letters) takes the first airport shown at Enter, as a long one does", async ({ page }) => {
  // "reno" is two to five letters and digits, which stopOf takes for an
  // ident; it is no row's ident, so Enter takes the first row all the same.
  await recordedStops(page);
  await page.route(
    (url) => url.pathname.includes("/airports/search"),
    () => new Promise(() => undefined),
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await openRoute(page);
  const field = sideDrawer(page).getByTestId("route-type");
  await field.fill("reno");
  const first = page.getByTestId("route-suggestions").getByRole("option").first();
  await expect(first).toBeVisible({ timeout: slow(10000) });
  const ident = (await first.innerText()).match(/\b[A-Z0-9]{3,4}\b/)?.[0];
  await field.press("Enter");
  await expect(page).toHaveURL(new RegExp(`[?&]dest=${ident}(&|$)`));
});

test("a long route's box is one row that slides sideways to the rest, faded where it runs on", async ({ page }) => {
  // The owner (2026-11-04): "FPL can be fixed as one row, in which ids can
  // slide etc. even when routes have more fixes than the space in the row".
  // Nothing past the course asked of the planner: the box is the claim.
  await page.route(
    (url) => /\/(checkpoints|navlog|briefing)$/.test(url.pathname),
    (route) => route.abort(),
  );
  // The most stops a route takes (MAX_STOPS): ten points.
  await page.goto("/app/plan?dep=C81&dest=KDLH&stops=KRYV,KMSN,KEAU,KOSH,KCWA,KSTE,KATW,KGRB");
  await settle(page);
  await openPanel(page);
  await openRoute(page);
  const lines = sideDrawer(page).getByTestId("route-slide");
  await expect(lines.locator("[role=group]")).toHaveCount(10);
  const box = await lines.evaluate((el) => ({
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
    tops: [...new Set([...el.querySelectorAll("[role=group]")].map((g) => Math.round(g.getBoundingClientRect().top)))].length,
    mask: getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage,
  }));
  // One line, its height a line's, the rest past its end.
  expect(box.tops).toBe(1);
  expect(box.clientHeight).toBeLessThanOrEqual(48);
  expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight + 1);
  expect(box.scrollWidth).toBeGreaterThan(box.clientWidth + 40);
  expect(box.mask).toContain("gradient");
  // Slid to its end: the destination whole in sight.
  const destination = sideDrawer(page).getByTestId("route-dest");
  await lines.evaluate((el) => el.scrollTo(el.scrollWidth, 0));
  await expect(destination).toBeInViewport({ ratio: 1 });
});

// Add Stop, beside Fly Here, at the pilot's ask: the field the route's
// next stop, after the ones it makes and before its destination; none on
// a card of the route's own points; with no route, the first point of one.
test("an airport's card adds it as the route's next stop; a card of the route's own points has it greyed, saying why", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KMSN&place=KMSN");
  await expect(page.getByTestId("place-card")).toBeVisible({ timeout: slow(30000) });
  await expect(page.getByTestId("fly-here")).toBeVisible();
  await expect(page.getByTestId("place-add-stop")).toBeDisabled(); // shown, off (0612a82b3)
  await expect(page.getByTestId("place-add-stop")).toHaveAccessibleName(/already on the route/);

  await page.goto("/app/plan?dep=C81&stops=KJVL&dest=KMSN&place=KDLH");
  const add = page.getByTestId("place-add-stop");
  await expect(add).toBeVisible({ timeout: slow(30000) });
  await expect(add).toHaveText("Add Stop");
  await add.click();
  await expect(page).toHaveURL(stopsAre("KJVL,KDLH"));
  await expect(page).toHaveURL(/[?&]dest=KMSN/);
  await expect(page).toHaveURL(/[?&]dep=C81/);
  await expect(page.getByTestId("place-card")).toHaveCount(0);

  await page.goto("/app/plan?place=KDLH");
  await page.getByTestId("place-add-stop").click();
  await expect(page).toHaveURL(/[?&]dep=KDLH/);
  await expect(page).not.toHaveURL(/[?&]dest=/);
  // The route's timeline, at the pill's size: the destination to pick.
  await controlsInSight(page);
  await expect(sideDrawer(page).getByTestId("timeline-pick-dest")).toHaveText("Destination");
});

test("the route's airports are marked by their airspace's ring and their weather's dot", async ({ page }) => {
  await page.route(
    (url) => /\/(checkpoints|navlog)$/.test(url.pathname),
    (route) => route.abort(),
  );
  // Each point of the route's title led by its field's chart mark (the
  // polish pass, 2026-10-26): Duluth's Class D ring.
  const mark = () => sideDrawer(page).getByRole("group", { name: "Destination KDLH" }).locator("[data-airport-mark]");
  const weather = () => mark().locator("[data-weather]").getAttribute("fill");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await openRoute(page);
  await expect(mark()).toHaveAttribute("data-airspace", "D", { timeout: slow(15000) });
  // Its METAR's colour in the middle, or the grey of none, as the chart's
  // marks have it: no setting since the owner's split (2026-10-27).
  await expect.poll(weather, { timeout: slow(15000) }).toMatch(/^(#|rgb|oklch)/);
});

/**
 * A round trip's field twice in FPL's list: left from as its Departure and
 * landed at as its Destination (the audit's finding: it was one step,
 * "Arrive", with no departure).
 */
test("a round trip's field is a Depart step and an Arrive step, each with its runway", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&stops=KJVL&dest=C81");
  await settle(page);
  await openPanel(page);
  await openRoute(page);
  const route = sideDrawer(page).getByTestId("procedures");
  await expect(route.getByRole("region", { name: "C81 · Depart" })).toBeVisible({ timeout: slow(60000) });
  await expect(route.getByRole("region", { name: "C81 · Arrive" })).toBeVisible({ timeout: slow(60000) });
  await expect(route.getByRole("region", { name: "C81 · Depart" }).getByRole("group", { name: "C81 takeoff runway" })).toBeVisible();
});
