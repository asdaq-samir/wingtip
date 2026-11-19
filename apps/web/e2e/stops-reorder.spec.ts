import { test, expect, type Locator, type Page } from "@playwright/test";
import { inSheet, openPanel, openRoute, settle, sideDrawer } from "./helpers";
import { stopsAre } from "./stopsParam";

/**
 * The route's points moved, by a mouse or the keyboard in FPL's list
 * (React Aria's GridList drag and drop), or a pill's menu (Move Up and
 * Move Down, for a pilot who cannot drag, WCAG 2.5.7): split from
 * stops.spec at its size budget.
 */

// A finger, as Chromium takes one from a touch screen: put down on one
// pill and held, then moved in steps onto another, held over it a moment
// and let go. Both measured first, once the box has settled from the last
// change: a menu out hides the page from the role queries.
async function touchHold(page: Page, from: Locator, to: Locator) {
  const middle = async (pill: Locator) => {
    // Brought to the middle of the sheet first, as a finger scrolls to it:
    // the open route's field is under its airport cards since one route
    // layout (decision 0047, 2026-11-17), so on a phone its
    // pills start below the fold, behind the floating bar's Brief and Nav
    // Log, where a touch landed on Nav Log and no menu opened.
    await pill.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
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

// FPL's list is React Aria's GridList with its drag and drop (RouteGrid,
// the stock audit's W3): a point's grip dragged by a mouse, the browser's
// own drag, and let go at the top of another point's row puts it before
// that point, the stock line between the rows showing where. The
// keyboard's is React Aria's: Enter on the grip picks it up, the arrow
// keys go from one place between the points to the next, Enter puts it
// down there. The route box's pills are not dragged (their menu moves
// them, below).
test("a point's grip in FPL's list moves it anywhere, by a mouse or the keyboard, the ends too: before the departure it is the departure", async ({
  page,
}) => {
  await page.route(
    (url) => /\/(checkpoints|navlog|briefing)$/.test(url.pathname),
    (route) => route.abort(),
  );
  await page.goto("/app/plan?dep=C81&dest=KDLH&stops=KRYV,KMSN");
  await settle(page);
  await openPanel(page);
  await openRoute(page);
  const list = sideDrawer(page).getByTestId("procedures");
  const row = (ident: string) =>
    list
      .getByRole("row")
      .filter({ has: page.locator(`[data-ident="${ident}"]`) })
      .first();
  const grip = (ident: string) => list.locator(`[data-testid=route-grip][data-ident="${ident}"]`);

  // KDLH's grip let go at the top of C81's row: before it, the departure.
  // Its row under half's edge, reached by pulling the sheet up, as a
  // pilot's finger would: half way the sheet's body does not scroll there.
  await inSheet(page, row("KDLH"));
  const target = (await row("C81").boundingBox())!;
  // By the row, at its end where its chevron is: React Aria's GridList
  // leaves the drag button to the keyboard (out of sight since the owner's
  // "replace three lines with the arrow", 2026-11-19) and lets the row be
  // dragged.
  const chevron = list.locator('[data-testid=timeline-line][data-ident="KDLH"] [data-testid=timeline-chevron]');
  const [from, on] = [(await row("KDLH").boundingBox())!, (await chevron.boundingBox())!];
  await row("KDLH").dragTo(row("C81"), {
    sourcePosition: { x: on.x - from.x + on.width / 2, y: on.y - from.y + on.height / 2 },
    targetPosition: { x: target.width / 2, y: 4 },
  });
  await expect(page).toHaveURL(/[?&]dep=KDLH(&|$)/);
  await expect(page).toHaveURL(/[?&]dest=KMSN(&|$)/);
  await expect(page).toHaveURL(stopsAre("C81,KRYV"));

  // KDLH, the departure now, picked up by the keyboard and put down after
  // the destination, KMSN.
  await grip("KDLH").focus();
  await page.keyboard.press("Enter");
  const at = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
  for (let i = 0; i < 12 && !/after .*KMSN/i.test(await at()); i++) await page.keyboard.press("ArrowDown");
  expect(await at()).toMatch(/after .*KMSN/i);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/[?&]dep=C81(&|$)/);
  await expect(page).toHaveURL(/[?&]dest=KDLH(&|$)/);
  await expect(page).toHaveURL(stopsAre("KRYV,KMSN"));
});

// My Location starts or ends the route, never a stop on the way (the
// owner, 2026-11-17 and 2026-11-18): put down between two points, the
// drop is refused, the list stays as it was, and why is said under it,
// in place (lib/problems), not in a toast.
test("My Location put down in the middle of the route stays where it was, and its line says why", async ({ page }) => {
  await page.route(
    (url) => /\/(checkpoints|navlog|briefing)$/.test(url.pathname),
    (route) => route.abort(),
  );
  await page.goto("/app/plan?dep=@42.2333,-87.9883&stops=KMSN&dest=KDLH");
  await settle(page);
  await openPanel(page);
  await openRoute(page);
  const list = sideDrawer(page).getByTestId("procedures");
  const grip = list.getByTestId("route-grip").first();
  await expect(list.getByTestId("timeline-ident").first()).toHaveText("My Location");
  await grip.focus();
  await page.keyboard.press("Enter");
  const at = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
  for (let i = 0; i < 12 && !/between .*KMSN.* and .*KDLH/i.test(await at()); i++) await page.keyboard.press("ArrowDown");
  expect(await at()).toMatch(/between .*KMSN.* and .*KDLH/i);
  await page.keyboard.press("Enter");
  await expect(list.getByTestId("timeline-refusal").first()).toHaveText("My Location can only start or end the route.");
  await expect(list.getByTestId("timeline-ident")).toHaveText(["My Location", "KMSN", "KDLH"]);
  await expect(page).toHaveURL(/[?&]dest=KDLH(&|$)/);
  await expect(page).toHaveURL(stopsAre("KMSN"));
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
    await openRoute(page);
    const lines = sideDrawer(page).getByTestId("route-slide");
    const stop = lines.getByRole("group", { name: "Stop 1 KRYV" });
    // Held past the menu's half second and let go where it was put down.
    const letGo = await touchHold(page, stop, stop);
    await expect(page.getByRole("menuitem", { name: "Remove", exact: true })).toBeVisible();
    await letGo();
    await page.getByRole("menuitem", { name: "Move Down", exact: true }).click();
    await expect(page).toHaveURL(stopsAre("KMSN,KRYV"));
  });
});
