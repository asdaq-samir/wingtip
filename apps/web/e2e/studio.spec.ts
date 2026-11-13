import { test, expect, type Page } from "@playwright/test";
import track from "./fixtures/studio-track.json" with { type: "json" };
import { closeConsole, roleMenu, settle, showTabs } from "./helpers";

/**
 * The Studio (`/studio`): a real flight replayed in the 3D view. The
 * track is N14511's departure from O'Hare on 2026-11-10, adsb.lol's
 * history (ODbL 1.0), recorded here so the test asks nothing of the
 * internet; the planner's day of it stubbed with it, and the ground under
 * it with a level field.
 */

async function stubStudio(page: Page) {
  const asked: string[] = [];
  await page.route(
    (url) => url.pathname.endsWith("/planner/studio/track"),
    (route) => {
      asked.push(new URL(route.request().url()).search);
      return route.fulfill({ json: track });
    },
  );
  await page.route(
    (url) => url.pathname.endsWith("/planner/studio/watched"),
    (route) => route.fulfill({ json: [] }),
  );
  await page.route(
    (url) => url.pathname.endsWith("/planner/studio/ground"),
    async (route) => {
      const { points } = route.request().postDataJSON() as { points: unknown[] };
      return route.fulfill({ json: { ground_ft: points.map(() => 650) } });
    },
  );
  return asked;
}

test("studio: a day of an airplane replays in the chase camera, its data block and profile following", async ({ page }) => {
  const asked = await stubStudio(page);
  await page.goto("/app/studio?q=N14511&day=2026-11-10");
  await settle(page);
  await expect.poll(() => asked.length).toBeGreaterThan(0);
  expect(asked[0]).toContain("q=N14511");
  // The track loaded, its credit said, the chase camera on it.
  const replay = page.getByTestId("studio-replay");
  await expect(replay).toBeVisible();
  await expect(replay).toContainText("adsb.lol, ODbL 1.0");
  await expect(page.getByTestId("studio-camera")).toContainText("Chase");
  await expect(page.locator("[data-replay-camera='chase']")).toBeAttached();
  // Played at 16 times: the time moves on, and the data block says the
  // climb in pressure altitude.
  await page.getByTestId("studio-timeline-speed").click();
  await page.getByTestId("studio-timeline-speed-16").click();
  const time = page.getByTestId("replay-data-time");
  const before = await time.textContent();
  await page.getByTestId("studio-timeline-play").click();
  await expect(time).not.toHaveText(before ?? "");
  await expect(page.getByTestId("replay-data-block")).toContainText("Press alt");
  await expect(page.getByTestId("replay-data-vs")).toHaveText(/fpm|Level/);
  // Another camera from the menu.
  await page.getByTestId("studio-camera").click();
  await page.getByTestId("studio-camera-orbit").click();
  await expect(page.locator("[data-replay-camera='orbit']")).toBeAttached();
  // The profile drawn from the nav log's own chart.
  await expect(page.getByTestId("replay-profile").getByTestId("profile-chart")).toBeVisible();
});

test("studio: switched to from the account menu, and back to the map", async ({ page }) => {
  await stubStudio(page);
  await page.goto("/app/plan");
  await settle(page);
  await showTabs(page);
  await roleMenu(page);
  await page.getByTestId("mode-studio").click();
  await expect(page).toHaveURL(/\/app\/studio/);
  // Settings still out across the switch, as it stays to Developer
  // (useDevMode, switch.spec); put away, the Studio's own bar under it.
  await closeConsole(page);
  await expect(page.getByTestId("studio-bar")).toBeVisible();
  await roleMenu(page);
  await page.getByRole("menuitemradio", { name: "Pilot" }).click();
  await expect(page).toHaveURL(/\/app\/plan/);
});

test("studio: a file with no track says so where the track would be", async ({ page }) => {
  await stubStudio(page);
  await page.goto("/app/studio");
  await settle(page);
  await page
    .getByTestId("studio-file")
    .setInputFiles({ name: "notes.csv", mimeType: "text/csv", buffer: Buffer.from("name,value\na,1\n") });
  await expect(page.getByTestId("studio-problem")).toContainText("no time and position columns");
});
