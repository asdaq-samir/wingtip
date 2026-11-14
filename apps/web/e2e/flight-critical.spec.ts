import { test, expect } from "@playwright/test";
import {
  closeNavLog,
  grabberTo,
  navLogSheet,
  openNavLog,
  openPanel,
  openProfile,
  pressDryRunStart,
  settle,
  sideDrawer,
  slow,
} from "./helpers";
import { closeMapSettings, openSettingsPage } from "./mapCard";
import { pickAirplane } from "./startState";
test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

/**
 * What a pilot cannot be without in the air, in one journey (the owner,
 * 2026-11-09): a route planned, its nav log's figures, the emergency's
 * fields, squawk and MAYDAY, and all of it still there once the
 * connection is gone, the route's charts kept for it (Keep Charts
 * Offline, lib/map/route/keepRoute). Tagged @flight-critical: CI's e2e
 * runs it on every pull request beside the smoke set (ci.yml, docs/CI.md).
 */

// The worker keeps the charts: the suite blocks it, so mocks always apply
// (playwright.config.ts), and this journey has none.
test.use({ serviceWorkers: "allow" });

test(
  "a planned flight's nav log and emergency keep working offline once its charts are kept",
  { tag: "@flight-critical" },
  async ({ page, context }) => {
    await page.goto("/app/plan?dep=C81&dest=KDLH");
    await settle(page);

    // The nav log: every leg to the destination, with its time and fuel.
    await expect(page.getByTestId("navlog-fuel").first()).toBeVisible({ timeout: slow(120_000) });
    await openPanel(page);
    await openNavLog(page);
    // A phone's list, or a desktop's table with its time column.
    const desk = (page.viewportSize()?.width ?? 0) >= 1024;
    const log = navLogSheet(page).getByTestId(desk ? "navlog-table" : "navlog-list");
    const timed = desk ? log.getByTestId("navlog-row-ete").last() : log;
    await expect(log.locator('[role="row"][data-kind="destination"]')).toBeVisible({ timeout: slow(60_000) });
    if (!desk) await expect(log.getByTestId("navlog-row-dist").first()).toContainText(/nm/);
    await expect(timed).toContainText(desk ? /^\d+\.\d$/ : /\d min\b/);
    await closeNavLog(page);

    // The route's charts kept, where a service worker can keep them (a secure
    // context: https, or localhost); the suite's plain-http stack has none.
    const keeping = await page.evaluate(() => "serviceWorker" in navigator && window.isSecureContext);
    if (keeping) {
      // Settings from the Map card's gear, its Data group in reach.
      await openSettingsPage(page);
      const keep = page.getByTestId("keep-offline-toggle");
      if ((await keep.getAttribute("aria-checked")) !== "true") await keep.click();
      await closeMapSettings(page);
      await expect(page.getByText("Charts Saved Offline")).toBeVisible({ timeout: slow(180_000) });
    } else {
      test.info().annotations.push({ type: "offline", description: "No service worker over plain http: the charts were not kept." });
    }

    // The connection gone: the nav log still opens with its figures, and the
    // kept charts come from the worker's cache.
    await context.setOffline(true);
    await openNavLog(page);
    const offline = navLogSheet(page).getByTestId(desk ? "navlog-table" : "navlog-list");
    await expect(offline.locator('[role="row"][data-kind="destination"]')).toBeVisible();
    await expect(desk ? offline.getByTestId("navlog-row-ete").last() : offline).toContainText(desk ? /^\d+\.\d$/ : /\d min\b/);
    await closeNavLog(page);
    if (keeping) {
      const kept = await page.evaluate(async () => (await (await caches.open("chart-tiles")).keys()).length);
      expect(kept).toBeGreaterThan(0);
    }
    await context.setOffline(false);

    // In flight (the dry run flies own ship), Emergency: the fields ranked,
    // 7700 and the MAYDAY. The sheet half way, as a pilot flies with it
    // (the nav log left it all the way up), the flying head above it.
    await grabberTo(page, "half");
    await openProfile(page);
    const start = sideDrawer(page).getByTestId("dry-run-start");
    await expect(start).toBeVisible({ timeout: slow(60_000) });
    await pressDryRunStart(page, start);
    await expect(page.getByTestId("flying-head")).toBeVisible({ timeout: slow(10_000) });
    await page.getByTestId("flying-emergency").click();
    const sheet = page.getByTestId("emergency-sheet");
    await expect(sheet.getByTestId("emergency-field").first()).toBeVisible({ timeout: slow(20_000) });
    await expect(sheet.getByTestId("emergency-squawk")).toContainText("7700");
    await expect(sheet.getByTestId("emergency-mayday")).toContainText("MAYDAY, MAYDAY, MAYDAY");

    // Offline again in the air: the emergency keeps its fields, squawk and
    // call (the engine answers in the page, through its WebAssembly).
    await context.setOffline(true);
    await expect(sheet.getByTestId("emergency-field").first()).toBeVisible();
    await expect(sheet.getByTestId("emergency-squawk")).toContainText("7700");
    await expect(sheet.getByTestId("emergency-channel").last()).toContainText("121.5");
    await expect(sheet.getByTestId("emergency-mayday")).toContainText("MAYDAY, MAYDAY, MAYDAY");
    await context.setOffline(false);
  },
);

/**
 * The connection gone before anything is asked (the offline audit's gaps
 * 1 to 3): with the route kept for the air, offline, and -- where a
 * service worker holds the app -- the page loaded again, each of the nav
 * log, Emergency, Nearest and Direct To shows its content or says "No
 * connection", never a blank or a skeleton for good. Emergency and
 * Nearest rank the fields on the device (lib/fieldsOnDevice), Direct To
 * works its leg out there (directOnDevice) or leaves the route as it was.
 */
test(
  "offline from the first ask: the nav log, Emergency, Nearest and Direct To each answer or say No connection",
  { tag: "@flight-critical" },
  async ({ page, context }) => {
    await page.goto("/app/plan?dep=C81&dest=KDLH");
    await settle(page);
    await expect(page.getByTestId("navlog-fuel").first()).toBeVisible({ timeout: slow(120_000) });

    const keeping = await page.evaluate(() => "serviceWorker" in navigator && window.isSecureContext);
    if (keeping) {
      await openSettingsPage(page);
      const keep = page.getByTestId("keep-offline-toggle");
      if ((await keep.getAttribute("aria-checked")) !== "true") await keep.click();
      await closeMapSettings(page);
      await expect(page.getByText("Charts Saved Offline")).toBeVisible({ timeout: slow(180_000) });
    }

    const route = page.url();
    await context.setOffline(true);
    if (keeping) {
      // Loaded again with no connection: the app from the worker, the
      // route's answers from what Keep for the Air kept. Opened by its
      // link, which lands where it says: a reload starts clean, with no
      // route, as Maps does when it is opened (features/shell/freshLoad).
      await page.goto(route);
      await settle(page);
    } else {
      test.info().annotations.push({ type: "offline", description: "No service worker over plain http: not reloaded offline." });
    }

    // The nav log: its legs, or No connection.
    await openPanel(page);
    await openNavLog(page);
    const desk = (page.viewportSize()?.width ?? 0) >= 1024;
    const log = navLogSheet(page);
    await expect(
      log
        .getByTestId(desk ? "navlog-table" : "navlog-list")
        .locator('[role="row"][data-kind="destination"]')
        .or(log.getByText(/No connection/)),
    ).toBeVisible({ timeout: slow(20_000) });
    await closeNavLog(page);

    // In flight, offline: the dry run flies own ship from the legs in hand.
    await grabberTo(page, "half");
    await openProfile(page);
    const start = sideDrawer(page).getByTestId("dry-run-start");
    await expect(start).toBeVisible({ timeout: slow(60_000) });
    await pressDryRunStart(page, start);
    await expect(page.getByTestId("flying-head")).toBeVisible({ timeout: slow(10_000) });

    // Emergency: fields ranked on the device, or No connection.
    await page.getByTestId("flying-emergency").click();
    const sheet = page.getByTestId("emergency-sheet");
    // Either, or both: offline the fields ranked on the device come with a
    // line saying they are the chart data kept, not the planner's.
    await expect(
      sheet
        .getByTestId("emergency-field")
        .first()
        .or(sheet.getByText(/No connection/).first())
        .first(),
    ).toBeVisible({ timeout: slow(20_000) });
    await expect(sheet.getByTestId("emergency-squawk")).toContainText("7700");
    await sheet.getByTestId("sheet-card-close").click();

    // Nearest: the fields from the device, or No connection -- never
    // "Searching…" for good.
    await page.getByTestId("flying-nearest").click();
    const results = sideDrawer(page).getByTestId("search-results");
    await expect(results).toBeVisible({ timeout: slow(10_000) });
    await expect(results).toContainText(/ nm|No connection/, { timeout: slow(20_000) });
    await expect(results).not.toContainText("Searching…");
    await page.keyboard.press("Escape");

    // Direct To: worked out on the device, or the route left as it was.
    const direct = page.getByTestId("flying-direct");
    if (await direct.isVisible()) {
      await direct.click();
      await expect(
        sideDrawer(page)
          .getByTestId("direct-on-device")
          .or(page.getByTestId("problem-banner-title").getByText("Not changed: no connection")),
      ).toBeVisible({ timeout: slow(10_000) });
    }
    await context.setOffline(false);
  },
);
