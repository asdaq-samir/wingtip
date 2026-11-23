import { test, expect } from "@playwright/test";
import { settle, sideDrawer, slow, openBrief, openNavLog, navLogSheet } from "./helpers";
import { pickAirplane } from "./startState";

/**
 * A route through Canada (the owner's pick of 2026-11-21, decision 0053):
 * every figure is worked out by the FAA's rules, so where a leg crosses
 * Canada the timeline, on that leg, and the nav log say "The leg to KBUF
 * crosses Canada (Ontario): Canadian rules not checked — figures use US
 * rules", never as the US field's at its end, and the Brief says it once
 * among its findings. Warn, never limit: the route is planned as any other.
 */

test.beforeEach(({ page }) => pickAirplane(page));
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

// An iPhone 16 Pro, touch.
test.use({ viewport: { width: 402, height: 874 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });

const RULES = "Canadian rules not checked — figures use US rules";
const LEG = `The leg to KBUF crosses Canada (Ontario): ${RULES}`;
const ROUTE = `Part of the route is in Canada (Ontario): ${RULES}`;

// Detroit to Buffalo: both ends US fields the planner knows, the great
// circle between them across southern Ontario. Thunder Bay (CYQT) is in no
// FAA data set, so its row said only that its card could not be had.
test("a route from Detroit to Buffalo across Ontario is planned and warned of where its figures are, and once in the Brief", async ({
  page,
}) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "a phone's panel");
  await page.goto("/app/plan?dep=KDET&dest=KBUF&view=full");
  await settle(page);
  // Planned as any route: its figures come.
  await expect(page.getByTestId("navlog-ete")).toBeVisible({ timeout: slow(120000) });
  // On the leg, under the departure's line, down to Buffalo; Buffalo,
  // in New York, is not said to be in Canada.
  await expect(sideDrawer(page).getByTestId("timeline-leg-caution")).toHaveText(LEG);
  await expect(sideDrawer(page).getByTestId("timeline-caution")).toHaveCount(0);
  // The nav log: once, on the leg after the departure's row, never on every row.
  await openNavLog(page);
  const log = navLogSheet(page).getByTestId("navlog-list");
  await expect(log.getByTestId("navlog-jurisdiction")).toHaveCount(1);
  await expect(log.getByTestId("navlog-jurisdiction")).toHaveText(LEG);
  await page.keyboard.press("Escape");
  // The Brief: one line among its findings, a caution, not a stop.
  await openBrief(page);
  const line = sideDrawer(page).getByTestId("brief-glance").getByTestId("brief-line-jurisdiction");
  await expect(line).toHaveCount(1, { timeout: slow(30_000) });
  await expect(line).toHaveAttribute("data-finding", "caution");
  await expect(line.getByTestId("brief-line-words")).toHaveText(ROUTE);
});
