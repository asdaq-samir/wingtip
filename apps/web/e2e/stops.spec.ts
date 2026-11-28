import { test, expect } from "@playwright/test";
import {
  openRoute,
  typeRoute,
  foldRoute,
  clearTheRoute,
  closeNavLog,
  emptyPlan,
  grabberTo,
  inSheet,
  navLogSheet,
  openNavLog,
  openPanel,
  settle,
  showTabs,
  sideDrawer,
  sheetFoot,
  slow,
} from "./helpers";
import { stopsAre } from "./stopsParam";
import { otherRunway, runwayOf } from "./procedureStubs";
import { markWith } from "./marks";
import { pickAirplane } from "./startState";
import { departTime, fillTime } from "./ariaFields";
import { recordedStops } from "./recordedStops";

test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

/**
 * A route that lands on the way, as Maps' Add Stop: a stop added in the
 * panel's second row goes into the address, the capsule names the route through it, the nav log lands at it, and each flight between two
 * landings has its own fuel check. Took off again, the route is as it was.
 *
 * C81 to KDLH through KMSN is the planner's own answer, recorded: its two
 * hops' chart has never been read on CI's runner, and reading it would
 * be minutes of a two-minute run. The route without the stop is the live
 * planner's, and so is the chart's edition, so the tiles still draw.
 */

// A recorded route's course is asked for as soon as the route goes in
// (PlanWorkspace's setRoute), and a test that has what it came for can
// end with its live half still on the way: it is let go, not failed on.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("a stop added in the panel lands the route there: the capsule, the nav log and a fuel check for each flight", async ({ page }) => {
  await recordedStops(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await typeRoute(page);

  // The destination pill's Insert Before asks the one search for the stop
  // (the one card rule, 2026-11-10), the airports that answer offered under it.
  await sideDrawer(page).getByTestId("route-dest").click();
  await page.getByTestId("pill-menu-add-before").click();
  await page.getByTestId("search-airports").fill("KMSN");
  await page.getByTestId("airport-result").filter({ hasText: "KMSN" }).first().click();
  await expect(page).toHaveURL(stopsAre("KMSN"));
  const stop = sideDrawer(page).getByTestId("stop");
  await expect(stop).toHaveCount(1);
  await expect(stop).toContainText("KMSN");
  // The nav log lands at it, at the field's elevation, and the fuel is
  // checked flight by flight.
  await openNavLog(page);
  const landing = navLogSheet(page).locator('[role="row"][data-kind]', { hasText: "KMSN" });
  await expect(landing).toBeVisible({ timeout: slow(30000) });
  await closeNavLog(page);
  // And FPL's route, the box turned back to its timeline, lists it as a
  // step of its own, with its procedures.
  await foldRoute(page);
  // Landed at and left again, each with its own runway (the owner's
  // "arrival first with a runway and a separate departure with a runway").
  const arrive = sideDrawer(page).getByTestId("procedures").getByRole("region", { name: "KMSN · Arrive" });
  // A stop's line is one region, named for its landing; its takeoff a section of its own under it.
  const leave = sideDrawer(page).getByTestId("procedures").getByRole("region", { name: "KMSN takeoff", exact: true });
  await expect(arrive).toBeVisible();
  await expect(leave).toBeVisible();
  // Its takeoff runway a pill of its own on Takeoff's line, its runways in
  // its menu (RunwayPill, 2026-11-25).
  const takeoff = leave.getByTestId("runway-pill");
  await expect(takeoff).toHaveAccessibleName(/^RWY\b.*, KMSN takeoff runway, /);
  // The runway into the wind may be picked for the pilot as the wind comes
  // in (ProceduresRoute's intoWind): another picked until the address
  // keeps it.
  await expect(async () => {
    // Under the half sheet's edge, below FPL's pinned figures, the card
    // pulled up to it first, as a finger does: at half its body does not
    // scroll (rules.md's "Grow, then scroll").
    await inSheet(page, takeoff);
    await takeoff.click({ timeout: 2000 });
    const other = otherRunway(page);
    const name = await runwayOf(other);
    await other.click({ timeout: 2000 });
    await expect(page).toHaveURL(new RegExp(`[?&]takeoff=[^&]*KMSN(%3A|:)${name}(%2C|,|&|$)`), { timeout: 2000 });
  }).toPass({ timeout: slow(20000) });
  // The figures to the next landing, KMSN, its time that flight's; a tap on To, the destination and the whole route's distance.
  await expect(sheetFoot(page).getByTestId("navlog-to")).toHaveText("KMSN", { timeout: slow(30000) });
  await expect(sheetFoot(page).getByTestId("navlog-ete")).toHaveText(/^(\d+h( \d+m)?|\d+m)$/);
  await expect(sheetFoot(page).getByTestId("to-toggle")).toHaveAccessibleName(/^Leg, /);
  await sheetFoot(page).getByTestId("to-toggle").click();
  await expect(sheetFoot(page).getByTestId("navlog-to")).toHaveText("KDLH");
  await expect(sheetFoot(page).getByTestId("to-toggle")).toHaveAccessibleName(/^Dest, /);
  await sheetFoot(page).getByTestId("to-toggle").click();

  // At half (a phone's pill is one row), the figures: the distance among them.
  await grabberTo(page, "half");
  await expect(sheetFoot(page).getByTestId("flight-line")).toContainText(/\d+/);

  // Taken off again from its menu, a tap on its pill (RoutePill): the
  // route as it was, opened again to edit (at half it folds).
  await openPanel(page);
  await typeRoute(page);
  // The route's field, still open from the stop's adding at half, runs
  // on past the sheet's edge there: the sheet raised to its pill.
  await inSheet(page, stop);
  await stop.click();
  await page.getByRole("menuitem", { name: "Remove", exact: true }).click();
  await expect(page).not.toHaveURL(/[?&]stops=/);
  await expect(sideDrawer(page).getByTestId("stop")).toHaveCount(0);
});

test("the route's box reads its points in order with no arrows, a pill's tap its menu, what is typed after the last the new destination with the old a stop; any point comes out from its menu or Delete", async ({
  page,
}) => {
  await page.route(
    (url) => /\/(checkpoints|navlog|briefing)$/.test(url.pathname),
    (route) => route.abort(),
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH&stops=KRYV,KMSN");
  await settle(page);
  await openPanel(page);
  await typeRoute(page);
  const lines = sideDrawer(page).getByTestId("route-slide");
  // In that order, each a token of the route's field, no arrow between
  // them and no cross on any pill (ForeFlight's, the owner, 2026-11-23).
  const order = await lines.evaluate((el) =>
    [...el.querySelectorAll("[data-point], [data-testid=route-type], [data-testid=route-arrow]")].map(
      (n) => n.getAttribute("data-testid") ?? "",
    ),
  );
  expect(order).toEqual(["route-type", "route-dep", "stop", "stop", "route-dest"]);
  expect(await lines.getByRole("button", { name: /^Remove/ }).count()).toBe(0);

  // What is typed after the last point is the new destination, the old
  // one a stop on the way.
  const field = sideDrawer(page).getByTestId("route-type");
  await field.fill("KMSP");
  await field.press("Enter");
  await expect(page).toHaveURL(/[?&]dest=KMSP(&|$)/);
  await expect(page).toHaveURL(stopsAre("KRYV,KMSN,KDLH"));
  // Taken back out: the route as it was but for the new destination.
  await lines.getByRole("button", { name: "Stop 3 KDLH" }).focus();
  await page.keyboard.press("Delete");
  await expect(page).toHaveURL(stopsAre("KRYV,KMSN"));

  // A tap on a pill: its menu, Remove last (its Undo the plan's toast).
  await lines.getByRole("button", { name: "Stop 2 KMSN" }).click();
  await page.getByRole("menuitem", { name: "Remove", exact: true }).click();
  await expect(page).toHaveURL(stopsAre("KRYV"));

  // The departure taken out from its menu: the next airport along is the
  // departure.
  await lines.getByRole("button", { name: "Departure C81" }).click();
  await page.getByRole("menuitem", { name: "Remove", exact: true }).click();
  await expect(page).toHaveURL(/[?&]dep=KRYV(&|$)/);
  await expect(page).not.toHaveURL(/[?&]stops=/);

  // Of two, Delete on the destination: half a route, the departure kept,
  // the destination still to be typed.
  await lines.getByRole("button", { name: "Destination KMSP" }).focus();
  await page.keyboard.press("Delete");
  await expect(page).not.toHaveURL(/[?&]dest=/);
  await expect(page).toHaveURL(/[?&]dep=KRYV(&|$)/);
  // No word in the field, the owner's (2026-11-23): a reader is told it takes the destination.
  await expect(sideDrawer(page).getByTestId("route-type")).toHaveAccessibleName("The destination");
  // And the last: no route, the empty route's card to start another, its
  // field folded behind the box's toggle at the Destination's end.
  await lines.getByRole("button", { name: "Departure KRYV" }).focus();
  await page.keyboard.press("Delete");
  await expect(page).not.toHaveURL(/[?&]dep=/);
  await showTabs(page);
  await expect(sideDrawer(page).getByTestId("route-type-open")).toBeVisible();
});

// The route cleared, its box asks for the route, at the pilot's ask: the
// first airport typed is the departure, and then it asks for the
// destination.
test("a cleared route's box takes the departure first, then asks for the destination", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await typeRoute(page);
  // No arrow and no "Destination" word after the last point, the field
  // taken or not (the owner, 2026-11-23; the r6 audit's L1): what is typed
  // there is the new destination all the same.
  await expect(sideDrawer(page).getByTestId("route-arrow-on")).toHaveCount(0);
  const typeHere = sideDrawer(page).getByTestId("route-type");
  const fieldBox = (await typeHere.boundingBox())!;
  await typeHere.click({ position: { x: fieldBox.width - 8, y: fieldBox.height / 2 } });
  await expect(sideDrawer(page).getByTestId("route-arrow-on")).toHaveCount(0);
  await expect(sideDrawer(page).getByTestId("route-slide")).not.toContainText("Destination");
  await clearTheRoute(page);
  await expect(page).not.toHaveURL(/[?&]dep=/);
  await sideDrawer(page).getByTestId("route-type-open").click();
  const field = sideDrawer(page).getByTestId("route-type");
  await expect(field).toHaveAttribute("data-placeholder", "Route");
  await field.fill("KMSN");
  await field.press("Enter");
  await expect(page).toHaveURL(/[?&]dep=KMSN(&|$)/);
  await expect(page).not.toHaveURL(/[?&]dest=/);
  await expect(field).toHaveAccessibleName("The destination");
});

// Typed a key at a time, as a phone's keyboard sends it, the suggestions
// change under every key and cmdk kept none highlighted, so Return did
// nothing (the FPL audit's A1, 2026-11-08): fill's one change hid it.
test("Return after an ident typed key by key takes the first suggestion", async ({ page }) => {
  await page.goto("/app/plan");
  await settle(page);
  await emptyPlan(page);
  const field = sideDrawer(page).getByTestId("route-type");
  await field.click();
  await field.pressSequentially("KUGN", { delay: 120 });
  await expect(page.getByTestId("route-suggestions").getByRole("option").first()).toBeVisible({ timeout: slow(10_000) });
  await field.press("Enter");
  await expect(page).toHaveURL(/[?&]dep=KUGN(&|$)/);
  await expect(field).toHaveAttribute("data-typed", "");
});

test("a link with a stop opens on the route through it", { tag: "@smoke" }, async ({ page }) => {
  await recordedStops(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH&stops=KMSN");
  await openPanel(page);
  await typeRoute(page);
  await expect(sideDrawer(page).getByRole("button", { name: "Stop 1 KMSN" })).toBeVisible({ timeout: slow(15000) });
  // Its airport on the map, as the route's two ends are.
  await expect.poll(markWith(page, "route-marks", "KMSN"), { timeout: slow(15000) }).not.toBeNull();
});

test("a stop is left again at the time picked on its Depart step, 30 minutes after it lands until one is", async ({ page }) => {
  // The owner's picks (2026-10-20): times after a stop had left out the
  // time on the ground; and "we should not say 30 min on the ground
  // instead just make the departure time selectable like now is for the
  // first departure". Leaving at nine, two days out, so no time crosses
  // midnight.
  await recordedStops(page);
  const when = new Date();
  when.setDate(when.getDate() + 2);
  when.setHours(9, 0, 0, 0);
  await page.goto(`/app/plan?dep=C81&dest=KDLH&stops=KMSN&depart=${encodeURIComponent(when.toISOString())}`);
  await openPanel(page);
  await openRoute(page);
  const leaves = sideDrawer(page).getByTestId("depart-date-KMSN");
  await expect(leaves).toBeVisible({ timeout: slow(30_000) });
  await expect(sideDrawer(page).getByTestId("ground-menu")).toHaveCount(0);
  // The time it leaves, in minutes; none while the nav log is being worked
  // out again after an edit (the row is drawn then without its time), so a
  // poll waits for it rather than failing on the gap.
  const at = async () => {
    const time = (await leaves.innerText()).match(/(\d\d):(\d\d)/);
    return time ? Number(time[1]) * 60 + Number(time[2]) : null;
  };
  const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  await expect.poll(at).not.toBeNull();
  const planned = (await at())!;
  // A quarter of an hour later: 45 minutes on the ground in the address.
  await inSheet(page, leaves);
  await leaves.click();
  await expect(page.getByTestId("depart-clear")).toHaveCount(0);
  await fillTime(await departTime(page), hhmm(planned + 15));
  await page.getByTestId("depart-done").click();
  await expect(page).toHaveURL(/ground=KMSN%3A45|ground=KMSN:45/);
  await expect.poll(at).toBe(planned + 15);
  // Back to 30 minutes after it lands, the default: the address says
  // nothing of it.
  await leaves.click();
  await fillTime(await departTime(page), hhmm(planned));
  await page.getByTestId("depart-done").click();
  await expect(page).not.toHaveURL(/ground=/);
  // Before it lands: brought to the landing, and said so where it was
  // picked (the audit's finding: it snapped back silently).
  await leaves.click();
  await fillTime(await departTime(page), hhmm(planned - 60));
  await expect(page.getByTestId("depart-range")).toContainText("From landing");
  await page.getByTestId("depart-done").click();
  await expect(page).toHaveURL(/ground=KMSN%3A0|ground=KMSN:0/);
});
