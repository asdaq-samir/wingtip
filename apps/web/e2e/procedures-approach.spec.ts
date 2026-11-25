import { test, expect } from "@playwright/test";
import { cardClose, drawn, openTab, settle, settled, sideDrawer, slow, openRoute, typeRoute } from "./helpers";
import { procedureRuns as runs } from "./marks";
import { pickAirplane } from "./startState";
import { circuitsOf, openRunways, LIST, DRAWN, ARRIVAL_DRAWN, unfoldProcedure } from "./procedureStubs";

test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

test("a field's approach is picked on its own page with its transition, drawn on the map as it is chosen, and added to the route with Add to Route, as ForeFlight picks one", async ({
  page,
}) => {
  const asked: string[] = [];
  await page.route(
    (url) => /\/airport\/[^/]+\/procedures/.test(url.pathname),
    (route) => {
      const url = new URL(route.request().url());
      asked.push(`${url.pathname}${url.search}`);
      if (url.pathname.endsWith("/KDLH/procedures")) return route.fulfill({ json: LIST });
      if (url.pathname.endsWith("/KDLH/procedures/I09"))
        return route.fulfill({ json: { ...DRAWN, transition: url.searchParams.get("transition") } });
      return route.fulfill({ json: { airport: "C81", cycle: "261001", procedures: [] } });
    },
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openTab(page, "Nav Log");
  await openRoute(page);
  const procedures = page.getByTestId("procedures");
  // C81 publishes no departure, so none is offered there; the tops of climb
  // and descent are the nav log's alone (the owner's cleanup: "no need to
  // have the toc and tod", "no need to take space for departures/arrivals
  // if it's not available").
  const c81 = procedures.getByRole("region", { name: "C81 · Depart" });
  await expect(c81.getByTestId("procedure-patterns")).toBeVisible({ timeout: slow(10000) });
  await expect(c81.getByTestId("procedure-kind")).toHaveCount(0);
  await expect(procedures.getByTestId("route-toc")).toHaveCount(0);
  await expect(procedures.getByTestId("route-tod")).toHaveCount(0);
  // The destination's approaches, a page of their own.
  const kdlh = procedures.getByRole("region", { name: "KDLH · Arrive" });
  // Its pull-down's foot: the field's whole list.
  await kdlh.locator("[data-testid=procedure-kind][data-kind=approach]").click();
  await page.getByTestId("procedure-menu-all").click();
  await expect(page.getByRole("heading", { name: "KDLH approaches" })).toBeVisible();
  // Its own page: drawn on the map from vectors as it opens, before it is
  // added -- the route's address untouched.
  await page.getByTestId("procedure-option").filter({ hasText: "ILS RWY 09" }).click();
  await expect(page.getByRole("heading", { name: "KDLH ILS RWY 09" })).toBeVisible();
  await expect.poll(() => asked, { timeout: slow(10000) }).toContain("/api/planner/airport/KDLH/procedures/I09");
  await expect.poll(() => runs(page, "line"), { timeout: slow(10000) }).toBeGreaterThan(0);
  await expect(page).not.toHaveURL(/[?&]procs=/);
  // Its fixes as they are flown, with the altitudes they are crossed at.
  const fixes = page.getByTestId("procedure-fixes");
  await expect(fixes).toContainText(/OFOFO\s*3,500 ft or above/);
  await expect(fixes).toContainText(/FAKER\s*2,700 ft/);
  // The close goes back, to the field's approaches: no Back (the owner's
  // "close button should behave as the back button").
  // (Its name on the bar's close, on a phone, is the bar's own.)
  const wide = page.viewportSize()!.width >= 660;
  if (wide) await expect(page.getByTestId("procedures-close")).toHaveAccessibleName("Back");
  await cardClose(page, "procedures-close").click();
  await expect(page.getByRole("heading", { name: "KDLH approaches" })).toBeVisible();
  if (wide) await expect(page.getByTestId("procedures-close")).toHaveAccessibleName("Close");
  await page.getByTestId("procedure-option").filter({ hasText: "ILS RWY 09" }).click();
  // By DLH, drawn as it is chosen.
  await page.getByTestId("procedure-transition").filter({ hasText: "DLH" }).click();
  await expect.poll(() => asked, { timeout: slow(10000) }).toContain("/api/planner/airport/KDLH/procedures/I09?transition=DLH");
  await expect(page).not.toHaveURL(/[?&]procs=/);
  // Add to Route: loaded in the address ("L", the owner's load-then-activate,
  // 2026-11-22), and the sheet put away.
  await page.getByTestId("procedure-add").click();
  await expect(page).toHaveURL(/[?&]procs=KDLH(%3A|:)I09(%3A|:)DLH(%3A|:){2}L(&|$)/);
  await expect(page.getByRole("heading", { name: "KDLH ILS RWY 09" })).toBeHidden();

  // On the map: the transition and the final, the missed approach dashed,
  // its hold, and the fixes with their altitudes.
  await expect.poll(() => runs(page, "line"), { timeout: slow(10000) }).toBe(2);
  await expect.poll(() => runs(page, "missed")).toBe(1);
  await expect.poll(() => runs(page, "hold")).toBe(1);
  await expect.poll(async () => (await drawn(page, "procedure-fixes")).length).toBe(3);
  // Said in the route's box after the destination's pill, and a tap there
  // opens the Procedures. The box's pills are its field's (typeRoute), not
  // the timeline's.
  await typeRoute(page);
  const chip = sideDrawer(page).getByTestId("route-procedure");
  await expect(chip).toHaveText("ILS 09 · DLH");
  // Before the destination's pill, as it is flown into the field.
  const dest = sideDrawer(page).getByTestId("route-dest");
  expect((await chip.boundingBox())!.x).toBeLessThan((await dest.boundingBox())!.x);
  await expect(chip).toHaveAccessibleName(/ILS RWY 09, from DLH/);
  await chip.click();
  await expect(page.getByRole("heading", { name: "KDLH approaches" })).toBeVisible();
  await page.keyboard.press("Escape");
  // Gone, and the panel at rest, before it is dragged: a drag on the
  // sheet's way out was its own.
  await expect(page.getByRole("heading", { name: "KDLH approaches" })).toHaveCount(0);
  await settled(sideDrawer(page));

  // Checked in the list, and on its page Remove from Route takes it off
  // the address, and off the map once the sheet is put away.
  await openTab(page, "Nav Log");
  await openRoute(page);
  // Loaded: its box off the route's line, its pill on Landing's runway row the button to pick another (2026-11-25).
  await unfoldProcedure(kdlh, "approach");
  await expect(kdlh.getByTestId("approach-loaded")).toContainText("ILS RWY 09");
  await kdlh.locator("[data-testid=timeline-chips] [data-testid=procedure-kind][data-kind=approach]").click();
  await page.getByTestId("procedure-menu-all").click();
  const ils = page.getByTestId("procedure-option").filter({ hasText: "ILS RWY 09" });
  await expect(ils).toContainText("In the route, from DLH");
  await ils.click();
  await page.getByTestId("procedure-remove").click();
  await expect(page).not.toHaveURL(/[?&]procs=/);
  await expect(page.getByTestId("procedure-add")).toBeVisible();
  // Put away by its own close.
  await cardClose(page, "procedures-close").click();
  await expect(page.getByTestId("procedure-add")).toHaveCount(0);
  await expect.poll(() => runs(page)).toBe(0);
});

/**
 * An approach and the field's runway kept in step, at the owner's ask
 * ("only certain scenarios can allow picking another runway such as ILS
 * circling"): the approach added puts the runway chip on its own runway,
 * landed straight in; another is let only where the plate publishes
 * circling minimums, a circle to land; and no pattern is drawn then.
 */
test("an approach puts its field's runway on its own, and another is let only where its plate publishes circling minimums", async ({
  page,
}) => {
  let circling = false;
  await page.route(
    (url) => /\/airport\/[^/]+\/procedures/.test(url.pathname),
    (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/KDLH/procedures")) return route.fulfill({ json: LIST });
      if (url.pathname.endsWith("/KDLH/procedures/I09/plate")) {
        // Off the map's way: placed far from the route, as the test reads only its circling.
        return route.fulfill({
          json: { cycle: "2610", name: "ILS OR LOC RWY 09", south: 0, west: 0, north: 0.1, east: 0.1, fixes: [], circling },
        });
      }
      if (url.pathname.endsWith("/KDLH/procedures/I09"))
        return route.fulfill({ json: { ...DRAWN, transition: url.searchParams.get("transition") } });
      if (url.pathname.endsWith("/KDLH/procedures/SKETC1")) return route.fulfill({ json: ARRIVAL_DRAWN });
      return route.fulfill({ json: { airport: "C81", cycle: "261001", procedures: [] } });
    },
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH&pattern=KDLH:27&auto=-");
  await settle(page);
  await openTab(page, "Nav Log");
  await openRoute(page);
  const procedures = page.getByTestId("procedures");
  const kdlh = procedures.getByRole("region", { name: "KDLH · Arrive" });
  await expect(kdlh.getByRole("button", { name: /^Runway 27/ })).toHaveAttribute("aria-pressed", "true", { timeout: slow(20000) });
  await expect.poll(circuitsOf(page), { timeout: slow(10000) }).toContain("pattern-at-KDLH");
  // The ILS to 9 added from its pull-down, from DLH: the runway is 9,
  // landed straight in, and no pattern drawn.
  await kdlh.locator("[data-testid=procedure-kind][data-kind=approach]").click();
  const menu = page.getByTestId("procedure-menu");
  await expect(menu.getByText("Runway 9", { exact: false })).toBeVisible({ timeout: slow(10000) });
  await menu.getByTestId("procedure-menu-item").filter({ hasText: "ILS" }).click();
  // Its transitions in the menu's own place, on the screen: side by side,
  // a phone's ran off its edge (the owner's screenshot).
  if (page.viewportSize()!.width >= 660) await expect(menu.getByTestId("procedure-menu-close")).toHaveAccessibleName("Back");
  const placed = (await menu.boundingBox())!;
  expect(placed.x + placed.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.getByTestId("procedure-menu-transition").filter({ hasText: "From DLH" }).click();
  await expect(page).toHaveURL(/[?&]procs=KDLH(%3A|:)I09(%3A|:)DLH(%3A|:){2}L(&|$)/);
  await expect(page).toHaveURL(/[?&]pattern=[^&]*KDLH(%3A|:)9(%2C|,|&|$)/);
  await settled(sideDrawer(page));
  await openTab(page, "Nav Log");
  await openRoute(page);
  // Loaded, then activated onto the route's line, landed by it.
  await unfoldProcedure(kdlh, "approach");
  await kdlh.getByTestId("approach-activate").click();
  await expect(page).toHaveURL(/[?&]procs=KDLH(%3A|:)I09(%3A|:)DLH(&|$)/);
  await expect(kdlh.getByRole("button", { name: /^Runway 9\b/ })).toHaveAttribute("aria-pressed", "true");
  await unfoldProcedure(kdlh, "approach");
  await expect(kdlh.locator("[data-testid=procedure-rows][data-kind=approach]")).toContainText("ILS RWY 09");
  // The field's arrival, a pull-down beside it once the list is in.
  await kdlh.locator("[data-testid=procedure-kind][data-kind=arrival]").click();
  await page.getByTestId("procedure-menu").getByTestId("procedure-menu-item").filter({ hasText: "SKETC1" }).click();
  await expect(page).toHaveURL(/[?&]procs=[^&]*KDLH(%3A|:)SKETC1/);
  await settled(sideDrawer(page));
  await openTab(page, "Nav Log");
  await openRoute(page);
  // The plate switched off from the approach's pull-down, and on again:
  // its pill on Landing's runway row, the button to pick another.
  await unfoldProcedure(kdlh, "approach");
  await kdlh.locator("[data-testid=timeline-chips] [data-testid=procedure-kind][data-kind=approach]").click();
  // The one picked is the stock listbox's selected option, as a reader
  // hears it; the arrow keys move between the choices without picking.
  const ils = page.getByTestId("procedure-menu").getByRole("option", { name: /^ILS/ }).first();
  await expect(ils).toHaveAttribute("aria-selected", "true");
  await ils.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("procedure-menu")).toBeVisible();
  await expect(page).toHaveURL(/KDLH(%3A|:)I09(%3A|:)DLH/);
  const plate = page.getByTestId("procedure-menu-plate");
  await expect(plate).toHaveAttribute("aria-checked", "true");
  await plate.click();
  await expect(plate).toHaveAttribute("aria-checked", "false");
  await plate.click();
  await expect(plate).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  // Said in the runway's chip's name, the info button gone (the owner's
  // "No need for info button").
  await expect(kdlh.getByRole("button", { name: /Straight in/ })).toBeVisible();
  await expect.poll(circuitsOf(page)).not.toContain("pattern-at-KDLH");
  // Its plate has no circling line: no other runway. By its number: the
  // live wind may name 27 into it first.
  await openRunways(kdlh);
  await expect(kdlh.getByRole("button", { name: /^Runway 27\b.*, no circling on the ILS 09/ })).toBeDisabled();

  // One that publishes circling minimums: 27 is a circle to land.
  circling = true;
  await page.goto(page.url());
  await settle(page);
  await openTab(page, "Nav Log");
  await openRoute(page);
  await expect(kdlh.getByTestId("procedure-pattern").first()).toBeVisible({ timeout: slow(20000) });
  await openRunways(kdlh);
  const circle = kdlh.getByRole("button", { name: /^Runway 27/ });
  await expect(circle).toBeEnabled({ timeout: slow(20000) });
  await circle.click();
  await expect(page).toHaveURL(/[?&]pattern=[^&]*KDLH(%3A|:)27(%2C|,|&|$)/);
  await expect(kdlh.getByRole("button", { name: /Circle to land/ })).toBeVisible();
  await expect.poll(circuitsOf(page)).not.toContain("pattern-at-KDLH");
});
