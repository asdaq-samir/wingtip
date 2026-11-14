import { test, expect, type Page } from "@playwright/test";
import { consoleSheet, openPanel, openProfile, settle, sideDrawer, slow, pressDryRunStart } from "./helpers";
import { pickAirplane } from "./startState";

/**
 * The emergency assistant (features/emergency), reached with no map button
 * of its own: from flying mode's Emergency, in the next checkpoint's head
 * (FlyingHead). Own ship flown by the planned flight's dry run, as
 * flying-mode.spec flies it; the planner answers /api/emergency/fields
 * and the engine ranks what it sent (best_fields).
 */

async function flying(page: Page) {
  // An airplane picked: its glide ranks the fields, its checklist opens
  // at the emergency (with none, general guidance alone).
  await pickAirplane(page);
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await openProfile(page);
  const start = sideDrawer(page).getByTestId("dry-run-start");
  await expect(start).toBeVisible({ timeout: slow(60_000) });
  await pressDryRunStart(page, start);
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
  // By its name: the list is ranked again as own ship flies on, and the
  // field picked may move in it.
  const second = sheet.getByTestId("emergency-field").nth(1);
  if (await second.count()) {
    const name = (await second.locator(".font-semibold").first().textContent())!;
    await second.click();
    await expect(sheet.getByTestId("emergency-field").filter({ hasText: name }).first()).toHaveAttribute("aria-checked", "true");
  }
  await expect(sheet.getByTestId("emergency-call-911")).toHaveAttribute("href", "tel:911");
  // A card in the map's sheet, not a modal dialog, on a phone too (the one
  // card rule, 2026-11-10): nothing dimmed, the map usable (docs/design/web.md §8).
  await expect(sheet).toHaveAttribute("role", "region");
  await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);
  // The map's own buttons are as they were: no EMER (the owner, 2026-11-08).
  await expect(page.getByTestId("map-emergency")).toHaveCount(0);
});

test("it opens on its title, and the next Tab is Direct To the best field, which flies there at once", async ({ page }) => {
  await flying(page);
  await page.getByTestId("flying-emergency").click();
  const sheet = page.getByTestId("emergency-sheet");
  // The static title takes the first focus (APG dialog), not a field: the
  // card's head, the map usable beside it (docs/design/web.md §8).
  await expect(sheet.locator(":focus")).toHaveText("Emergency");
  const direct = sheet.getByTestId("emergency-direct-to");
  await expect(direct).toBeVisible({ timeout: slow(20_000) });
  await page.keyboard.press("Tab");
  // The close sits at the title row's end, as every card's does (SheetCard),
  // so it comes first, Direct To the next Tab after it.
  const close = sheet.getByTestId("sheet-card-close");
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(direct).toBeFocused();
  const best = await sheet.getByTestId("emergency-field").first().locator(".font-semibold").first().textContent();
  await expect(direct).toContainText(`Direct To ${best}`);
  // No confirm step: the route goes to the field, and the sheet makes way.
  await page.keyboard.press("Enter");
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`direct=${best}`));
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
  await pickAirplane(page);
  // Setup's Checklists, by their link (the account menu's row opens the same).
  await page.goto("/app/plan?dep=C81&dest=KDLH&open=checklists");
  await settle(page);
  const sheet = consoleSheet(page);
  await sheet.getByTestId("checklist-kind").getByText("Emergency").click();
  await sheet.getByTestId("checklist-emergency").click();
  await expect(page.getByTestId("emergency-sheet")).toBeVisible();
});

test("each field's row says its reported visibility, and none where the report gives none", async ({ page }) => {
  // The planner's own answer (/api/planner/emergency/fields), the first
  // field's report said as 10+ sm (the AWC's "10+", the engine's
  // visibility_plus) and every other's without a visibility, so the row
  // is read against a known report.
  await page.route(
    (url) => url.pathname.endsWith("/emergency/fields"),
    async (route) => {
      const answer = await route.fetch();
      const body = await answer.json();
      const blank = { raw: null, visibility_sm: null, visibility_plus: false };
      body.fields = body.fields.map((f: { metar: object | null }, i: number) => ({
        ...f,
        metar:
          i === 0 ? { ...(f.metar ?? blank), visibility_sm: 10, visibility_plus: true } : f.metar && { ...f.metar, visibility_sm: null },
      }));
      await route.fulfill({ response: answer, json: body });
    },
  );
  await flying(page);
  await page.getByTestId("flying-emergency").click();
  const sheet = page.getByTestId("emergency-sheet");
  await expect(sheet.getByTestId("emergency-field").first()).toBeVisible({ timeout: slow(20_000) });
  const said = sheet.getByTestId("emergency-field-visibility");
  await expect(said).toHaveCount(1);
  await expect(said).toHaveText("Visibility 10+ sm");
});
