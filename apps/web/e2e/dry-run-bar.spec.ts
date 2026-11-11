import { test, expect } from "@playwright/test";
import { openPanel, openProfile, settle, sideDrawer, slow, pressDryRunStart } from "./helpers";
import { pickAirplane } from "./startState";
test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

test("the dry run's bar is the map's playback bar: Play a toggle, Space on the chart, the speed a menu", async ({ page }) => {
  // docs/design/web.md §11: the same bar as the radar loop's
  // (components/PlaybackBar), a toolbar with Play as a toggle and the
  // speed as a menu, not a button that went round the speeds.
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await openProfile(page);
  const start = sideDrawer(page).getByTestId("dry-run-start");
  await expect(start).toBeVisible({ timeout: slow(60_000) });
  await pressDryRunStart(page, start);
  const panel = sideDrawer(page);
  await expect(panel.getByRole("toolbar", { name: "Dry run" })).toBeVisible();
  const play = panel.getByTestId("dry-run-play");
  await expect(play).toHaveAttribute("aria-pressed", "true");
  // Space on the chart's scrubber pauses it, and again plays it.
  const thumb = panel.getByTestId("dry-run-scrub").getByRole("slider", { name: "Where the dry run is along the course" });
  await thumb.focus();
  await page.keyboard.press(" ");
  await expect(play).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press(" ");
  await expect(play).toHaveAttribute("aria-pressed", "true");
  // The speed from its menu.
  await panel.getByTestId("dry-run-speed").click();
  await page.getByTestId("dry-run-speed-200").click();
  await expect(panel.getByTestId("dry-run-speed")).toHaveAccessibleName("Speed: 200×");
});
