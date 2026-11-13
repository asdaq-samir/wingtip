import { expect, test } from "@playwright/test";
import { settle } from "./helpers";

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
  // Its pictures for Chrome's richer install dialog, a phone's and a
  // desktop's (manifest-screenshots.spec takes them), each served.
  expect(manifest.screenshots.map((s: { form_factor: string; sizes: string }) => `${s.form_factor} ${s.sizes}`)).toEqual([
    "wide 1280x800",
    "narrow 390x844",
  ]);
  for (const shot of manifest.screenshots as { src: string }[]) expect((await request.get(`/app/${shot.src}`)).ok()).toBe(true);

  // Nearest's shortcut opens Nearest, as its link does.
  await page.goto("/app/plan?open=nearest");
  expect(urls).toContain("/app/plan?open=nearest");
  await settle(page);
  await expect(page.getByTestId("nearest-card")).toBeVisible();
});
