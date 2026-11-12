import { test, expect } from "@playwright/test";
import {
  slow,
  settle,
  mapStill,
  drawn,
  sideDrawer,
  openBrief,
  briefPage,
  openBriefing,
  openTab,
  grabberTo,
  panelTabs,
  openNavLog,
  closeNavLog,
  navLogScroller,
  navLogSheet,
  settled,
} from "./helpers";
import { drawnMarks, tapMark } from "./marks";
import { pickAirplane } from "./startState";
test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

/**
 * The nav log's checkpoints: selected by a click, by Enter or by a pick
 * on the map, brought into view without moving the one tapped, the
 * log scrolling inside the drawer, and the fields a phone types in.
 */

test("plan page: a click or Enter selects a nav log checkpoint, with the briefing drawer open over the map", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await page.getByTestId("sidebar-trigger-button").click();
  // The nav log, in its own sheet from the route's box.
  await openNavLog(page);
  const table = page.getByRole("table", { name: /Navigation log from/i });
  // The rows arrive with the scored checkpoints; wait for more than
  // the departure and the destination.
  await expect.poll(async () => table.locator('[role="row"][data-kind]').count(), { timeout: slow(15000) }).toBeGreaterThan(4);
  // And the legs: their tops of climb and descent are rows of their own,
  // put in as the legs arrive, and a row counted before them moves.
  // FPL's figure strip has its fuel once they are in, under the Nav Log's
  // card now (95f9e953b: a card of its own over FPL), so in the page, not
  // in sight.
  await expect(page.getByTestId("navlog-fuel")).toBeAttached({ timeout: slow(120000) });
  const selectedRow = table.locator('[role="row"][data-selected]');
  await expect(selectedRow).toHaveCount(0);

  // Each row led by its point's mark as the map draws it: the fields'
  // symbols at the ends, the checkpoints' dots numbered as the map's are,
  // from 1 in the order flown, and a top of climb's tag.
  const marks = await table
    .locator('[role="row"][tabindex="0"] [data-mark]')
    .evaluateAll((els) => els.map((e) => [e.getAttribute("data-mark") ?? "", (e.textContent ?? "").trim()] as const));
  expect(marks[0]![0]).toBe("airport");
  expect(marks.at(-1)![0]).toBe("airport");
  const numbered = marks.filter(([kind]) => kind === "checkpoint").map(([, n]) => Number(n));
  expect(numbered.length).toBeGreaterThan(0);
  expect(numbered).toEqual(numbered.map((_, i) => i + 1));
  expect(marks.some(([kind]) => kind === "toc")).toBe(true);

  // A click selects that row, and the map follows it.
  // The one selected is the row clicked, told by its mark rather than
  // by its words: a leg the clouds leave no altitude on gains its
  // warning when the altitude streams in, after the rows, and a name
  // read before that was compared with one read after.
  const rows = table.locator('[role="row"][tabindex="0"]');
  await rows.nth(2).click();
  await expect(selectedRow).toHaveCount(1);
  await expect(rows.nth(2)).toHaveAttribute("data-selected");

  // From the keyboard the same way, and with nothing this page binds
  // on the document: a row is focusable and takes Enter itself
  // (`SelectableRow`). The drawer is non-modal and the map is mounted
  // beside it, so this works with the briefing open.
  await rows.nth(1).focus();
  await page.keyboard.press("Enter");
  await expect(rows.nth(1)).toHaveAttribute("data-selected");
  await expect(selectedRow).toHaveCount(1);

  // The Brief's tabs take the stock tabs' own arrows, Right to the next:
  // Arrive, after En route.
  await closeNavLog(page);
  await openBrief(page);
  await briefPage(page, "En route");
  const tabs = panelTabs(page).getByRole("tab");
  await panelTabs(page).getByRole("tab", { name: "En route" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.filter({ hasText: "Arrive" })).toBeFocused();
});

test(
  "plan page: a checkpoint picked on the map is brought to the middle of the nav log, and a row clicked in view stays put",
  { tag: "@smoke" },
  async ({ page }) => {
    // The runways the pilot's own (auto=-), so none is picked into the wind:
    // that pick plans the route again a moment after its log first shows,
    // and the log written anew moved the rows under the test -- the row
    // clicked 52 px down, and the row above the selected one another
    // checkpoint (CI, 2026-10-28). Which rows stay put is the claim here,
    // not the wind's runway.
    await page.goto("/app/plan?dep=C81&dest=KDLH&pattern=C81:9,KDLH:27&auto=-");
    await settle(page);
    // A checkpoint late on the route, so the log has rows above it: one
    // the map shows, as its badges now give way to each other and a
    // phone's view leaves some out until closer in (MapLibre's collision).
    await tapMark(page, "route-marks", /^(?:[89]|1\d)$/);
    // On a phone its card comes up in the map's sheet over the route
    // (MapPopup): put away, the pick kept, for the route's box under it.
    if (page.viewportSize()!.width < 768) {
      const card = page.locator("[data-sheet-card]");
      await expect(card).toBeVisible();
      // Its own close in its head, the tabs static over it.
      await card.getByTestId("sheet-card-close").click();
      await expect(card).toHaveCount(0);
    }

    // Then a short window, so the nav log has to scroll: the row used to
    // come to rest at the bottom edge (scrollIntoView "nearest"), the
    // last visible line when the drawer was opened after the pick. (The
    // pick first, at full height: at 420px a phone's map is too short
    // for a marker along the route to be clicked.)
    const viewport = page.viewportSize()!;
    // 462, not the 420 this was written at: there a scroller left under the
    // route's head and the table's sticky heading was too short for a row
    // to stay put.
    await page.setViewportSize({ width: viewport.width, height: 462 });
    // A resize starts no animation for settled() to wait on, so the drawer
    // is waited on until it fits the new height.
    await expect.poll(async () => (await sideDrawer(page).boundingBox())?.height ?? Infinity).toBeLessThanOrEqual(462);
    await settled(sideDrawer(page));
    await grabberTo(page, "full");
    // The nav log opened from the route's box shows the pick, brought in.
    await openNavLog(page);
    const table = page.getByRole("table", { name: /Navigation log from/i });
    await expect(table).toBeVisible();
    const selectedRow = table.locator('[role="row"][data-selected]');
    await expect(selectedRow).toHaveCount(1);
    const scroller = navLogScroller(page);
    const middle = async () => {
      const row = (await selectedRow.boundingBox())!;
      const view = (await scroller.boundingBox())!;
      return Math.abs(row.y + row.height / 2 - (view.y + view.height / 2)) / view.height;
    };
    // Within a quarter of the scroller's height of its middle.
    // Once the drawer has come all the way up and stood still, which on a
    // busy phone is more than a few seconds.
    await expect.poll(middle, { timeout: slow(10000) }).toBeLessThan(0.25);

    // The row above it, in view beside it, clicked: selected, and
    // nothing moves. Clicked on its name, where a finger would.
    const rows = table.locator('[role="row"][tabindex="0"]');
    const index = await selectedRow.evaluate((row) =>
      Array.from(row.closest('[role="table"]')!.querySelectorAll('[role="row"][tabindex="0"]')).indexOf(row),
    );
    const neighbour = rows.nth(index - 1);
    // In view whole first, as the claim is about: centred to within a
    // quarter of the middle, the row above can sit half under the top
    // edge on a phone -- or under the table's sticky heading, below the
    // tabs -- and a row half out of view is rightly brought in.
    await neighbour.evaluate((row) => row.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(200);
    // Where the row is on the screen, which is the claim: not the
    // scroller's offset, which the browser moves itself to keep what is
    // on screen still (scroll anchoring) while the legs still streaming
    // in give a row above a second line -- 22 px, on a CI phone.
    const onScreen = async () => (await neighbour.boundingBox())!.y;
    const before = await onScreen();
    // Its name before the click: `neighbour` is a place in the list, read
    // again at each use.
    const name = (await neighbour.getByRole("rowheader").textContent()) ?? "";
    await neighbour.getByRole("rowheader").click();
    // By its name.
    await expect(selectedRow.first().getByRole("rowheader")).toHaveText(name);
    await page.waitForTimeout(400);
    expect(Math.abs((await onScreen()) - before)).toBeLessThan(2);

    // Another tab and back: the selection kept, its row brought into view.
    await closeNavLog(page);
    await openTab(page, "Weather");
    await expect(sideDrawer(page).getByRole("heading", { name: "Adverse Conditions" })).toBeVisible();
    await openNavLog(page);
    await expect(selectedRow).toBeInViewport();
    await neighbour.scrollIntoViewIfNeeded();

    // The selected row clicked again: deselected, and its note closed.
    await expect(selectedRow).toHaveAttribute("data-expanded", "true");
    await neighbour.getByRole("rowheader").click();
    await expect(selectedRow).toHaveCount(0);
    await expect(table.locator('[role="row"][data-expanded="true"]')).toHaveCount(0);
  },
);

test("plan page: the briefing's nav log scrolls inside the drawer, not the page", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);

  await openBriefing(page);
  const scroller = page.getByTestId("navlog-scroller");
  await expect(scroller).toBeVisible();
  await settled(page.locator("body"));

  const pageOverflowing = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(pageOverflowing).toBe(false);

  const info = await scroller.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  // The log a line a point, as wide as the drawer: nothing past its
  // side, the scroller scrolling down alone.
  expect(info.scrollWidth).toBeLessThanOrEqual(info.clientWidth + 1);
});

test("plan page: iOS never zooms the page in on a phone's field: every field but the nav log's notes is 16px", async ({ page }) => {
  // iOS Safari zooms the whole page in when a field under 16px takes
  // focus, and leaves it zoomed once the field blurs and the drawer
  // closes -- with the header and the route form off the top of the
  // screen. The viewport no longer forbids zoom (#265, 2026-11-08), so
  // the fields' own 16px is all that stops it: all but the note box under a nav log row, which is the
  // log's own 12 because the pilot wanted it in proportion to the rows.
  // Chromium never zooms, so the rest is on the computed font size
  // itself, over every field the page can show: the route form, and
  // the nav log's altitude box and description boxes.
  const viewport = page.viewportSize();
  if (!viewport || viewport.width >= 768) return; // `md` and up keep the small type
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await page.getByTestId("sidebar-trigger-button").click();
  // The description boxes are in the nav log's section, closed until
  // its title is clicked, and each under its own row, closed until
  // that row is selected.
  await openNavLog(page);
  const rows = navLogSheet(page).locator('[role="row"][data-kind="checkpoint"]');
  await expect.poll(() => rows.count(), { timeout: slow(15000) }).toBeGreaterThan(0);
  await rows.first().click();
  await expect.poll(() => page.locator("textarea").count(), { timeout: slow(15000) }).toBeGreaterThan(0);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("input, textarea, select")]
      .filter((el) => !el.closest('[data-testid="navlog-list"]'))
      // Only a field in sight can take the focus: one kept out of sight
      // under another tab or a card (TabKept, MapPanel's kept route box)
      // is inert, and laid out at no width, its type its narrowest's.
      .filter((el) => el.checkVisibility())
      .map((el) => ({
        field: el.getAttribute("aria-label") ?? el.getAttribute("placeholder") ?? el.tagName,
        px: parseFloat(getComputedStyle(el).fontSize),
      }))
      .filter((f) => f.px < 16),
  );
  expect(small).toEqual([]);
});

test("plan page: the checkpoints are their numbers at the route's zoom, named in sentence case beside their dots once closer in, none over another and none off the screen", async ({
  page,
}) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  // The names are the chart's own text (RouteGl's checkpoint-names layer),
  // read through its probe: MapLibre places each clear of the others and
  // leaves out one it cannot fit, so none is over another.
  const names = () => drawn(page, "checkpoint-names");
  // The route fitted: its dots numbered and no names, where two dozen dark
  // names covered the chart (the design review, 2026-10-28).
  const dots = async () => (await drawnMarks(page, "route-marks")).filter((m) => m.kind === "checkpoint");
  await expect.poll(async () => (await dots()).length, { timeout: slow(30000) }).toBeGreaterThan(3);
  await mapStill(page);
  expect(await names()).toEqual([]);
  // Closer in, over the first dot, they are named.
  const first = (await dots())[0]!;
  await expect(async () => {
    await page.mouse.move(first.x, first.y);
    await page.mouse.wheel(0, -300);
    await expect.poll(async () => (await names()).length, { timeout: 2500 }).toBeGreaterThan(0);
  }).toPass({ timeout: slow(30000) });
  await mapStill(page);
  const shown = await names();
  // In sentence case, the chart's names for the places ("River near
  // Lenroot"); a field its own name and its ident as written, "Wag-Aero
  // (WI92)" (the owner, 2026-10-24).
  for (const { name } of shown) {
    const text = String(name);
    expect(text).toMatch(/^[A-Z0-9]/);
    expect(text, `${text} in capitals`).toMatch(/[a-z]/);
    const ident = /\(([^)]+)\)$/.exec(text)?.[1];
    if (ident) expect(ident).toMatch(/^[A-Z0-9]+$/);
  }
  // Each beside a dot on the screen, not off it: a dot at the very edge,
  // its middle up to its own radius past it, has its name drawn inward
  // (text-variable-anchor), so the point is allowed that far out.
  const viewport = page.viewportSize()!;
  const DOT_RADIUS = 8;
  for (const { x, y } of shown as { x: number; y: number }[]) {
    expect(x).toBeGreaterThanOrEqual(-DOT_RADIUS);
    expect(x).toBeLessThanOrEqual(viewport.width + DOT_RADIUS);
    expect(y).toBeGreaterThanOrEqual(-DOT_RADIUS);
    expect(y).toBeLessThanOrEqual(viewport.height + DOT_RADIUS);
  }
  // Nor at the route's own airports' marks, nor their idents beside them.
  // Each a field's 26-point mark and its ident's pill to its right
  // (routeMarks), round its point (the probe's, in the page's points; the
  // names' are the map's, the map at the page's top left here).
  const chips = (await drawnMarks(page, "route-marks"))
    .filter((m) => m.kind === "field" && /^(C81|KDLH)$/.test(String(m.text)))
    .map(({ x, y }) => ({ left: x - 13, right: x + 60, top: y - 13, bottom: y + 13 }));
  for (const { x, y, name } of shown as { x: number; y: number; name: string }[]) {
    for (const c of chips) {
      const inside = x > c.left && x < c.right && y > c.top && y < c.bottom;
      expect(inside, `${name} at ${x},${y} under the chip ${JSON.stringify(c)}`).toBe(false);
    }
  }
});
