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
    const value = card.getByTestId("airplane-info-owner");
    await expect(value).toHaveText("Roca Roja Y Caballo Gris De Idaho Llc");
    const [a, b] = [await label.boundingBox(), await value.boundingBox()];
    const apart = a!.y + a!.height <= b!.y + 1 || a!.x + a!.width <= b!.x + 1;
    expect(apart, `label ${JSON.stringify(a)} and value ${JSON.stringify(b)} at ${rootPx}`).toBe(true);
  }
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));

  // Its one slide, its status (no photo, nothing flown to sketch), spans the card, as its record does.
  const pictures = card.getByTestId("airplane-pictures");
  await expect(pictures.getByTestId("airplane-status")).toBeVisible();
  await expect(pictures.getByTestId("flight-trail")).toHaveCount(0);
  const [pic, list] = [await pictures.boundingBox(), await card.getByTestId("airplane-info").boundingBox()];
  expect(Math.abs(pic!.width - list!.width)).toBeLessThan(4);

  // Scrolled down to a row far down its record, it is in sight: the card pulled up
  // first, as a pilot does, since at half a card's body does not scroll
  // (it opens at half, rules.md's "Detents" and "Grow, then scroll").
  // Its identifiers are Info's with its record (the owner, 2026-11-26): its ICAO address the Airplane group's.
  const last = card.getByTestId("airplane-info").getByText("ICAO Address", { exact: true });
  await inSheet(page, last);
  await expect(last).toBeInViewport();
});
