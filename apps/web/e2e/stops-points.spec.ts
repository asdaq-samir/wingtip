import { test, expect } from "@playwright/test";
import { inSheet, openPanel, settle, sideDrawer, slow } from "./helpers";
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

test("every point's row ends in its time over its altitude and a menu: an airport's elevation until set, Direct to skipping the route before it, and Cancel giving it back", async ({
  page,
}) => {
  // The owner's asks (2026-10-20): "All the other fixes and stops can have
  // a direct to and altitude. Where airports default to field elevation
  // but changeable"; "direct to skips all the route before"; then row A,
  // "keep the format of altitude (elev/published/cruising) and eta to the
  // right side", and "Each stop can have a menu ... the menu can include
  // direct to".
  await recordedStops(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH&stops=KMSN");
  await openPanel(page);
  const route = sideDrawer(page).getByTestId("procedures");
  const madison = route.getByRole("region", { name: "KMSN · Arrive" });
  const altitude = madison.getByTestId("point-altitude-figure");
  // Madison's field elevation (887 ft, NASR), not a figure the pilot set,
  // under its time.
  await expect(altitude).toHaveAttribute("data-kind", "elev", { timeout: slow(30_000) });
  // The mountain before it for the eye (PointFigures), "ft" after.
  await expect(altitude).toHaveText(/^(\d{3}|\d,\d{3}) ft/);
  await expect(altitude.locator(".sr-only")).toHaveText(/ft, field elevation$/);
  await expect(madison.getByTestId("point-figures")).toContainText(/^\d\d:\d\d/);
  // No Direct to where the flight starts, nor on the stop's leaving again.
  // One menu an airport now, at its ident (boards 4 and 5): Madison's is
  // its landing's, flown to.
  for (const name of ["C81 · Depart"]) {
    await inSheet(page, route.getByRole("region", { name }).getByTestId("point-menu"));
    await route.getByRole("region", { name }).getByTestId("point-menu").click();
    await expect(page.getByTestId("point-menu-direct")).toHaveCount(0);
    await page.keyboard.press("Escape");
  }

  // Set from its menu, as the route box's menu sets it: the address's
  // `altitudes`.
  await inSheet(page, madison.getByTestId("point-menu"));
  await madison.getByTestId("point-menu").click();
  await page.getByTestId("point-menu-altitude").click();
  await page.getByTestId("point-altitude-input").fill("2600");
  await page.getByTestId("point-altitude-set").click();
  await expect(page).toHaveURL(/[?&]altitudes=KMSN(%3A|:)2600(&|$)/);
  await expect(altitude).toHaveAttribute("data-kind", "set");
  await expect(altitude).toContainText("2,600 ft");

  // Direct to Duluth with no position: from the departure, Madison
  // skipped; the route as it was kept for Cancel.
  const duluth = route.getByRole("region", { name: "KDLH · Arrive" });
  await inSheet(page, duluth.getByTestId("point-menu"));
  await duluth.getByTestId("point-menu").click();
  await page.getByTestId("point-menu-direct").click();
  await expect(page).toHaveURL(/[?&]direct=KDLH(&|$)/);
  await expect(page).not.toHaveURL(/[?&]stops=/);
  await expect(sideDrawer(page).getByTestId("direct-strip")).toContainText("Direct to KDLH");
  await expect(route.getByRole("region", { name: "KMSN · Arrive" })).toHaveCount(0);
  await expect(duluth).toContainText("Direct to");
  await sideDrawer(page).getByTestId("direct-cancel").click();
  await expect(page).toHaveURL(stopsAre("KMSN"));
  await expect(page).not.toHaveURL(/[?&](direct|was)=/);
  await expect(sideDrawer(page).getByTestId("direct-strip")).toHaveCount(0);

  // Taken out from its menu: the route without it.
  await inSheet(page, madison.getByTestId("point-menu"));
  await madison.getByTestId("point-menu").click();
  await page.getByTestId("point-menu-remove").click();
  await expect(page).not.toHaveURL(/[?&]stops=/);
});

test("on a phone a point's altitude is asked in the floating sheet from the bottom, Cancel and Set in its title row", async ({ page }) => {
  // The sheet consolidation (2026-10-27): it stood in the middle of a
  // phone as a box, its Cancel and Set under the field.
  test.skip(page.viewportSize()!.width >= 768, "a phone's sheet; wider it is an alert in the middle");
  await recordedStops(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH&stops=KMSN");
  await openPanel(page);
  const madison = sideDrawer(page).getByTestId("procedures").getByRole("region", { name: "KMSN · Arrive" });
  await expect(madison.getByTestId("point-altitude-figure")).toHaveAttribute("data-kind", "elev", { timeout: slow(30_000) });
  await inSheet(page, madison.getByTestId("point-menu"));
  await madison.getByTestId("point-menu").click();
  await page.getByTestId("point-menu-altitude").click();

  const sheet = page.getByRole("alertdialog", { name: "Altitude at KMSN" });
  await expect(sheet).toHaveAttribute("data-slot", "sheet-content");
  await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const look = await sheet.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return {
      left: box.left,
      right: innerWidth - box.right,
      foot: innerHeight - box.bottom,
      radius: parseFloat(getComputedStyle(el).borderTopLeftRadius),
    };
  });
  expect(look.left).toBeCloseTo(8, 0);
  expect(look.right).toBeCloseTo(8, 0);
  expect(look.foot).toBeCloseTo(8, 0);
  expect(look.radius).toBe(36);
  // Cancel at the title row's start, Set at its end, the title between,
  // all on one line; the field below with the focus, to type at once.
  const row = sheet.locator("[data-slot=sheet-header]");
  const cancel = row.getByRole("button", { name: "Cancel", exact: true });
  const set = row.getByTestId("point-altitude-set");
  const [c, t, s] = [
    (await cancel.boundingBox())!,
    (await row.locator("[data-slot=sheet-title]").boundingBox())!,
    (await set.boundingBox())!,
  ];
  expect(c.x + c.width).toBeLessThanOrEqual(t.x + 1);
  expect(t.x + t.width).toBeLessThanOrEqual(s.x + 1);
  for (const b of [c, s]) expect(Math.abs(b.y + b.height / 2 - (t.y + t.height / 2))).toBeLessThanOrEqual(4);
  const field = sheet.getByTestId("point-altitude-input");
  expect((await field.boundingBox())!.y).toBeGreaterThan(t.y + t.height);
  await expect(field).toBeFocused();

  // Cancel: nothing set.
  await cancel.click();
  await expect(sheet).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]altitudes=/);
  // Set, from the title row, once a figure is typed.
  await inSheet(page, madison.getByTestId("point-menu"));
  await madison.getByTestId("point-menu").click();
  await page.getByTestId("point-menu-altitude").click();
  await field.fill("");
  await expect(set).toBeDisabled();
  await field.fill("2600");
  await set.click();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/[?&]altitudes=KMSN(%3A|:)2600(&|$)/);
});

test("the pilot's own point off a fix is made from a point's menu or typed as a flight plan writes it, flown over after it", async ({
  page,
}) => {
  // The owner's asks (2026-10-20): "can a user also create their own point?
  // for example 30 miles 090 radial of vpbng", and "a fix should get its
  // own row". The routes after are the planner's to answer; this asks
  // only what goes into the address.
  await recordedStops(page);
  await page.route(
    (url) => /\/(course|checkpoints|navlog|briefing)$/.test(url.pathname) && (url.searchParams.get("stops") ?? "").includes("/"),
    (route) => route.abort(),
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH&stops=KMSN");
  await openPanel(page);
  const route = sideDrawer(page).getByTestId("procedures");
  const madison = route.getByRole("region", { name: "KMSN · Arrive" });
  await expect(madison.getByTestId("point-figures")).toContainText(/\d\d:\d\d/, { timeout: slow(30_000) });
  await inSheet(page, madison.getByTestId("point-menu"));
  await madison.getByTestId("point-menu").click();
  await page.getByTestId("point-menu-fix").click();
  await page.getByTestId("fix-from-course").fill("090");
  await page.getByTestId("fix-from-distance").fill("30");
  await page.getByTestId("fix-from-add").click();
  // Flown over next, after Madison.
  await expect(page).toHaveURL(stopsAre("KMSN,KMSN/090/30"));

  // Typed in the route's box as ForeFlight takes one, after its last
  // point, offered as the pilot's own point: a stop before the destination.
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await openPanel(page);
  await sideDrawer(page).getByTestId("route-type").fill("vpbng/090/30");
  const own = page.getByTestId("route-own-point");
  await expect(own).toContainText("30 nm on 090° from VPBNG");
  await own.click();
  await expect(page).toHaveURL(stopsAre("VPBNG/090/30"));
});

test("a hold is set from a point's menu, course, turns, legs and how long, and is a row of its own after the point; a tap changes or removes it", async ({
  page,
}) => {
  // The owner's asks (2026-10-20): "create a left/right hold", as Garmin
  // and ForeFlight do it, and "hold should get its own row". What the
  // planner makes of it (its entry, its minutes) is the planner's test's.
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await openPanel(page);
  const route = sideDrawer(page).getByTestId("procedures");
  const duluth = route.getByRole("region", { name: "KDLH · Arrive" });
  await expect(duluth.getByTestId("point-figures")).toContainText(/\d\d:\d\d/, { timeout: slow(60_000) });
  await inSheet(page, duluth.getByTestId("point-menu"));
  await duluth.getByTestId("point-menu").click();
  await page.getByTestId("point-menu-hold").click();
  const sheet = page.getByTestId("hold-sheet");
  await expect(sheet).toBeVisible();
  // The course flown to Duluth offered as the inbound course, once its
  // leg is in: straight ahead, a direct entry.
  await sheet.getByTestId("hold-course").fill("270");
  await sheet.getByTestId("hold-turns").getByRole("button", { name: "Left" }).click();
  await sheet.getByTestId("hold-length").click();
  await page.getByTestId("hold-length-3T").click();
  await sheet.getByTestId("hold-set").click();
  await expect(page).toHaveURL(/[?&]holds=KDLH(%3A|:)270(%3A|:)L(%3A|:)1M(%3A|:)3T(&|$)/);
  const row = route.getByTestId("route-hold");
  await expect(row).toContainText("Left turns · 270° inbound · 1 min legs · 3 turns");
  // Its own row, after Duluth's.
  expect((await row.boundingBox())!.y).toBeGreaterThan((await duluth.boundingBox())!.y);
  // Tapped: changed or taken off.
  await row.getByRole("button").click();
  await expect(sheet.getByTestId("hold-course")).toHaveValue("270");
  await sheet.getByTestId("hold-remove").click();
  await expect(page).not.toHaveURL(/[?&]holds=/);
  await expect(route.getByTestId("route-hold")).toHaveCount(0);
});

test("a point's menu has its altitude before Remove: an airport's pattern in feet, a waypoint's cruise as a flight level, each the pilot's to set and give back", async ({
  page,
}) => {
  // The route through the waypoint asks no more of the planner than its
  // course: its two hops' chart would be read on CI's runner.
  await page.route(
    (url) => /\/(checkpoints|navlog|briefing)$/.test(url.pathname) && url.searchParams.get("stops") === "VPBNG",
    (route) => route.abort(),
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH&stops=VPBNG");
  await settle(page);
  await openPanel(page);
  const lines = sideDrawer(page).getByTestId("route-slide");
  // The pill's menu is FPL's "⋯"'s, in its words (PointMenuItems).
  const item = page.getByTestId("pill-menu-altitude");

  // Duluth's pattern, from the course: its field and the pattern over it.
  await lines.getByRole("group", { name: "Destination KDLH" }).click({ button: "right" });
  await expect(item).toContainText("Set Altitude…");
  await expect(item).toContainText(/\d,\d00 ft/, { timeout: slow(15000) });
  await item.click();
  // The field once it is the point's (its name in its label): typed into
  // before then, the figure went into the dialog as it last was, made new
  // for the point a moment later.
  await page.getByLabel("Altitude at KDLH, feet").fill("2600");
  await page.getByTestId("point-altitude-set").click();
  await expect(page).toHaveURL(/[?&]altitudes=KDLH%3A2600(&|$)|[?&]altitudes=KDLH:2600(&|$)/);

  // The waypoint's, a flight level over its dashes.
  await lines.getByRole("group", { name: /VPBNG/ }).click({ button: "right" });
  await expect(item).toContainText("Set Altitude…");
  await expect(page.getByTestId("pill-menu-direct")).toContainText("Direct To");
  await item.click();
  await page.getByLabel("Altitude at VPBNG, flight level").fill("055");
  await page.getByTestId("point-altitude-set").click();
  await expect(page).toHaveURL(/KDLH(%3A|:)2600(%2C|,)VPBNG(%3A|:)5500(&|$)/);
  await lines.getByRole("group", { name: /VPBNG/ }).click({ button: "right" });
  await expect(item).toContainText("FL-055");
  // Its Escape once the menu has the focus: pressed as it opened, the key
  // went to the pill, still focused in the route's field, which keeps it.
  await expect(page.getByRole("menu")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(item).toHaveCount(0);

  // Given back to the plan: Duluth's own is gone from the address.
  await lines.getByRole("group", { name: "Destination KDLH" }).click({ button: "right" });
  await expect(item).toContainText("2,600 ft");
  await item.click();
  await page.getByTestId("point-altitude-reset").click();
  await expect(page).toHaveURL(/[?&]altitudes=VPBNG(%3A|:)5500(&|$)/);
  // And a point taken out takes its altitude with it.
  await lines.getByRole("group", { name: /VPBNG/ }).focus();
  await page.keyboard.press("Delete");
  await expect(page).not.toHaveURL(/[?&]altitudes=/);
});
