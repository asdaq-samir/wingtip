import { test, expect, type Page } from "@playwright/test";
import { inSheet, settle, slow } from "./helpers";
import { FAA } from "./faaRecord";

/**
 * An airplane's card opened when it is not heard now, as the owner's
 * iPhone showed N654FL on 2026-11-13: its registration and type from the
 * FAA's record, a long owner's name that never covers its label, its one
 * slide the card's width (its status, no photo or way flown to sketch),
 * and a row far down its record reachable. The planner is stubbed: adsb.lol's
 * sky and the registry are not the suite's.
 */

const PIPER = {
  ...FAA,
  n_number: "N654FL",
  mode_s_hex: "a89c1e",
  manufacturer: "Piper",
  model: "PA-28-140",
  make_short: "Piper",
  model_short: "PA-28",
  year: 1971,
  owner: "Roca Roja Y Caballo Gris De Idaho LLC",
  owner_type: "LLC",
  city: "Meridian",
  state: "ID",
};

/** The planner's answer for an airplane with no trace today: what it is
 *  named and its year from the registry (wingtip.traffic.flight). */
async function notHeard(page: Page) {
  await page.route(
    (url) => url.pathname === "/api/planner/traffic/flight/a89c1e",
    (route) =>
      route.fulfill({
        json: {
          hex: "a89c1e",
          faa: PIPER,
          registration: "N654FL",
          type: null,
          description: null,
          operator: null,
          year: 1971,
          departed: null,
          trail: [],
        },
      }),
  );
  // Its history's request failing: the card says so, not "No flights heard".
  await page.route(
    (url) => url.pathname.startsWith("/api/planner/traffic/flight/a89c1e/history"),
    (route) => route.fulfill({ status: 503, json: { detail: "down" } }),
  );
  await page.route(
    (url) => url.hostname === "api.planespotters.net",
    (route) => route.fulfill({ json: { photos: [] } }),
  );
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("an airplane not heard now has its registration and type from the FAA's record, its owner beside its label, its status slide as wide as the card and its record's rows reachable", async ({
  page,
}) => {
  // Every airplane's flights are offered, public (the owner, 2026-11-26).
  await notHeard(page);
  await page.goto("/app/plan?flight=a89c1e");
  await settle(page);
  // One card for it (the owner's design, 2026-11-26), its N-number's: not
  // heard, on its one page, where its registry is said once.
  const card = page.getByTestId("airplane-profile");
  await expect(card).toContainText("N654FL", { timeout: slow(15_000) });
  await expect(card.getByTestId("airplane-info-model")).toContainText("PA-28-140");

  // The owner's label and the long name never overlap, at the larger text the owner's iPhone uses too.
  for (const rootPx of ["16px", "19.65px"]) {
    await page.evaluate((px) => (document.documentElement.style.fontSize = px), rootPx);
    const label = card.getByTestId("airplane-info").getByText("Owner", { exact: true });
    // The row is the label and its value; the value is the name as the planner cased it, its LLC kept.
    const value = card.getByTestId("airplane-info-owner").getByText("Roca Roja Y Caballo Gris De Idaho LLC", { exact: true });
    await expect(value).toHaveText("Roca Roja Y Caballo Gris De Idaho LLC");
    const [a, b] = [await label.boundingBox(), await value.boundingBox()];
    const apart = a!.y + a!.height <= b!.y + 1 || a!.x + a!.width <= b!.x + 1;
    expect(apart, `label ${JSON.stringify(a)} and value ${JSON.stringify(b)} at ${rootPx}`).toBe(true);
  }
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));

  // No photo and nothing flown to sketch: Info's pictures row says so, in its place, as the
  // airport card's keeps its own (the owner's iPhone, 2026-11-27, N812HW's Info with no pictures).
  await expect(card.getByTestId("airplane-pictures").getByTestId("airplane-no-photos")).toHaveText("No photos");

  // Scrolled down to a row far down its record, it is in sight: the card pulled up
  // first, as a pilot does, since at half a card's body does not scroll
  // (it opens at half, rules.md's "Detents" and "Grow, then scroll").
  // Its identifiers are Info's with its record (the owner, 2026-11-26): its ICAO address the Airplane group's.
  // The Airplane group shows its first few rows; its title opens the rest.
  const more = card.getByTestId("airplane-info-airplane-more");
  await inSheet(page, more);
  await more.click();
  const last = card.getByTestId("airplane-info").getByText("ICAO Address", { exact: true });
  await inSheet(page, last);
  await expect(last).toBeInViewport();
});

test("a helicopter's card: its facts strip one row at the owner's larger text, its section a Helicopter's, its type the registry's, and No photos in its pictures' place", async ({
  page,
}) => {
  // N812HW as the owner's iPhone showed it (2026-11-27): "Airbus Helicopters" over "EC 130 T2" sent
  // Weight to a second row, "Category: Land" under "Airplane", and no pictures row at all.
  const ec130 = {
    ...FAA,
    n_number: "N812HW",
    mode_s_hex: "ab5c2e",
    manufacturer: "Airbus Helicopters",
    model: "EC 130 T2",
    make_short: "Airbus Helicopters",
    model_short: "EC 130 T2",
    year: 2014,
    aircraft_type: "Rotorcraft",
    engines: 1,
    seats: 8,
    engine: "Turbomeca Arriel 2D",
    engine_type: "Turbo-shaft",
    thrust_lb: null,
    owner: "TVPX Aircraft Solutions Inc Trustee",
    owner_type: "Co-owned",
  };
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/traffic/registered"),
    (route) => route.fulfill({ json: new URL(route.request().url()).searchParams.get("q") === "N812HW" ? ec130 : null }),
  );
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/traffic/find"),
    (route) => route.fulfill({ json: { aircraft: [], checked: true, source: "adsb.lol", license: "ODbL 1.0" } }),
  );
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/traffic"),
    (route) => route.fulfill({ json: { aircraft: [], age_s: 1, source: "adsb.lol", license: "ODbL 1.0" } }),
  );
  await page.route(
    (url) => url.pathname.startsWith("/api/planner/traffic/flight/"),
    (route) => route.fulfill({ status: 404, json: { detail: "Not known." } }),
  );
  await page.route(
    (url) => url.pathname === "/api/planner/airplanes/N812HW",
    (route) =>
      route.fulfill({
        json: {
          n_number: "N812HW",
          registration: { ...ec130, co_owner_names: [] },
          // ACFTREF: its Type Aircraft a rotorcraft's, its AC-CAT (land, sea or amphibian) land.
          model: { code: "1340510", aircraft_type: "Rotorcraft", category: "Land", seats: 8, engines: 1, weight_class: "Up to 12,499 lb" },
          past_registrations: [],
          ntsb: [],
          based: null,
          documents: [],
          reservation: null,
          sources: [],
          based_pending: false,
        },
      }),
  );
  await page.route(
    (url) => url.pathname === "/api/planner/airplanes/N812HW/photo",
    (route) => route.fulfill({ status: 404, json: { detail: "No photo." } }),
  );
  await page.goto("/app/plan?airplane=N812HW");
  await settle(page);
  const card = page.getByTestId("airplane-profile");
  const facts = card.getByTestId("airplane-facts");
  await expect(facts.getByTestId("airplane-facts-weight")).toHaveText("Weight≤12,499 lb", { timeout: slow(15_000) });
  // One row, never two and never a sideways scroll, at the owner's larger text sizes too.
  for (const rootPx of ["16px", "17.88px", "19.65px"]) {
    await page.evaluate((px) => (document.documentElement.style.fontSize = px), rootPx);
    const rows = await facts.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const kids = [...el.children].map((f) => f.getBoundingClientRect());
      return {
        tops: new Set(kids.map((k) => Math.round(k.top))).size,
        inside: kids.every((k) => k.right <= box.right + 0.5),
        fits: el.scrollWidth <= el.clientWidth,
      };
    });
    expect(rows, `the strip at ${rootPx}`).toEqual({ tops: 1, inside: true, fits: true });
  }
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  // Its section a helicopter's, its type and where it alights the registry's own words.
  const info = card.getByTestId("airplane-info");
  await expect(info.getByTestId("airplane-info-airplane")).toContainText("Helicopter");
  await info.getByTestId("airplane-info-airplane-more").click();
  await expect(info).toContainText("TypeRotorcraft");
  await expect(info).toContainText("Land or WaterLand");
  await expect(info).not.toContainText("Category");
  // No photo of it and nothing flown to sketch: the pictures' place says so.
  await expect(card.getByTestId("airplane-pictures").getByTestId("airplane-no-photos")).toHaveText("No photos");
});
