import { test, expect } from "@playwright/test";
import { fplTabBar, grabberTo, openPanel, pickFplTab, settle, settled, sideDrawer, slow } from "./helpers";

/**
 * FPL's tabs (the owner, 2026-11-14: "Can we have the same tab bar appear
 * with brief, navlog, profile and share, and open in ForeFlight?"): once a
 * route is planned, the airport card's floating glass bar at the sheet's
 * foot, the Nav Log, the Brief and the Profile as tabs, their page in place
 * under the route's row, then Share and ForeFlight as actions, never
 * picked. Before the route is planned, and at the pill, there is no bar.
 */

/** The bar's five, in the order a pilot reads them. */
const ITEMS = ["route-navlog", "route-brief", "route-profile", "route-share", "open-foreflight"];

test("FPL's tab bar comes with the planned route, the Nav Log first, each tab its page in place", { tag: "@smoke" }, async ({ page }) => {
  // The plan held back, to see FPL before its route is planned.
  let release!: () => void;
  const held = new Promise<void>((done) => {
    release = done;
  });
  await page.route(
    (url) => url.pathname.endsWith("/planner/navlog"),
    async (route) => {
      await held;
      await route.continue();
    },
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  const panel = sideDrawer(page);
  await expect(panel.getByTestId("route-box")).toBeVisible({ timeout: slow(60_000) });
  // No bar while there is nothing yet to brief or fly.
  await expect(fplTabBar(page)).toHaveCount(0);
  release();

  // The five in order, the Nav Log picked to begin with, as FPL's body
  // always was.
  const bar = fplTabBar(page);
  await expect(bar).toBeVisible({ timeout: slow(60_000) });
  const items = bar.locator(ITEMS.map((id) => `[data-testid="${id}"]`).join(", "));
  await expect(items).toHaveCount(ITEMS.length);
  expect(await items.evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")))).toEqual(ITEMS);
  await expect(bar.getByTestId("route-navlog")).toHaveAttribute("aria-selected", "true");
  await expect(panel.getByTestId("navlog-page")).toBeVisible();
  // Share and ForeFlight are actions, not tabs.
  await expect(bar.getByRole("tab")).toHaveCount(3);

  // Every item a finger's height or more (CLAUDE.md, 44 points).
  for (const id of ITEMS) {
    const box = (await bar.getByTestId(id).boundingBox())!;
    expect(box.height, id).toBeGreaterThanOrEqual(44);
  }

  // The Brief picked: its page in the Nav Log's place, the sheet kept at
  // its size.
  await settled(panel);
  const size = await panel.getAttribute("data-panel");
  await pickFplTab(page, "brief");
  await expect(panel.getByTestId("brief-page")).toBeVisible();
  await expect(panel.getByTestId("navlog-page")).toBeHidden();
  await expect(bar.getByTestId("route-navlog")).toHaveAttribute("aria-selected", "false");
  await settled(panel);
  expect(await panel.getAttribute("data-panel")).toBe(size);

  // The Profile: its rules, its cruise line and the side view.
  await pickFplTab(page, "profile");
  const profile = panel.getByTestId("profile-page");
  await expect(profile).toBeVisible();
  await expect(profile.getByTestId("flight-rules")).toBeVisible();
  await expect(profile.getByTestId("profile-line")).toContainText(/^Cruise /, { timeout: slow(30_000) });
  await expect(panel.getByTestId("brief-page")).toBeHidden();

  // The Nav Log again, the way back from any tab: no close of its own.
  await pickFplTab(page, "navlog");
  await expect(panel.getByTestId("navlog-page")).toBeVisible();
  await expect(profile).toBeHidden();

  // At a phone's pill the bar goes, the pill's one line in its place.
  if (page.viewportSize()!.width >= 768) return;
  await grabberTo(page, "peek");
  await expect(bar).toBeHidden();
});
