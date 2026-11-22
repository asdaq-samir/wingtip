import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { grabberTo, settle, sideDrawer, slow } from "./helpers";

/**
 * The runway proximity advisor on the FAA's airport diagram
 * (features/runway-advisor; the market-gap report's item 9, 2026-11-21):
 * with the GPS rolling west down KDLH's runway 9-27, the diagram full
 * screen has own ship on it, placed by the page's own latitude and
 * longitude labels as pdf.js reads them, and says "On runway 27". The
 * card, the picture and the diagram's PDF are stubbed with KDLH's own
 * (d-TPP cycle 2611, 00125AD): the FAA's publications are not the suite's
 * to depend on.
 */

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

const PDF_URL = "https://aeronav.faa.gov/d-tpp/2611/00125AD.PDF";
const PDF = readFileSync(new URL("./fixtures/kdlh-diagram-2611.pdf", import.meta.url));
/** A page of the diagram's shape, drawn white: what is drawn is not under test. */
const SHEET = `<svg xmlns="http://www.w3.org/2000/svg" width="1937" height="2970" viewBox="0 0 1937 2970"><rect width="1937" height="2970" fill="#fff"/></svg>`;
/** Half way down runway 9-27, between NASR's thresholds (46.8425 N
 *  92.2203 W and 46.8414 N 92.1798 W), rolling west at 40 kt. */
const ON_27 = { lat: 46.84195, lon: -92.20005, heading: 272, speed: 20.6, altitude: 433 };

async function onRunway(page: Page) {
  await page.addInitScript((at) => {
    const position = () =>
      ({
        coords: {
          latitude: at.lat,
          longitude: at.lon,
          accuracy: 5,
          heading: at.heading,
          speed: at.speed,
          altitude: at.altitude,
          altitudeAccuracy: 10,
          toJSON() {
            return this;
          },
        },
        timestamp: Date.now(),
        toJSON() {
          return this;
        },
      }) as unknown as GeolocationPosition;
    Geolocation.prototype.watchPosition = function (success: PositionCallback) {
      window.setTimeout(() => success(position()), 0);
      return window.setInterval(() => success(position()), 1000);
    };
    Geolocation.prototype.clearWatch = function (id: number) {
      window.clearInterval(id);
    };
    Geolocation.prototype.getCurrentPosition = function (success: PositionCallback) {
      window.setTimeout(() => success(position()), 0);
    };
    localStorage.setItem("wingtip.ownship", JSON.stringify({ state: { enabled: true, follow: false, lastFix: null }, version: 0 }));
  }, ON_27);
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/airport/KDLH"),
    async (route) => {
      const answer = await route.fetch();
      await route.fulfill({ response: answer, json: { ...(await answer.json()), airport_diagram_url: PDF_URL, airport_diagram_cycle: "2611" } });
    },
  );
  await page.route(
    (url) => url.pathname.includes("/api/planner/airport-diagram/"),
    (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: SHEET }),
  );
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/faa-chart/pdf/dtpp/2611/00125AD.PDF"),
    (route) => route.fulfill({ status: 200, contentType: "application/pdf", body: PDF }),
  );
}

test.describe("on the runway", () => {
  test.use({ permissions: ["geolocation"] });

  test("the diagram has own ship on it and says the runway it is on", async ({ page }) => {
    await onRunway(page);
    await page.goto("/app/plan?place=KDLH");
    await settle(page);
    const card = sideDrawer(page).getByTestId("place-card");
    await card.getByTestId("place-tab-diagrams").click();
    await grabberTo(page, "full");
    const row = card.getByTestId("airport-diagram");
    await row.scrollIntoViewIfNeeded();
    await row.click();

    const viewer = page.getByTestId("airport-diagram-viewer");
    await expect(viewer).toBeVisible();
    const advisor = viewer.getByTestId("runway-advisor");
    await expect(advisor).toHaveAttribute("data-state", "on_runway", { timeout: slow(15_000) });
    await expect(advisor).toContainText("On runway 27");
    // Placed on the page by its labels, as the phones place it.
    await expect(viewer.getByTestId("chart-own-ship")).toBeVisible({ timeout: slow(15_000) });
    await expect(viewer.getByTestId("runway-advisor-note")).toHaveText("FAA · Planning aid, not for navigation");
  });
});
