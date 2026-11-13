import { test, expect, type Page } from "@playwright/test";
import { settle, slow } from "./helpers";
import { FAA } from "./faaRecord";

/**
 * An airplane's card opened when it is not heard now, as the owner's
 * iPhone showed N654FL on 2026-11-13: its registration and type from the
 * FAA's record, a long owner's name that never covers its label, its one
 * picture the card's width, saying so where its flights could not be
 * fetched, and its last row reachable. The planner is stubbed: adsb.lol's
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

test("an airplane not heard now has its registration and type from the FAA's record, its owner beside its label, its picture as wide as the card and its last row reachable", async ({
  page,
}) => {
  await notHeard(page);
  await page.goto("/app/plan?flight=a89c1e");
  await settle(page);
  const card = page.getByTestId("flight-card");
  await expect(page.getByTestId("flight-name")).toHaveText("N654FL", { timeout: slow(15_000) });
  await expect(card.getByTestId("flight-registration")).toContainText("N654FL");
  await expect(card.getByTestId("flight-type")).toHaveText("Piper PA-28-140 · 1971");

  // "Registered to" and the long name never overlap, at the larger text the owner's iPhone uses too.
  for (const rootPx of ["16px", "19.65px"]) {
    await page.evaluate((px) => (document.documentElement.style.fontSize = px), rootPx);
    const label = card.getByTestId("flight-details").getByText("Registered to", { exact: true });
    const value = card.getByTestId("flight-owner");
    await expect(value).toHaveText("Roca Roja Y Caballo Gris De Idaho Llc");
    const [a, b] = [await label.boundingBox(), await value.boundingBox()];
    const apart = a!.y + a!.height <= b!.y + 1 || a!.x + a!.width <= b!.x + 1;
    expect(apart, `label ${JSON.stringify(a)} and value ${JSON.stringify(b)} at ${rootPx}`).toBe(true);
  }
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));

  // Its one picture spans the card, as its details do, and says its flights were not had.
  const sketch = card.getByTestId("flight-trail");
  await sketch.scrollIntoViewIfNeeded();
  const [pic, list] = [await sketch.boundingBox(), await card.getByTestId("flight-details").boundingBox()];
  expect(Math.abs(pic!.width - list!.width)).toBeLessThan(4);
  await expect(card.getByTestId("flight-trail-empty")).toHaveText("Its flights could not be fetched", { timeout: slow(30_000) });

  // Scrolled to its end, its last row is in sight.
  const last = card.getByTestId("faa-airworthiness");
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
});
