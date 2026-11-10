import { test, expect, type Locator, type Page } from "@playwright/test";
import { openPanel, settle, sideDrawer } from "./helpers";

/**
 * The route's points moved, by a mouse, the keyboard or a finger's menu
 * (React Aria's drag and drop, and Move Up and Move Down for a pilot who
 * cannot drag, WCAG 2.5.7): split from stops.spec at its size budget.
 */

// A finger, as Chromium takes one from a touch screen: put down on one
// pill and held, then moved in steps onto another, held over it a moment
// and let go. Both measured first, once the box has settled from the last
// change: a menu out hides the page from the role queries.
async function touchHold(page: Page, from: Locator, to: Locator) {
  const middle = async (pill: Locator) => {
    // The box the poll found, not a second measure after it: the pill
    // drawn again between the two (the address just changed) measured
    // null the second time, now and then. And the same twice a tenth of
    // a second apart: the course coming in restyles the pills -- their
    // airspace's colour and width -- and a drag measured before it was
    // let go beside its target (CI, 2026-10-07).
    type Box = { x: number; y: number; width: number; height: number };
    let box: Box | null = null;
    let last: Box | null = null;
    await expect
      .poll(
        async () => {
          box = await pill.boundingBox();
          const still = !!box && !!last && box.x === last.x && box.y === last.y && box.width === last.width;
          last = box;
          return still;
        },
        { intervals: [100] },
      )
      .toBe(true);
    const { x, y, width, height } = box!;
    return { x: x + width / 2, y: y + height / 2 };
  };
  const [start, end] = [await middle(from), await middle(to)];
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, p?: { x: number; y: number }) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [{ ...p, id: 1 }] : [] });
  await touch("touchStart", start);
  return async function moveOn() {
    // A frame apart, as a finger's moves come.
    for (let i = 1; i <= 20; i++) {
      await touch("touchMove", { x: start.x + ((end.x - start.x) * i) / 20, y: start.y + ((end.y - start.y) * i) / 20 });
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(300);
    await touch("touchEnd");
  };
}

// A pill dragged is the browser's own drag (React Aria's useDrag and
// useDrop, pointDrag): a mouse's drag here, as Chromium starts none from a
// touch screen's events sent by the test. The keyboard's is React Aria's:
// Enter on the pill picks it up, Tab goes from one pill to the next, Enter
// puts it down there.
test("any point dragged anywhere, by a mouse or the keyboard, the ends too: before the departure it is the departure, after the destination the destination", async ({
  page,
}) => {
  await page.route(
    (url) => /\/(checkpoints|navlog|briefing)$/.test(url.pathname),
    (route) => route.abort(),
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH&stops=KRYV,KMSN");
  await settle(page);
  await openPanel(page);
  const lines = sideDrawer(page).getByTestId("route-slide");
  const stopsAre = (list: string) => new RegExp(`[?&]stops=(${list.replaceAll(",", "%2C")}|${list})(&|$)`);

  await lines.getByTestId("route-dest").dragTo(lines.getByTestId("route-dep"));
  await expect(page).toHaveURL(/[?&]dep=KDLH(&|$)/);
  await expect(page).toHaveURL(/[?&]dest=KMSN(&|$)/);
  await expect(page).toHaveURL(stopsAre("C81,KRYV"));

  // KDLH, the departure now, picked up and put down on the destination.
  const departure = lines.getByTestId("route-dep");
  const destination = lines.getByTestId("route-dest");
  await departure.focus();
  await page.keyboard.press("Enter");
  for (let i = 0; i < 6; i++) {
    if (await destination.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(destination).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/[?&]dep=C81(&|$)/);
  await expect(page).toHaveURL(/[?&]dest=KDLH(&|$)/);
  await expect(page).toHaveURL(stopsAre("KRYV,KMSN"));
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true });

  test("a pill held opens its menu, whose Move Down moves the stop a place without a drag", async ({ page }) => {
    await page.route(
      (url) => /\/(checkpoints|navlog|briefing)$/.test(url.pathname),
      (route) => route.abort(),
    );
    await page.goto("/app/plan?dep=C81&dest=KDLH&stops=KRYV,KMSN");
    await settle(page);
    await openPanel(page);
    const lines = sideDrawer(page).getByTestId("route-slide");
    const stop = lines.getByRole("group", { name: "Stop 1 KRYV" });
    // Held past the menu's half second and let go where it was put down.
    const letGo = await touchHold(page, stop, stop);
    await expect(page.getByRole("menuitem", { name: "Remove", exact: true })).toBeVisible();
    await letGo();
    await page.getByRole("menuitem", { name: "Move Down", exact: true }).click();
    await expect(page).toHaveURL(/[?&]stops=(KMSN%2CKRYV|KMSN,KRYV)(&|$)/);
  });
});
