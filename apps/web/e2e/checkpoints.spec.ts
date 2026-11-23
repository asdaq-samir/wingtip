import { test, expect, type Locator } from "@playwright/test";
import {
  slow,
  settle,
  mapStill,
  drawn,
  sideDrawer,
  openBrief,
  briefPage,
  openTab,
  grabberTo,
  panelTabs,
  openNavLog,
  closeNavLog,
  navLogScroller,
  navLogSheet,
  settled,
  openPanel,
} from "./helpers";
import { drawnMarks } from "./marks";
import { pickAirplane } from "./startState";
import { steady } from "./pacing";
test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

/**
 * The nav log's checkpoints: selected by a click, by Enter or by a pick
 * on the map, brought into view without moving the one tapped, the
 * log scrolling inside the drawer, and the fields a phone types in.
 */

test("plan page: a click or Enter selects a nav log checkpoint, with the briefing drawer open over the map", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
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
  await expect(page.getByTestId("navlog-ete")).toBeAttached({ timeout: slow(120000) });
  const selectedRow = table.locator('[role="row"][data-selected]');
  await expect(selectedRow).toHaveCount(0);

  // Each row led by its point's mark as the map draws it: the fields'
  // symbols at the ends, the checkpoints' dots numbered as the map's are,
  // from 1 in the order flown, and a top of climb's tag.
  // The whole list once the card has come up: as it rises the card draws
  // its first screen of rows alone, the rest after its ease (NavLogList's
  // FIRST_ROWS, useCardUp; the speed audit of 2026-11-21), so a list read
  // mid-ease ended at its twelfth row, a checkpoint.
  const readMarks = () =>
    table
      .locator('[role="row"][tabindex="0"] [data-mark]')
      .evaluateAll((els) => els.map((e) => [e.getAttribute("data-mark") ?? "", (e.textContent ?? "").trim()] as const));
  await expect.poll(async () => (await readMarks()).at(-1)?.[0], { timeout: slow(5000) }).toBe("airport");
  const marks = await readMarks();
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
  // Reached as a finger would: the card opens half way, its rows under
  // its edge reached by pulling it up, not by scrolling (6d7eba6d7), and
  // the click had landed on the page under the cut-off body.
  await grabberTo(page, "full");
  await settled(page.locator("[data-sheet-card][data-open]").last());
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
  // Its page cards past the half card's foot: all the way up, as a finger
  // takes it (as briefing.spec does).
  await grabberTo(page, "full");
  await briefPage(page, "En Route");
  const tabs = panelTabs(page).getByRole("tab");
  const enRoute = panelTabs(page).getByRole("tab", { name: "En Route" });
  // Pressed once the tabs know it is the one with the focus: the stock
  // roving tabindex, 0 on that tab. Focused in the moment the tab list
  // mounts, before it has its tabs, the focus went unnoticed and an arrow
  // went from the first tab, to Depart (traced 3 of 8, the night of
  // 2026-11-19), which no key from a person comes fast enough to meet: so
  // focused again until the list has taken it.
  await expect(async () => {
    await enRoute.focus();
    await expect(enRoute).toHaveAttribute("tabindex", "0", { timeout: 500 });
  }).toPass({ timeout: slow(10_000) });
  await page.keyboard.press("ArrowRight");
  await expect(tabs.filter({ hasText: "Arrive" })).toBeFocused();
});

/** A nav log row's name: a phone's list's row header, a desktop table's
 *  Waypoint cell. */
const nameOf = (row: Locator) => row.getByRole("rowheader").or(row.getByTestId("navlog-row-waypoint"));

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
    await openPanel(page);
    // The Nav Log open over FPL, lowered to half, the route's map above it:
    // a pick on the map selects its row while the pick's card is up, and
    // the card's close puts the selection away with its ring (rules.md §14,
    // the owner, 2026-11-18), where the pick outlived its card before.
    await openNavLog(page);
    const table = page.getByRole("table", { name: /Navigation log from/i });
    await expect(table.locator('[role="row"][data-kind="checkpoint"]').first()).toBeVisible({ timeout: slow(60_000) });
    await grabberTo(page, "half");
    const logCard = page.locator("[data-sheet-card]").filter({ has: navLogSheet(page) });
    const card = (await logCard.boundingBox())!;
    // A checkpoint late on the route, so the log has rows above it: one
    // the map shows clear of the card -- above a phone's, beside a
    // desktop's side panel, which runs the window's height -- as its
    // badges give way to each other and a phone's view leaves some out
    // until closer in (MapLibre's collision).
    const late = async () =>
      (await drawnMarks(page, "route-marks")).find(
        (m) => m.kind === "checkpoint" && Number(m.text) >= 8 && (m.y < card.y - 16 || m.x > card.x + card.width + 16),
      ) ?? null;
    await mapStill(page);
    await expect.poll(late, { timeout: slow(30_000) }).not.toBeNull();
    const mark = (await late())!;
    await page.mouse.click(mark.x, mark.y);
    // Its card over the log's, the one picked.
    const pickCard = page.locator("[data-sheet-card][data-open]").last();
    await expect(pickCard).toContainText(`Checkpoint ${mark.text}`);
    const selectedRow = table.locator('[role="row"][data-selected]');
    await expect(selectedRow).toHaveCount(1);
    const scroller = navLogScroller(page);
    const middle = async () => {
      const row = (await selectedRow.boundingBox())!;
      const view = (await scroller.boundingBox())!;
      return Math.abs(row.y + row.height / 2 - (view.y + view.height / 2)) / view.height;
    };
    // Its row brought to within a quarter of the scroller's height of its
    // middle, where it used to come to rest at the bottom edge
    // (scrollIntoView "nearest"), the last line in sight.
    await expect.poll(middle, { timeout: slow(10000) }).toBeLessThan(0.25);
    const rows = table.locator('[role="row"][tabindex="0"]');
    const index = await selectedRow.evaluate((row) =>
      // A phone's list is a role="table"; a desktop's log a native <table>.
      Array.from(row.closest('table, [role="table"]')!.querySelectorAll('[role="row"][tabindex="0"]')).indexOf(row),
    );
    // The card's close: the pick put away, its row's selection with it.
    await pickCard.getByTestId("sheet-card-close").click();
    await expect(selectedRow).toHaveCount(0);
    // The log all the way up for the rest, come to rest first: still
    // moving, it carried the row clicked with it (2026-11-13).
    await grabberTo(page, "full");
    await settled(logCard);

    // The row above it, in view beside it, clicked: selected, and
    // nothing moves. Clicked on its name, where a finger would.
    const neighbour = rows.nth(index - 1);
    // In view whole first, as the claim is about: centred to within a
    // quarter of the middle, the row above can sit half under the top
    // edge on a phone -- or under the table's sticky heading, below the
    // tabs -- and a row half out of view is rightly brought in.
    await neighbour.evaluate((row) => row.scrollIntoView({ block: "center" }));
    // Where the row is in the log's window, which is the claim: not the
    // scroller's offset, which the browser moves itself to keep what is
    // on screen still (scroll anchoring) while the legs still streaming
    // in give a row above a second line -- 22 px, on a CI phone. Nor the
    // screen's: a row picked brings the map to its point above the card's
    // half detent (rules.md §14.5), the card and its scroller lowered with
    // the row in it.
    const onScreen = async () => (await neighbour.boundingBox())!.y - (await scroller.boundingBox())!.y;
    // Read once the scroll has come to rest, not after a time slept.
    const before = await steady(onScreen, { gap: 200 });
    // Its name before the click: `neighbour` is a place in the list, read
    // again at each use.
    const name = (await nameOf(neighbour).textContent()) ?? "";
    await nameOf(neighbour).click();
    // By its name.
    await expect(nameOf(selectedRow.first())).toHaveText(name);
    // Where it comes to rest: a move that came back would be seen as one.
    expect(Math.abs((await steady(onScreen)) - before)).toBeLessThan(2);

    // Another tab and back: the selection kept, its row brought into view.
    await closeNavLog(page);
    await openTab(page, "Weather");
    await expect(sideDrawer(page).getByRole("heading", { name: "Adverse Conditions" })).toBeVisible();
    await openNavLog(page);
    await expect(selectedRow).toBeInViewport();
    // The log all the way up, as a finger takes it, and the row brought to
    // its middle, clear of the card's head over the scroller.
    await grabberTo(page, "full");
    await settled(logCard);
    await neighbour.evaluate((row) => row.scrollIntoView({ block: "center" }));

    // The selected row clicked again: deselected, and its note closed.
    await expect(selectedRow).toHaveAttribute("data-expanded", "true");
    await nameOf(neighbour).click();
    await expect(selectedRow).toHaveCount(0);
    await expect(table.locator('[role="row"][data-expanded="true"]')).toHaveCount(0);
  },
);

test("plan page: the briefing's nav log scrolls inside the drawer, not the page", async ({ page }) => {
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);

  // The nav log is its own card over FPL (decision 0047), its legs in its
  // own scroller; FPL's sheet holds the route's timeline.
  await openNavLog(page);
  const scroller = navLogScroller(page);
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
  if (!viewport || viewport.width >= 660) return; // `md` and up keep the small type
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  await openPanel(page);
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
