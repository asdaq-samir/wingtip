import { test, expect, type Locator, type Page } from "@playwright/test";
import { airportSearch, grabberTo, settle, sideDrawer } from "./helpers";

/**
 * A list's row swiped to the left, as iOS's lists' rows are (SwipeRow,
 * the owner, 2026-11-17: "Can we add swipe gesture to remove ... like
 * iPhone?"): a short swipe uncovers the red Remove, whose tap takes the
 * row away; a full swipe takes it away when let go; a swipe sideways
 * never moves the sheet. The row's menu keeps its Remove for a mouse, a
 * keyboard and VoiceOver (recents.spec). A finger only: Chromium as a
 * phone, a touch screen with no hover.
 */
test.use({ hasTouch: true, isMobile: true });
test.skip(({ browserName }, info) => browserName !== "chromium" || info.project.name !== "mobile", "a phone's finger, by Chromium's CDP");

/** A finger put down near the row's right end and moved left by `dx`, a
 *  frame apart, then let go. */
async function swipeLeft(page: Page, row: Locator, dx: number) {
  const box = (await row.boundingBox())!;
  const from = { x: box.x + box.width - 24, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, p?: { x: number; y: number }) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [{ ...p, id: 1 }] : [] });
  await touch("touchStart", from);
  for (let i = 1; i <= 12; i++) {
    await touch("touchMove", { x: from.x - (dx * i) / 12, y: from.y });
    await page.waitForTimeout(16);
  }
  await touch("touchEnd");
  await cdp.detach();
}

test("an airport's Recents row is taken off by a swipe, and the sheet stays", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("swipe-seeded")) return;
    sessionStorage.setItem("swipe-seeded", "1");
    const recentAirports = [
      { ident: "KDLH", name: "Duluth International Airport", municipality: "Duluth" },
      { ident: "KMSP", name: "Minneapolis-St Paul International Airport", municipality: "Minneapolis" },
      { ident: "C81", name: "Campbell Airport", municipality: "Grayslake" },
    ];
    localStorage.setItem("wingtip.preferences", JSON.stringify({ state: { recentAirports }, version: 0 }));
  });
  await page.goto("/app/plan");
  await settle(page);
  await airportSearch(page);
  await grabberTo(page, "full");
  const panel = sideDrawer(page);
  await panel.getByTestId("airport-recents-more").click();
  const recents = panel.getByTestId("airport-recent");
  await expect(recents).toHaveCount(3);
  const sheetAt = (await panel.boundingBox())!.y;

  // A short swipe: its Remove uncovered, the sheet where it was.
  const first = panel.locator("[data-swipe-row]").filter({ hasText: "KDLH" });
  await swipeLeft(page, first, 90);
  const remove = first.getByTestId("swipe-remove");
  await expect(remove).toBeVisible();
  await expect(remove).toHaveAccessibleName("Remove KDLH from Recents");
  expect(Math.abs((await panel.boundingBox())!.y - sheetAt)).toBeLessThanOrEqual(1);
  await remove.tap();
  await expect(recents).toHaveCount(2);

  // A full swipe takes the row away when let go.
  const next = panel.locator("[data-swipe-row]").filter({ hasText: "KMSP" });
  const width = (await next.boundingBox())!.width;
  await swipeLeft(page, next, width * 0.8);
  await expect(recents).toHaveCount(1);
  await expect(recents.first()).toContainText("C81");
});
