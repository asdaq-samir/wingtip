import { test, expect, type Locator, type Page } from "@playwright/test";
import { firstRow, grabberTo, openBrief, panelTabs, settle, settled, sideDrawer } from "./helpers";

/**
 * The map's panel is Base UI's stock Drawer on a phone (MapPanel): a
 * finger on its grabber or its head takes it up and down; on a list in its
 * body a drag down takes it down once the list is back at its start, and
 * while the list is scrolled, it scrolls instead (the Drawer's own
 * arbitration, as an iOS sheet's scrolling content hands its drag on).
 */
test.use({ hasTouch: true });

/** A finger down on `at` and `dy` down the screen (up, negative), a
 *  frame a move, as a finger's moves come: slowly enough that the sheet
 *  comes to rest where it was let go, past half way to the next height
 *  rather than thrown there. */
async function fingerDrag(page: Page, at: { x: number; y: number }, dy: number, hold = 0) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, p?: { x: number; y: number }) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [{ ...p, id: 1 }] : [] });
  await touch("touchStart", at);
  for (let i = 1; i <= 20; i++) {
    await touch("touchMove", { x: at.x, y: at.y + (dy * i) / 20 });
    await page.waitForTimeout(16);
  }
  // A finger held still sends no moves: what it was doing before it
  // stopped is not how it lets go.
  if (hold) await page.waitForTimeout(hold);
  await touch("touchEnd");
  await cdp.detach();
}

/** The grabber's middle, where a finger takes the sheet. */
async function onGrabber(page: Page) {
  await settled(sideDrawer(page));
  const box = (await page.getByTestId("sidebar-trigger-button").boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("the panel follows a finger from its grabber out to the top, and down from its content's start", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "a phone's sheet");
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  // The Brief's pages, half way as it opens: its tabs' bar and a page.
  await openBrief(page);
  const panel = sideDrawer(page);
  await expect(panel).toHaveAttribute("data-panel", "half");
  const middleOf = async (locator: Locator) => {
    const box = (await locator.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 120) };
  };

  // Up from half by the grabber: the sheet comes all the way out. (A drag
  // up on a list in the body scrolls the list, the stock Drawer's rule.)
  await fingerDrag(page, await onGrabber(page), -400);
  await expect(panel).toHaveAttribute("data-panel", "full");
  await expect(panel.getByTestId("brief-glance")).toBeVisible();
  await expect(panelTabs(page)).toHaveCount(0);

  // A page of the Brief's, long enough to scroll: Preflight, by its card.
  await panel.getByTestId("brief-glance-preflight").click();
  const tab = page.getByTestId("brief-scroller");
  await expect(tab).toBeVisible();
  const middle = () => middleOf(tab);

  // Scrolled down, a drag down scrolls it back rather than taking the
  // sheet down.
  await expect.poll(() => tab.evaluate((el) => el.scrollHeight > el.clientHeight + 300)).toBe(true);
  await tab.evaluate((el) => {
    el.scrollTop = 300;
  });
  await fingerDrag(page, await middle(), 120);
  await expect(panel).toHaveAttribute("data-panel", "full");

  // At its start, a drag down takes the sheet down, half way.
  await tab.evaluate((el) => {
    el.scrollTop = 0;
  });
  await fingerDrag(page, await middle(), 400);
  await expect(panel).toHaveAttribute("data-panel", "half");

  // And a mouse on the body leaves the sheet where it is: a drag across
  // it selects its words.
  await grabberTo(page, "full");
  const at = await middle();
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x, at.y - 200, { steps: 10 });
  await page.mouse.up();
  await expect(panel).toHaveAttribute("data-panel", "full");
});

test("a drag held still before it is let go sets the sheet down where it is, not on past it", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "a phone's sheet");
  await page.goto("/app/plan");
  await settle(page);
  await grabberTo(page, "half");
  const panel = sideDrawer(page);
  // Down 110 from half, nearer half than the pill, held and let go: half
  // again. Its moves alone, let go at once, would have thrown it to the
  // pill (the engine's SPEED_WINDOW).
  const box = (await firstRow(page).boundingBox())!;
  await fingerDrag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 110, 600);
  await expect(panel).toHaveAttribute("data-panel", "half");
});

test("a flick goes on the way it was thrown: up from the pill, down from all the way up", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "a phone's sheet");
  // The stock Drawer reads the throw itself (no one-size rule of our own
  // since the owner's 2026-11-10 "let them be as is for stock ones").
  await page.goto("/app/plan");
  await settle(page);
  const panel = sideDrawer(page);
  await expect(panel).toHaveAttribute("data-panel", "peek");
  // A finger's flick on the first row (the one search's): two moves as fast
  // as they can be sent, let go at once.
  const flick = async (dy: number) => {
    await settled(panel);
    const box = (await firstRow(page).boundingBox())!;
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: string, p?: { x: number; y: number }) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [{ ...p, id: 1 }] : [] });
    await touch("touchStart", at);
    for (let i = 1; i <= 2; i++) await touch("touchMove", { x: at.x, y: at.y + (dy * i) / 2 });
    await touch("touchEnd");
    await cdp.detach();
  };
  await flick(-210);
  await expect(panel).not.toHaveAttribute("data-panel", "peek");
  await grabberTo(page, "full");
  await flick(320);
  await expect(panel).not.toHaveAttribute("data-panel", "full");
});

/** How much of the screen the sheet at rest covers, from its foot: the
 *  Drawer's own snap point (a fixed "4.75rem" at the pill), measured. */
async function shown(page: Page) {
  await settled(sideDrawer(page));
  const box = (await sideDrawer(page).boundingBox())!;
  return Math.round(page.viewportSize()!.height - box.y);
}

/** The first row's middle, where a finger takes the sheet. */
async function onTabs(page: Page) {
  await settled(sideDrawer(page));
  const box = (await firstRow(page).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("a drag from half down past the pill lands on the pill: not closed, not back at half, and the pill its own height", async ({
  page,
}) => {
  test.skip(page.viewportSize()!.width >= 768, "a phone's sheet");
  await page.goto("/app/plan");
  await settle(page);
  const panel = sideDrawer(page);
  await expect(panel).toHaveAttribute("data-panel", "peek");
  const pill = await shown(page);
  await grabberTo(page, "half");
  // Down past the pill to the screen's foot: the pill, where the stock
  // sheet's refused close once took it back up to half (the drag probe,
  // 2026-11-04).
  const at = await onTabs(page);
  await fingerDrag(page, at, page.viewportSize()!.height - at.y - 4);
  await expect(panel).toHaveAttribute("data-panel", "peek");
  await expect(panel).toBeVisible();
  // The pill at rest the same height as before: a half's head once taken
  // for it put in a 236-point pill the sheet stopped at, then dropped from.
  await expect.poll(async () => Math.abs((await shown(page)) - pill)).toBeLessThanOrEqual(2);
});

test("a touch on the sheet that does not move leaves it where it is", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "a phone's sheet");
  // A touch once took the stock sheet all the way up (the owner,
  // 2026-11-04). On the figures, not a tab, which a tap would pick.
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  const panel = sideDrawer(page);
  await expect(panel).toHaveAttribute("data-panel", "peek");
  await settled(panel);
  const before = (await panel.boundingBox())!.y;
  const cdp = await page.context().newCDPSession(page);
  const at = { x: 20, y: before + 30, id: 1 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] });
  await page.waitForTimeout(150);
  expect(Math.abs((await panel.boundingBox())!.y - before)).toBeLessThanOrEqual(1);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await cdp.detach();
});
