import { test, expect } from "@playwright/test";
import { openTab, settle, slow, openRoute } from "./helpers";
import { pickAirplane } from "./startState";
import { circuitsOf, openRunways } from "./procedureStubs";

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
  await expect(destination.getByTestId("procedure-pattern").first()).toBeVisible({ timeout: slow(20000) });
  await openRunways(destination);
  const runway = destination
    .getByRole("button", { name: /^Runway / })
    .and(page.locator(':not([disabled]):not([aria-pressed="true"])'))
    .first();
  const name = (await runway.innerText()).trim();
  await runway.click();
  // The line folded to the runway picked.
  const folded = destination.locator("[data-folded]");
  await expect(folded).toHaveText(name);
  await expect(folded).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(new RegExp(`[?&]pattern=[^&]*KDLH(%3A|:)${name}(%2C|,|&|$)`));
  await expect.poll(circuitsOf(page), { timeout: slow(10000) }).toContain("pattern-at-KDLH");

  // No None: every landing is on a runway (the owner's "Why is none even an
  // option?"), and the chip picked tapped again keeps it.
  await openRunways(destination);
  await expect(destination.getByRole("button", { name: /None/ })).toHaveCount(0);
  await destination.getByRole("button", { name: new RegExp(`^Runway ${name}\\b`) }).click();
  await expect(page).toHaveURL(new RegExp(`[?&]pattern=[^&]*KDLH(%3A|:)${name}(%2C|,|&|$)`));
});

test("a runway line opened stays open until folded, and folds with its field", async ({ page }) => {
  // The owner, 2026-10-28: "Keep the routes and runway opened until
  // folded … for runways also fold them when the whole airport is
  // collapsed". It folded after two seconds untouched.
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openTab(page, "Nav Log");
  await openRoute(page);
  const procedures = page.getByTestId("procedures");
  const destination = procedures.getByRole("region", { name: "KDLH · Arrive" });
  // A runway picked first, the pilot's own, which a pick into the wind
  // landing late leaves be: then opened from its fold, and left alone.
  await openRunways(destination);
  await destination
    .getByRole("button", { name: /^Runway / })
    .and(page.locator(':not([disabled]):not([aria-pressed="true"])'))
    .first()
    .click();
  await destination.locator("[data-folded]").click();
  await page.waitForTimeout(3000);
  await expect(destination.locator("[data-folded]")).toHaveCount(0);
  await expect(destination.getByRole("button", { name: /^Runway / }).nth(1)).toBeVisible();
  // The field folded and opened again: its runways folded to the one picked.
  const toggle = procedures.locator('[data-testid="field-toggle"][data-ident="KDLH"]');
  await toggle.click();
  await toggle.click();
  await expect(destination.locator("[data-folded]")).toHaveCount(1);
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
  await expect(kdlh.getByTestId("procedure-pattern").first()).toBeVisible({ timeout: slow(20000) });
  await expect(kdlh.getByRole("button", { name: /^Runway 9, into the wind/ })).toHaveAttribute("aria-pressed", "true", {
    timeout: slow(60_000),
  });
  await expect(page).not.toHaveURL(/NONE/);
  await expect(page).not.toHaveURL(/[?&]procs=/);
  await openRunways(kdlh);
  const other = kdlh
    .getByRole("button", { name: /^Runway / })
    .and(page.locator(':not([disabled]):not([aria-pressed="true"])'))
    .first();
  const name = (await other.innerText()).trim();
  await other.click();
  await expect(page).toHaveURL(new RegExp(`[?&]pattern=[^&]*KDLH(%3A|:)${name}(%2C|,|&|$)`));
  await page.goto(page.url());
  await settle(page);
  await openTab(page, "Nav Log");
  await openRoute(page);
  await expect(kdlh.locator("[data-folded]")).toHaveText(name, { timeout: slow(20000) });
});

/**
 * A field typed by its FAA identifier is named by its ICAO code once its
 * card is in, at the owner's ask ("K is not showing in front of ORD"),
 * the pick made under the old name kept; its arrivals are offered by the
 * d-TPP's own code for a STAR ("STR"); and its many runways stay one line,
 * scrolled sideways.
 */
test("a field typed as ORD is KORD, its arrivals offered and its runways one line", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=ORD&pattern=ORD:9L&auto=-");
  await expect(page).toHaveURL(/[?&]dest=KORD(&|$)/, { timeout: slow(20000) });
  await expect(page).toHaveURL(/[?&]pattern=[^&]*KORD(%3A|:)9L(%2C|,|&|$)/);
  await settle(page);
  await openTab(page, "Nav Log");
  await openRoute(page);
  const kord = page.getByTestId("procedures").getByRole("region", { name: "KORD · Arrive" });
  await expect(kord.locator("[data-testid=procedure-kind][data-kind=arrival]")).toBeVisible({ timeout: slow(20000) });
  const chips = kord.getByTestId("procedure-pattern");
  await expect(chips.first()).toBeVisible({ timeout: slow(20000) });
  // Folded to 9L, picked; opened, every runway on one line.
  await expect(chips).toHaveCount(1);
  await expect(chips.first()).toHaveText("9L");
  await openRunways(kord);
  const tops = await chips.evaluateAll((all) => all.map((c) => Math.round(c.getBoundingClientRect().top)));
  expect(tops.length).toBeGreaterThan(5);
  expect(new Set(tops).size).toBe(1);
  // The runway picked scrolled into sight, in the line's middle where it
  // can be, its neighbours either side (the owner's ask), or as near as
  // the line's end lets it.
  const nineLeft = kord.getByRole("button", { name: /^Runway 9L/ });
  await expect(nineLeft).toBeInViewport();
  await expect
    .poll(() =>
      nineLeft.evaluate((chip) => {
        const line = chip.closest<HTMLElement>("[data-slides]")!;
        const box = line.getBoundingClientRect(),
          c = chip.getBoundingClientRect();
        const off = Math.abs(c.left + c.width / 2 - (box.left + box.width / 2));
        const atEnd = line.scrollLeft <= 0 || line.scrollLeft >= line.scrollWidth - line.clientWidth - 1;
        return off <= 2 || atEnd;
      }),
    )
    .toBe(true);
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
  // None picked: a dashed "+ Departure" after the runways, at the owner's
  // pick ("Can the selection for procedures be after runways so when
  // selected can expand", option C).
  await expect(menu).toHaveText(/^\+ Departure/);
  await expect(menu).toHaveAttribute("data-look", "add");
  const chips = kord.getByTestId("procedure-pattern").locator("visible=true").first();
  await expect(chips).toBeVisible();
  // On the runways' own line after them, at the owner's asks ("Can arrival
  // and approach pills be next to the runway when runway is collapsed?",
  // "Same with departure", "Approach doesn't need to go next line just let
  // it slide with runways"): beside the runway picked, or sliding with them.
  await expect
    .poll(async () => {
      const [m, c] = [await menu.boundingBox(), await chips.boundingBox()];
      if (!m || !c) return false;
      return m.x > c.x + c.width - 1 && Math.abs(m.y + m.height / 2 - (c.y + c.height / 2)) < 8;
    })
    .toBe(true);
  // And the departure's time on its own step, not in the route's box.
  await expect(kord.getByTestId("depart-date")).toHaveText(/^Now/);
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
