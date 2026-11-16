import { test, expect, type Page } from "@playwright/test";
import { grabberTo, settle, sideDrawer, slow, openBrief } from "./helpers";
import { pickAirplane } from "./startState";
test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

/**
 * "When should I go?" in the Brief: under the verdict, which stays
 * first, an hour strip across the day with the best
 * window over it, each hour's mark a shape of its own, and a tap on an
 * hour opening why with its time and fuel. The planner's answer is given
 * (its hours are the engine's departure_window over the Go / No-Go's own
 * findings, held by its own tests), so the page is tested as it draws it.
 */

const A_PILOT = { id: 1, email: "pilot@example.com", displayName: "A Pilot", developer: false };

/** Five departure hours from the next whole hour: no-go, caution, then a
 *  three-hour go window. */
function answer() {
  const first = new Date();
  first.setUTCMinutes(0, 0, 0);
  first.setUTCHours(first.getUTCHours() + 1);
  const at = (k: number) => new Date(first.getTime() + k * 3_600_000).toISOString();
  const weather = (finding: string, detail: string) => ({
    key: "weather",
    label: "Weather",
    tab: "enroute",
    section: "Adverse Conditions",
    finding,
    detail,
  });
  const hour = (k: number, verdict: string, reasons: object[]) => ({
    depart: at(k),
    verdict,
    reasons,
    ete_min: 92,
    fuel_gal: 14.2,
    night: false,
    night_passengers: false,
    margin: 1.5,
  });
  return {
    hours: [
      hour(0, "no-go", [weather("stop", "VFR not recommended: KDLH forecast 800 ft overcast")]),
      hour(1, "caution", [weather("caution", "G-AIRMET Sierra (IFR) along the route")]),
      hour(2, "go", [weather("ok", "No hazards; at worst 3,500 ft · 6 sm")]),
      hour(3, "go", [weather("ok", "No hazards; at worst 4,500 ft · 6 sm")]),
      hour(4, "go", [weather("ok", "No hazards; at worst 5,000 ft · 6 sm")]),
    ],
    windows: [{ start: at(2), last: at(4), hours: 3, margin: 1.5, ete_min: 92, quickest: at(2) }],
    airplane: true,
    forecast_until: at(24),
  };
}

async function signedInWithAnswer(page: Page) {
  await page.route("**/api/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(A_PILOT) }));
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/departure-window"),
    (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answer()) }),
  );
}

test("the Brief says when to go: an hour strip under the verdict, the best window over it, a tap saying why", async ({ page }) => {
  await signedInWithAnswer(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH&view=briefing");
  await settle(page);
  await expect(page.getByTestId("navlog-fuel")).toBeVisible({ timeout: slow(120000) });
  await openBrief(page);
  // The Brief's card opens half way, as every card does (e7bb15ec8), the
  // strip under its foot, where no scroll reaches: pulled all the way up.
  await grabberTo(page, "full");
  const glance = sideDrawer(page).getByTestId("brief-glance");
  const strip = glance.getByTestId("departure-window");
  await expect(strip).toBeVisible({ timeout: slow(30_000) });

  // The verdict first, then the strip (the owner's "Verdict first").
  const top = async (id: string) => (await glance.getByTestId(id).first().boundingBox())!.y;
  expect(await top("brief-verdict")).toBeLessThan(await top("departure-window"));

  // The best window in a line over the hours, in the device's clock.
  await expect(strip).toContainText(/Best: (\w{3} )?\d\d:00–\d\d:00 \S+/);
  const hours = strip.getByTestId("departure-window-hour");
  await expect(hours).toHaveCount(5);
  await expect(hours.nth(0)).toHaveAttribute("data-verdict", "no-go");
  await expect(hours.nth(2)).toHaveAttribute("data-verdict", "go");
  // Not colour alone: each tile carries a mark, and says itself in words.
  await expect(hours.nth(0).locator("svg").first()).toBeVisible();
  await expect(hours.nth(0)).toHaveAttribute("aria-label", /No-go\. VFR not recommended/);

  // 44-point hit areas, the tiles side by side in one scrolling row.
  const box = (await hours.nth(1).boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);

  // A tap opens why, with its time and fuel; a second closes it.
  await hours.nth(1).click();
  const detail = strip.getByTestId("departure-window-detail");
  await expect(detail).toContainText("Caution leaving");
  await expect(detail).toContainText("G-AIRMET Sierra (IFR) along the route");
  await expect(strip.getByTestId("departure-window-figures")).toHaveText("ETE 1h 32m · 14.2 gal");
  await hours.nth(1).click();
  await expect(detail).toBeHidden();
});

test("signed out, the strip asks the pilot to sign in and the planner is not asked", async ({ page }) => {
  let asked = false;
  await page.route("**/api/me", (route) => route.fulfill({ status: 401, body: "" }));
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/departure-window"),
    (route) => {
      asked = true;
      return route.fulfill({ status: 401, body: "" });
    },
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH&view=briefing");
  await settle(page);
  await expect(page.getByTestId("navlog-fuel")).toBeVisible({ timeout: slow(120000) });
  await openBrief(page);
  await expect(sideDrawer(page).getByTestId("departure-window-sign-in")).toBeVisible({ timeout: slow(30_000) });
  expect(asked).toBe(false);
});
