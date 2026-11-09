import { test, expect, type Page } from "@playwright/test";
import { openPanel, openProfile, settle, sideDrawer, slow } from "./helpers";

/**
 * The emergency assistant (features/emergency), reached with no map button
 * of its own: from flying mode's Emergency, in the next checkpoint's head
 * (FlyingHead). Own ship flown by the planned flight's dry run, as
 * flying-mode.spec flies it; the planner answers /api/emergency/fields
 * and the engine ranks what it sent (best_fields).
 */

async function flying(page: Page) {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await openProfile(page);
  const start = sideDrawer(page).getByTestId("dry-run-start");
  await expect(start).toBeVisible({ timeout: slow(60_000) });
  await start.click();
  await expect(page.getByTestId("flying-head")).toBeVisible({ timeout: slow(10_000) });
}

test("in flight, Emergency opens the best fields, the squawk and the MAYDAY", { tag: "@smoke" }, async ({ page }) => {
  await flying(page);
  const entry = page.getByTestId("flying-emergency");
  await expect(entry).toHaveText("Emergency");
  // A 44-point target round a control that does not grow (its ::after).
  await entry.click();
  const sheet = page.getByTestId("emergency-sheet");
  await expect(sheet).toBeVisible();
  // The fields round own ship, ranked; the first picked, its line drawn.
  await expect(sheet.getByTestId("emergency-field").first()).toBeVisible({ timeout: slow(20_000) });
  await expect(sheet.getByTestId("emergency-field").first()).toHaveAttribute("aria-checked", "true");
  await expect(sheet.getByTestId("emergency-squawk")).toContainText("7700");
  const channels = sheet.getByTestId("emergency-channel");
  await expect(channels.last()).toContainText("121.5");
  const call = sheet.getByTestId("emergency-mayday");
  await expect(call).toContainText("MAYDAY, MAYDAY, MAYDAY");
  // What the app does not know is a blank to say, until the pilot says it.
  await expect(call).toContainText("[people on board]");
  await sheet.getByTestId("emergency-souls").fill("2");
  await expect(call).toContainText("2 people on board");
  // A second field picked: the call's intentions follow it.
  const second = sheet.getByTestId("emergency-field").nth(1);
  if (await second.count()) {
    await second.click();
    await expect(second).toHaveAttribute("aria-checked", "true");
  }
  await expect(sheet.getByTestId("emergency-call-911")).toHaveAttribute("href", "tel:911");
  // The map's own buttons are as they were: no EMER (the owner, 2026-11-08).
  await expect(page.getByTestId("map-emergency")).toHaveCount(0);
});

test('the pilot\'s own "mayday" at the microphone opens it at once', async ({ page }) => {
  // The browser's recognizer, a stand-in saying the pilot's words (clearance.spec's way).
  await page.addInitScript(() => {
    class Heard {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(
          () =>
            this.onresult?.({
              resultIndex: 0,
              results: [Object.assign([{ transcript: "mayday mayday mayday engine failure" }], { isFinal: true })],
            }),
          300,
        );
      }
      stop() {
        setTimeout(() => this.onend?.(), 50);
      }
    }
    Object.assign(window, {
      SpeechRecognition: Object.assign(Heard, { available: async () => "available" }),
      webkitSpeechRecognition: Heard,
    });
  });
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const sheet = page.getByTestId("emergency-sheet");
  await expect(async () => {
    if (!(await page.getByTestId("radio-pill").count())) await page.getByTestId("radio-button").click();
    await expect(sheet).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: slow(20_000) });
  // The radio's part needs no position: 7700 and the call are there at once.
  await expect(sheet.getByTestId("emergency-squawk")).toContainText("7700");
});

test("from the emergency checklists, the assistant is a row away", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await page.getByRole("button", { name: "Checklists" }).click();
  await page.getByTestId("checklist-kind").getByText("Emergency").click();
  await page.getByTestId("checklist-emergency").click();
  await expect(page.getByTestId("emergency-sheet")).toBeVisible();
});
