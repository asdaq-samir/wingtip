import { test, expect } from "@playwright/test";
import { closeNavLog, navLogSheet, openNavLog, openPanel, settle, slow } from "./helpers";

/**
 * The nav log on a desktop (docs/design/web.md §4): a dense table, TanStack
 * Table on shadcn's, its heading held at the top as it scrolls, one row a
 * point, its totals at the foot; the columns a desktop's -- Point, Alt,
 * Dist, TC, Wind, MH, GS, ETE, Fuel -- and only those an airplane allows
 * (no-airplane.spec has the log with none). The phone keeps its list.
 */
test.beforeEach(({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "a desktop's layout");
});

test("with an airplane the log is a table with a sticky heading, the desk's columns and its totals", async ({ page }) => {
  test.setTimeout(slow(180_000));
  // The suite's C172 (auth.setup), so the airplane's columns are there.
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await expect(page.getByTestId("navlog-fuel").first()).toBeVisible({ timeout: slow(120_000) });
  await openPanel(page);

  await openNavLog(page);
  const log = navLogSheet(page).getByTestId("navlog-table");
  await expect(log.locator('[role="row"][data-kind="destination"]')).toBeVisible({ timeout: slow(60_000) });
  await expect(navLogSheet(page).getByTestId("navlog-list")).toHaveCount(0);
  // The heading held at the top as the rows scroll under it.
  expect(await log.locator("thead").evaluate((el) => getComputedStyle(el).position)).toBe("sticky");
  // The desk's columns, the airplane's among them; the leg's other
  // figures stay in its grid under the row picked.
  for (const column of ["waypoint", "alt", "dist", "tc", "wind", "mh", "gs", "ete", "fuel"])
    await expect(log.getByTestId(`navlog-row-${column}`).last()).toBeVisible();
  for (const column of ["wca", "th", "var", "tas"]) await expect(log.getByTestId(`navlog-row-${column}`)).toHaveCount(0);
  // The totals at the foot, the planner's.
  const totals = log.getByTestId("navlog-totals");
  await expect(totals).toContainText("Total");
  await expect(totals.locator("td").nth(2)).toHaveText(/^\d+\.\d$/);
  // No sideways scroll beside the map.
  const box = await log.evaluate((el) => ({ table: el.querySelector("table")!.offsetWidth, room: el.clientWidth }));
  expect(box.table).toBeLessThanOrEqual(box.room + 1);
  await closeNavLog(page);
});
