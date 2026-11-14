import { test, expect } from "@playwright/test";
import { consolePage, expandConsole, openConsole, showTabs, consoleSheet } from "./helpers";

// A route's handler still running as the test ends found the page closed
// and failed the test (devconsole.spec): taken off, errors let go.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

/**
 * A feed that stops coming in reads as nothing at all -- no NOTAM, no
 * echo on the radar -- which a pilot cannot tell from a quiet sky, so the
 * Status page says so under its row (the planner's feed watch,
 * app.feeds.status_rows, through /api/map/ages's `stale`).
 */
test("a feed that has stopped updating says so on the Status page", async ({ page }) => {
  const threeHoursAgo = new Date(Date.now() - 3 * 3600_000).toISOString();
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/map/ages"),
    (route) =>
      route.fulfill({
        json: {
          metars_at: new Date().toISOString(),
          tfrs_at: null,
          sources: [
            { name: "METARs", fetched_at: new Date().toISOString(), kept_until: null, failing: false, stale: false },
            { name: "NOTAMs", fetched_at: threeHoursAgo, kept_until: null, failing: false, stale: true },
          ],
          data_cycles: [],
        },
      }),
  );
  await page.goto("/app/dev");
  await showTabs(page);
  await openConsole(page);
  await expandConsole(page);
  await consolePage(consoleSheet(page), "Status");

  const notams = page.getByTestId("status-source").filter({ hasText: "NOTAMs" });
  await expect(notams).toContainText("Not updating: last updated 3h ago");
  await expect(page.getByTestId("status-source").filter({ hasText: "METARs" })).not.toContainText("Not updating");
});
