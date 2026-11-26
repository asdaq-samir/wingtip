import { test, expect } from "@playwright/test";
import { openTab, settle, slow, openRoute } from "./helpers";
import { pickAirplane } from "./startState";
import { circuitsOf, openRunways, otherRunway, runwayOf, runwayOptions } from "./procedureStubs";

test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

test("a field's traffic pattern is picked by its runway, kept in the address and drawn on the map", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openTab(page, "Nav Log");
  await openRoute(page);
  const procedures = page.getByTestId("procedures");
  // The route's fields in the order they are flown, each its runways as
  // chips under its arrival and approach.
  await expect(procedures.getByRole("heading").first()).toHaveText("C81");
  const destination = procedures.getByRole("region", { name: "KDLH · Arrive" });
  await openRunways(destination);
  const runway = otherRunway(page);
  const name = await runwayOf(runway);
  await runway.click();
  // The pill says the runway picked.
  const pill = destination.getByTestId("runway-pill");
  await expect(pill).toHaveAccessibleName(new RegExp(`^RWY ${name}\\b`));
  await expect(page).toHaveURL(new RegExp(`[?&]pattern=[^&]*KDLH(%3A|:)${name}(%2C|,|&|$)`));
  await expect.poll(circuitsOf(page), { timeout: slow(10000) }).toContain("pattern-at-KDLH");

  // No None: every landing is on a runway (the owner's "Why is none even an
  // option?"), and the one picked picked again keeps it.
  await openRunways(destination);
  await expect(page.getByRole("menuitemradio", { name: /None/ })).toHaveCount(0);
  await page.getByRole("menuitemradio", { name: new RegExp(`^Runway ${name}\\b`) }).click();
  await expect(page).toHaveURL(new RegExp(`[?&]pattern=[^&]*KDLH(%3A|:)${name}(%2C|,|&|$)`));
});

test(
  "the field left from is drawn off its runway and out of the pattern, not round it, and both runways are sent to the planner",
  { tag: "@smoke" },
  async ({ page }) => {
    // The owner, 2026-10-27: "why is c81 also drawing a visual pattern?" and
    // "is it not flying that and landing?".
    const asked: URL[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/navlog?")) asked.push(new URL(r.url()));
    });
    await page.goto("/app/plan?dep=C81&dest=KDLH&pattern=C81%3A24%2CKDLH%3A27&auto=-");
    await settle(page);
    await expect.poll(circuitsOf(page), { timeout: slow(20000) }).toEqual(["departure-at-C81", "pattern-at-KDLH"]);
    await expect
      .poll(() => asked.some((u) => u.searchParams.get("runways") === "C81:24" && u.searchParams.get("patterns") === "KDLH:27"), {
        timeout: slow(20000),
      })
      .toBe(true);
  },
);

/**
 * The field the route lands at has its runway into the wind picked as the
 * route comes in, at the owner's ask ("a preselected runway into the
 * wind"), and no approach; a runway the pilot picks over it is kept, not
 * picked over again. An older address's "NONE" (the None chip, gone) is no
 * pick, so the wind's is made there. Flown three hours from now, by the
 * forecast's wind, stubbed an easterly: Duluth's 9.
 */
test("the destination's runway into the wind is picked as the route comes in, and a pilot's own is kept", async ({ page }) => {
  await page.route(
    (url) => /\/airport\/[^/]+\/forecast-wind$/.test(url.pathname),
    (route) =>
      route.fulfill({
        json: { ident: "KDLH", distance_nm: 0, dir_true_deg: 90, speed_kt: 14, gust_kt: null, valid_from: 0, valid_to: 4_000_000_000 },
      }),
  );
  const depart = encodeURIComponent(new Date(Date.now() + 3 * 60 * 60_000).toISOString());
  await page.goto(`/app/plan?dep=C81&dest=KDLH&depart=${depart}&pattern=KDLH:NONE`);
  await settle(page);
  await openTab(page, "Nav Log");
  await openRoute(page);
  const kdlh = page.getByTestId("procedures").getByRole("region", { name: "KDLH · Arrive" });
  await expect(kdlh.getByTestId("runway-pill")).toHaveAccessibleName(/^RWY 9, into the wind/, { timeout: slow(60_000) });
  await expect(page).not.toHaveURL(/NONE/);
  await expect(page).not.toHaveURL(/[?&]procs=/);
  await openRunways(kdlh);
  const other = otherRunway(page);
  const name = await runwayOf(other);
  await other.click();
  await expect(page).toHaveURL(new RegExp(`[?&]pattern=[^&]*KDLH(%3A|:)${name}(%2C|,|&|$)`));
  await page.goto(page.url());
  await settle(page);
  await openTab(page, "Nav Log");
  await openRoute(page);
  await expect(kdlh.getByTestId("runway-pill")).toHaveAccessibleName(new RegExp(`^RWY ${name}\\b`), { timeout: slow(20000) });
});

/**
 * A field typed by its FAA identifier is named by its ICAO code once its
 * card is in, at the owner's ask ("K is not showing in front of ORD"),
 * the pick made under the old name kept; its arrivals are offered by the
 * d-TPP's own code for a STAR ("STR"); and its many runways in its
 * runway pill's menu.
 */
test("a field typed as ORD is KORD, its arrivals offered and its runways in its menu", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=ORD&pattern=ORD:9L&auto=-");
  await expect(page).toHaveURL(/[?&]dest=KORD(&|$)/, { timeout: slow(20000) });
  await expect(page).toHaveURL(/[?&]pattern=[^&]*KORD(%3A|:)9L(%2C|,|&|$)/);
  await settle(page);
  await openTab(page, "Nav Log");
  await openRoute(page);
  const kord = page.getByTestId("procedures").getByRole("region", { name: "KORD · Arrive" });
  await expect(kord.locator("[data-testid=procedure-kind][data-kind=arrival]")).toBeVisible({ timeout: slow(20000) });
  // 9L picked on its pill; its menu every runway, 9L checked.
  await expect(kord.getByTestId("runway-pill")).toHaveAccessibleName(/: Runway 9L\b/, { timeout: slow(20000) });
  await openRunways(kord);
  expect(await runwayOptions(page).count()).toBeGreaterThan(5);
  await expect(page.getByRole("menuitemradio", { name: /^Runway 9L\b/ })).toHaveAttribute("aria-checked", "true");
});

/**
 * A departure's pull-down sits over its field's runway chips, as an
 * arrival's and approach's do, at the owner's ask ("Departure selection
 * should also be before runways just like arrival/approach").
 */
test("a field's departure is picked after its runways, as its arrival and approach are", async ({ page }) => {
  await page.goto("/app/plan?dep=KORD&dest=C81");
  await settle(page);
  await openTab(page, "Nav Log");
  await openRoute(page);
  const kord = page.getByTestId("procedures").getByRole("region", { name: "KORD · Depart" });
  const menu = kord.locator("[data-testid=procedure-kind][data-kind=departure]");
  await expect(menu).toBeVisible({ timeout: slow(20000) });
  // None picked: a "+ DEP" after the runways, at the owner's
  // pick ("Can the selection for procedures be after runways so when
  // selected can expand", option C).
  await expect(menu).toHaveText(/^\+ DEP/);
  await expect(menu).toHaveAttribute("data-look", "slim");
  const chips = kord.getByTestId("runway-pill");
  await expect(chips).toBeVisible();
  // On Takeoff's line after its runway's pill (the owner, 2026-11-25:
  // "landing or takeoff should have pills in front of the title").
  await expect
    .poll(async () => {
      const [m, c] = [await menu.boundingBox(), await chips.boundingBox()];
      if (!m || !c) return false;
      return m.x > c.x + c.width - 1 && Math.abs(m.y + m.height / 2 - (c.y + c.height / 2)) < 8;
    })
    .toBe(true);
  // And the departure's time on its own step, not in the route's box: "Now"
  // in sight, its label before it for a screen reader alone (DepartPicker,
  // WCAG 2.5.3's Label in Name).
  await expect(kord.getByTestId("depart-date")).toHaveText(/^Departure, Now/);
});

/**
 * A route from where the airplane is (Fly Here's "@lat,lon") lists its
 * destination as where it arrives, not a departure (the owner's screenshot:
 * KSTL with a "Depart" pull-down and its runways as a takeoff's).
 */
test("a route from the present position arrives at its destination", async ({ page }) => {
  await page.goto("/app/plan?dep=@42.2333,-87.9883&dest=KSTL");
  await settle(page);
  await openTab(page, "Nav Log");
  await openRoute(page);
  const route = page.getByTestId("procedures");
  await expect(route.getByRole("region", { name: "KSTL · Arrive" })).toBeVisible({ timeout: slow(30000) });
  await expect(route.getByRole("region", { name: "KSTL · Depart" })).toHaveCount(0);
});
