import { test, expect } from "@playwright/test";
import {
  closeNavLog,
  grabberTo,
  navLogSheet,
  openMapSettings,
  openNavLog,
  openPanel,
  openProfile,
  settle,
  sideDrawer,
  slow,
  pressDryRunStart,
} from "./helpers";
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
      await openMapSettings(page);
      // The menu is the map's sheet: all the way up, its Offline group in reach.
      await grabberTo(page, "full");
      const keep = page.getByTestId("keep-offline-toggle");
      if ((await keep.getAttribute("aria-checked")) !== "true") await keep.click();
      await page.keyboard.press("Escape");
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
