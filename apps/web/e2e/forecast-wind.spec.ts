import { test, expect, type Page } from "@playwright/test";
import { openTab, settle, sideDrawer, slow, openRoute } from "./helpers";
import { pickAirplane } from "./startState";
// An airplane, so the legs have their times and a field when it is reached
// (the setup picks none, and with none there is no time to forecast for).
test.beforeEach(({ page }) => pickAirplane(page));

/**
 * A field the airplane reaches more than an hour from now has its runway
 * picked into the wind its TAF forecasts for then, at the owner's pick
 * (2026-10-20), and its info says so. The planner's forecast is stubbed:
 * an easterly at 14 kt, whatever the field reports now.
 */
async function easterly(page: Page, asked: string[] = []) {
  await page.route(
    (url) => /\/airport\/[^/]+\/forecast-wind$/.test(url.pathname),
    (route) => {
      const ident = new URL(route.request().url()).pathname.split("/").at(-2)!;
      asked.push(ident);
      return route.fulfill({
        json: { ident, distance_nm: 0, dir_true_deg: 90, speed_kt: 14, gust_kt: null, valid_from: 0, valid_to: 4_000_000_000 },
      });
    },
  );
}

const depart = () => encodeURIComponent(new Date(Date.now() + 3 * 60 * 60_000).toISOString());

test("a field reached hours from now picks its runway into the forecast wind, and says it is the forecast", async ({ page }) => {
  const asked: string[] = [];
  await easterly(page, asked);
  await page.goto(`/app/plan?dep=C81&dest=KDLH&depart=${depart()}`);
  await settle(page);
  await openTab(page, "Nav Log");
  await openRoute(page);
  const kdlh = sideDrawer(page).getByRole("region", { name: "KDLH · Arrive" });
  // Duluth's 09 into the easterly.
  await expect(kdlh.getByTestId("runway-pill")).toHaveAccessibleName(/^RWY 9, into the wind/, { timeout: slow(60_000) });
  // The airport's wind at the head of its runway's menu (2026-11-25), the
  // forecast's for when it lands there, said so to VoiceOver.
  await expect(kdlh.getByTestId("field-wind")).toHaveCount(0);
  await kdlh.getByTestId("runway-pill").click();
  const wind = page.getByTestId("field-wind");
  await expect(wind).toContainText(/forecast for \d{4}Z, 90 true at 14 knots/);
  await expect(wind).toContainText("090° 14 kt");
  await page.keyboard.press("Escape");
  expect(asked).toContain("KDLH");
});

test("a runway picked into an earlier wind follows the wind, where one the pilot picked stays", async ({ page }) => {
  // KABQ's 3, picked on a northerly, stood against the 180° the field then
  // reported (the owner's screenshot, 2026-10-21): picked into the wind
  // (`auto`), Duluth's 27 goes to 09 into the easterly; picked by the
  // pilot, it stays; and an address from before `auto`, its runway
  // picked again for the wind.
  await easterly(page);
  await page.goto(`/app/plan?dep=C81&dest=KDLH&depart=${depart()}&pattern=KDLH%3A27&auto=land%3AKDLH`);
  await settle(page);
  await openTab(page, "Nav Log");
  await openRoute(page);
  const kdlh = sideDrawer(page).getByRole("region", { name: "KDLH · Arrive" });
  await expect(kdlh.getByTestId("runway-pill")).toHaveAccessibleName(/^RWY 9, into the wind/, { timeout: slow(60_000) });
  await expect(page).toHaveURL(/[?&]pattern=([^&]*(%2C|,))?KDLH(%3A|:)9(%2C|,|&|$)/);

  // Picked by the pilot: an address that says none was picked for the
  // wind (auto "-"); one from before `auto` has its runways picked again
  // for the wind (the owner's "repick runways for best winds").
  await page.goto(`/app/plan?dep=C81&dest=KDLH&depart=${depart()}&pattern=KDLH%3A27&auto=-`);
  await settle(page);
  await openTab(page, "Nav Log");
  await openRoute(page);
  await kdlh.getByTestId("runway-pill").click({ timeout: slow(60_000) });
  await expect(page.getByTestId("field-wind")).toContainText("090° 14 kt", { timeout: slow(60_000) });
  await page.keyboard.press("Escape");
  await expect(kdlh.getByTestId("runway-pill")).toHaveAccessibleName(/^RWY 27\b/);
  await expect(page).not.toHaveURL(/land(%3A|:)KDLH/);

  await page.goto(`/app/plan?dep=C81&dest=KDLH&depart=${depart()}&pattern=KDLH%3A27`);
  await settle(page);
  await openTab(page, "Nav Log");
  await openRoute(page);
  await expect(kdlh.getByTestId("runway-pill")).toHaveAccessibleName(/^RWY 9, into the wind/, { timeout: slow(60_000) });
  await expect(page).toHaveURL(/[?&]auto=[^&]*land(%3A|:)KDLH/);
});
