import { test, expect } from "@playwright/test";
import { openMapSettings, settle, sideDrawer, slow } from "./helpers";

/**
 * The map's microphone on a phone: a circle of its own over the map's
 * buttons at the right, as from md up, since the page toggle took its
 * place at the left under the 3D (the owner, 2026-11-13: "replace the
 * radio button on the left with the fpl toggle but below 3d"); its
 * listening pill widens out of it to the left (RadioPill), on the screen.
 */
test("the map's microphone is over the map's buttons at the right, and its pill widens to the left", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "a phone's sheet across the screen's foot");
  // Playwright's headless shell has no on-device recognizer behind
  // `available`, and asking it there ends the page (lib/speechLocal): a
  // Safari-like recognizer, which hears nothing, stands in for the tap.
  await page.addInitScript(() => {
    class Quiet {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: unknown = null;
      onerror: unknown = null;
      onend: (() => void) | null = null;
      start() {}
      stop() {
        setTimeout(() => this.onend?.(), 50);
      }
      abort() {
        this.stop();
      }
    }
    Object.assign(window, { SpeechRecognition: Quiet, webkitSpeechRecognition: Quiet });
  });
  await page.goto("/app/plan?layout=tabs");
  await settle(page);
  const mic = page.getByTestId("mic-circle");
  await expect(mic).toBeVisible({ timeout: slow(30000) });
  const shut = (await mic.boundingBox())!;
  const sheet = (await sideDrawer(page).boundingBox())!;
  const width = page.viewportSize()!.width;
  // At the right edge, over the map's buttons' group, the same size as the
  // 3D circle at the left (ThreeDButton): circles apart, as Apple Maps'
  // are, not one capsule.
  expect(width - (shut.x + shut.width)).toBeLessThanOrEqual(16);
  const group = (await page.locator("[data-map-controls]").getByTestId("map-settings-button").locator("..").boundingBox())!;
  expect(shut.y + shut.height).toBeLessThanOrEqual(group.y);
  const threeD = (await page.getByTestId("map-3d-button").locator("..").boundingBox())!;
  expect(Math.abs(threeD.width - shut.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(threeD.height - shut.height)).toBeLessThanOrEqual(1);
  expect(threeD.x).toBeLessThanOrEqual(16);
  expect(threeD.y + threeD.height).toBeLessThanOrEqual(sheet.y);
  // Tapped: the pill, listening or saying why it cannot -- the right edge
  // stays where it was, it grows to the left, and it stays on the screen,
  // over the 3D and the toggle at the left rather than across them.
  await mic.getByTestId("radio-button").click();
  const pill = page.getByTestId("radio-pill");
  await expect(pill).toBeVisible({ timeout: slow(10000) });
  await expect.poll(async () => (await mic.boundingBox())!.width).toBeGreaterThan(shut.width + 40);
  const open = (await mic.boundingBox())!;
  expect(Math.abs(open.x + open.width - (shut.x + shut.width))).toBeLessThanOrEqual(1);
  expect(open.x).toBeGreaterThanOrEqual(0);
  expect(open.y + open.height).toBeLessThanOrEqual(threeD.y);
});

test("the radio's button is on the map only while Comms Assist is on in Map Settings", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("wingtip.commsAssist", "false");
  });
  await page.goto("/app/plan?layout=tabs");
  await settle(page);
  await expect(page.getByTestId("map-settings-button")).toBeVisible({ timeout: slow(30000) });
  await expect(page.getByTestId("radio-button")).toHaveCount(0);
  await openMapSettings(page);
  await page.getByTestId("comms-assist-toggle").click();
  await expect(page.getByTestId("radio-button")).toBeVisible();
});
