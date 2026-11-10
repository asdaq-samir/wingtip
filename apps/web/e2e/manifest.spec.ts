import { expect, test } from "@playwright/test";
import { settle, sideDrawer } from "./helpers";

/**
 * The installed web app's manifest (docs/design/web.md, section 15): its
 * own id, so a later start_url is not a second app; a link opening in the
 * app already running; and the shortcuts on its icon, the same screens as
 * Android's, from design/screens.json. Each shortcut opens its screen.
 */
test("the manifest names the app, keeps one window and lists the screens' shortcuts", async ({ page, request }) => {
  const answer = await request.get("/app/manifest.webmanifest");
  expect(answer.ok()).toBe(true);
  const manifest = await answer.json();
  expect(manifest.id).toBe("/app/plan");
  expect(manifest.description).toBeTruthy();
  expect(manifest.launch_handler.client_mode).toContain("focus-existing");
  const urls = manifest.shortcuts.map((s: { url: string }) => s.url);
  expect(urls[0]).toBe("/app/plan?open=brief");
  expect(urls).toContain("/app/plan?open=emergency");

  // Nearest's shortcut opens Nearest, as its link does.
  await page.goto("/app/plan?open=nearest");
  expect(urls).toContain("/app/plan?open=nearest");
  await settle(page);
  await expect(sideDrawer(page).getByTestId("nearest-card")).toBeVisible();
});
