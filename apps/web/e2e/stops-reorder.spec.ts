import { test, expect, type Locator, type Page } from "@playwright/test";
import { inSheet, openPanel, openRoute, settle, sideDrawer, timelineLine } from "./helpers";
import { stopsAre } from "./stopsParam";

/** FPL's list once its drag and drop is in: the rows are drawn at once and
 *  turned into React Aria's GridList when its chunk has come, two seconds
 *  after the route has drawn or at the list's first touch (RouteGrid), as
 *  a pilot's list is by the time a finger or the keyboard picks a point
 *  up. A drag begun on the plain rows is no drag. */
const draggable = (page: Page) =>
  expect(sideDrawer(page).locator("[data-drag-ready] [data-testid=procedures]")).toBeVisible({ timeout: 30_000 });

/** The keyboard on a point's grip, once the list has settled to it: a
 *  focus given as the list was drawn anew went to its last row instead
 *  (CI's desktop project), and Enter there picked nothing up. */
async function onGrip(grip: Locator) {
  await expect(async () => {
    await grip.focus();
    await expect(grip).toBeFocused({ timeout: 500 });
  }).toPass();
}

/**
 * The route's points moved, by a mouse or the keyboard in FPL's list
 * (React Aria's GridList drag and drop), or a stop's menu (Move Up and
 * Move Down, for a pilot who cannot drag, WCAG 2.5.7): split from
 * stops.spec at its size budget.
 */

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
  await draggable(page);

  // KDLH's grip let go at the top of C81's row: before it, the departure.
  // Its row under half's edge, reached by pulling the sheet up, as a
  // pilot's finger would: half way the sheet's body does not scroll there.
  await inSheet(page, row("KDLH"));
  // And C81's row's top brought out from under FPL's head row, which sticks
  // at the sheet's top over a route taller than the sheet (each field open
  // to its runways and procedures, since "option D" rows on the line of
  // their own), as a finger scrolls before it drags: the drop's point
  // under that row made Playwright scroll the list to reach it after the
  // press, and KMSN, under the pressed point by then, went first.
  await row("C81").evaluate((el) => {
    el.scrollIntoView({ block: "start" });
    let scroller = el.parentElement;
    while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    if (!scroller) return;
    const heads = [...scroller.querySelectorAll<HTMLElement>("*")].filter(
      (e) => !e.contains(el) && getComputedStyle(e).position === "sticky",
    );
    const under = Math.max(scroller.getBoundingClientRect().top, ...heads.map((e) => e.getBoundingClientRect().bottom));
    scroller.scrollTop -= under + 8 - el.getBoundingClientRect().top;
  });
  await expect(row("C81")).toBeInViewport();
  await expect(row("KDLH")).toBeInViewport();
  const target = (await row("C81").boundingBox())!;
  // By the row, sixteen in from its end: React Aria's GridList leaves the
  // drag button to the keyboard (out of sight since the owner's "replace
  // three lines with the arrow", 2026-11-19) and lets the row be dragged.
  const from = (await row("KDLH").boundingBox())!;
  await row("KDLH").dragTo(row("C81"), { sourcePosition: { x: from.width - 16, y: 22 }, targetPosition: { x: target.width / 2, y: 4 } });
  await expect(page).toHaveURL(/[?&]dep=KDLH(&|$)/);
  await expect(page).toHaveURL(/[?&]dest=KMSN(&|$)/);
  await expect(page).toHaveURL(stopsAre("C81,KRYV"));

  // KDLH, the departure now, picked up by the keyboard and put down after
  // the destination, KMSN.
  await onGrip(grip("KDLH"));
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
  await draggable(page);
  await expect(list.getByTestId("timeline-ident").first()).toHaveText("POS0");
  await onGrip(grip);
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

  // A finger moves a stop without a drag (WCAG 2.5.7): FPL's timeline
  // keeps a row's hold for its drag (React Aria's GridList), so the stop's
  // menu is a tap on its mark, the airport symbol (PointMenu), and its
  // Move Down puts it a place later. The route box's pills, held for the
  // same menu before, show only while a route is typed (decision 0046).
  test("a stop's mark tapped opens its menu, whose Move Down moves the stop a place without a drag", async ({ page }) => {
    await page.route(
      (url) => /\/(checkpoints|navlog|briefing)$/.test(url.pathname),
      (route) => route.abort(),
    );
    await page.goto("/app/plan?dep=C81&dest=KDLH&stops=KRYV,KMSN");
    await settle(page);
    await openPanel(page);
    await openRoute(page);
    const mark = timelineLine(page, "KRYV").getByRole("button", { name: "KRYV: more", exact: true });
    await mark.scrollIntoViewIfNeeded();
    await mark.tap();
    await expect(page.getByRole("menuitem", { name: "Remove", exact: true })).toBeVisible();
    await page.getByRole("menuitem", { name: "Move Down", exact: true }).tap();
    await expect(page).toHaveURL(stopsAre("KMSN,KRYV"));
    await expect(sideDrawer(page).getByTestId("timeline-ident")).toHaveText(["C81", "KMSN", "KRYV", "KDLH"]);
  });
});
