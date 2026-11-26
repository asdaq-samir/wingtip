import { test, expect } from "@playwright/test";
import {
  controlsInSight,
  settle,
  sideDrawer,
  sheetFoot,
  slow,
  openNavLog,
  navLogSheet,
  navLogScroller,
  closeNavLog,
  grabberTo,
} from "./helpers";
import { pickAirplane } from "./startState";
test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

// A route's handler still running as the test ends -- the Recents and
// Saved planned ahead at idle ask the planner then -- found the page
// closed and failed the test (navlog-fit.spec, CI, 2026-10-28): the
// handlers taken off, their errors let go, as each test ends.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

/**
 * The nav log fits a phone's panel, with a departure time's ETA as its
 * sixth column, a cruise in five figures, and waypoint names with words
 * longer than its column -- where the browser cannot hyphenate them (the
 * test's Chromium has no hyphenation dictionary, and CI's audit found the
 * table seven points wider than its panel for "Meadowbrook" at 10,500 ft).
 * The planner's own answers, renamed and raised.
 */

// An iPhone 16 Pro, touch: the figures at a finger's 15 points.
test.use({ viewport: { width: 402, height: 874 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });

const LONG = [
  "River near Meadowbrookshire",
  "Alexander Fld South Wood County (ISW)",
  "Road or railway near Hawthorneville",
  "Snow Crest Ranch (0WI4)",
  "Wisconsinrapidsburg Municipal",
];

test("the nav log fits a phone's panel with long names, five-figure altitudes and an ETA column", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 660, "a phone's panel");
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/checkpoints"),
    async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      json.selected = (json.selected as { name: string }[]).map((c, i) => ({ ...c, name: LONG[i % LONG.length] }));
      await route.fulfill({ response, json });
    },
  );
  await page.route(
    (url) => url.pathname.endsWith("/api/planner/navlog"),
    async (route) => {
      const response = await route.fetch();
      const body = (await response.text())
        .split("\n")
        .map((line) => {
          if (!line.trim()) return line;
          const message = JSON.parse(line);
          if (message.type === "leg" || message.type === "altitude") message.altitude_ft = 10500;
          return JSON.stringify(message);
        })
        .join("\n");
      await route.fulfill({ response, body });
    },
  );
  const depart = new Date(Date.now() + 26 * 3600_000).toISOString().slice(0, 16);
  await page.goto(`/app/plan?dep=C81&dest=KDLH&depart=${encodeURIComponent(depart)}&view=full`);
  await settle(page);
  await expect(page.getByTestId("navlog-ete")).toBeVisible({ timeout: slow(120000) });
  await openNavLog(page);
  const scroller = navLogScroller(page);
  const log = navLogSheet(page).getByTestId("navlog-list");
  await expect(log.locator('[role="row"][data-kind]').first()).toBeVisible();
  await expect(log).toContainText("10,500");
  // Every row's time, the departure's the time picked, all on the
  // drawer's width: nothing past its side.
  await expect(log.getByTestId("navlog-row-eta").first()).toHaveText(/^\d\d:\d\d$/);
  // The right-hand column named over it, the time over the groundspeed,
  // and each row's groundspeed its figure alone under "GS kt", lined up
  // as the times are (the design review, 2026-10-28).
  const heads = log.getByTestId("navlog-list-heads");
  await expect(heads).toHaveText(/ETA \S+\s*GS kt/);
  const speeds = log.getByTestId("navlog-row-gs");
  await expect(speeds.nth(1)).toHaveText(/^\d+$/);
  const rightEdges = await log
    .locator('[data-testid="navlog-row-eta"], [data-testid="navlog-row-gs"]')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().right)));
  expect(new Set(rightEdges).size).toBe(1);
  const overflow = await scroller.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(scroller.locator('[data-testid="section-tabs"]')).toHaveCount(0);
  await closeNavLog(page);
  await controlsInSight(page);
});

test("a long trip's figures keep their full size on one line in the strip, exact, nothing cut or over the screen", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 660, "a phone's panel");
  // The pilot's iPhone, 393 points wide.
  await page.setViewportSize({ width: 393, height: 852 });
  // Chicago to Las Vegas, over 1,300 nm, with no legal altitude: the
  // book's figures, rounded, were still too wide for a phone's quarter
  // of the strip at a larger text size and cut to "131…", "≈12.…" and
  // "≈10…" (2026-10-11).
  await page.route(
    (url) => url.pathname.startsWith("/api/planner/navlog"),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body:
          [
            { type: "stage", detail: "Planning cruise altitudes…" },
            {
              type: "error",
              retry: false,
              detail: "No legal VFR cruising altitude 830-858 nm along the route",
              brief: "Aircraft ceiling restricts mountainous flying",
              reasons: ["The aircraft's service ceiling stops at 11,700 ft."],
              advice: "Route around the high ground, or set a cruise altitude of your own to plan it anyway.",
            },
          ]
            .map((m) => JSON.stringify(m))
            .join("\n") + "\n",
      }),
  );
  await page.goto("/app/plan?dep=C81&dest=KLAS");
  await controlsInSight(page);
  await expect(sideDrawer(page).getByTestId("altitude-why")).toHaveAccessibleName(/no legal altitude/, { timeout: slow(30000) });
  await expect(sheetFoot(page).getByTestId("navlog-ete")).toHaveText(/^≈/);
  const figures = sheetFoot(page).getByTestId("flight-line").locator("dd");
  // Its unit after a no-break space, the Dist a button to the nav log
  // (TripFigures): whole miles with their thousands' comma, as every
  // summary writes them (the owner's list, 2026-11-17).
  await expect(figures.filter({ hasText: /\snm$/ }).first()).toHaveText(/^1,\d{3}\snm$/);
  // At the pill, where the pinned strip is its full size: above it, at half
  // and all the way up, FPL's strip is thin, its figures smaller by design
  // (owner-bugs' thin strip, the owner, 2026-11-22: "thin figures strip at
  // half and full", growing to the pill's as the sheet comes down).
  await grabberTo(page, "peek");
  // At the default text size and the two above it, as an iPhone sets the
  // root from Settings' text size (features/shell/dynamicType, which a test browser
  // does not run): a 19-point Body, 17.88 px; a 21-point one, held to the
  // 393-point screen's 19.65. Every figure the same size and that size the
  // root's own (a long one never set smaller than a short one, the owner,
  // 2026-11-21), the figures exact (no rounded "16.0h"), none cut short
  // and nothing past the screen's side (FigureStrip).
  for (const root of ["", "17.88px", "19.65px"]) {
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = size;
    }, root);
    // To a tenth of a pixel: the grid's columns come out a 64th of a pixel
    // apart (its sub-pixel layout), and each column's size with them, which
    // no eye tells apart ("18.2684px" and "18.2719px" at 17.88).
    const sizes = () =>
      figures.evaluateAll((dds) =>
        dds.map((dd) => Math.round(parseFloat(getComputedStyle(dd.querySelector("[data-figure]") ?? dd).fontSize) * 10) / 10),
      );
    await expect.poll(async () => new Set(await sizes()).size, { message: `one size at a root of ${root || "16px"}` }).toBe(1);
    const [size] = await sizes();
    expect(size, `at a root of ${root || "16px"}`).toBeGreaterThanOrEqual(20 * (parseFloat(root || "16px") / 16) - 0.1);
    const cut = await figures.evaluateAll(
      // A button's dd does not clip (its 44-point area reaches past it): its run is what is cut.
      (dds) =>
        dds.map((dd) => dd.querySelector<HTMLElement>("span.truncate") ?? dd).filter((el) => el.scrollWidth > el.clientWidth + 1).length,
    );
    expect(cut, `figures cut short at a root of ${root || "16px"}`).toBe(0);
    await expect(sheetFoot(page).getByTestId("navlog-ete")).not.toHaveText(/\d\.\dh$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("each row's miles over its groundspeed come to its minutes, a pattern's miles said where the leg ends", async ({ page }) => {
  // The FPL audit's A4 (2026-11-08): KUGN's first checkpoint read "1.5 nm ·
  // 3.4 min" at 86 kt -- a minute's flying -- the pattern departure's 3.4 nm
  // and 2.3 min in its minutes and not its miles. And A5: the rows now add
  // up to the strip's distance, which counts the patterns.
  // The phone's list says the miles and minutes in words; a desktop's
  // table has them in columns (nav-log-desk.spec).
  test.skip((page.viewportSize()?.width ?? 0) >= 1024, "the phone's list");
  await page.goto("/app/plan?dep=KUGN&dest=KOSH&pattern=KUGN%3A23%2CKOSH%3A27");
  await settle(page);
  await expect(page.getByTestId("navlog-ete")).toBeVisible({ timeout: slow(120000) });
  await openNavLog(page);
  const log = navLogSheet(page).getByTestId("navlog-list");
  await expect(log.locator('[role="row"][data-kind="destination"]')).toBeVisible();
  // Each row's figures in, as a pilot reads them: the rows are drawn as the
  // plan's legs stream in, each "Working out" till its own comes (FigureWait),
  // and read before then a row said no miles at all (CI's desktop project).
  await expect(log.getByTestId("figure-wait")).toHaveCount(0, { timeout: slow(60_000) });
  const rows = await log
    .locator('[role="row"][data-kind]:not([data-kind="departure"])')
    .evaluateAll((els) =>
      els.map((el) => ({
        nm: Number(/([\d.]+) nm/.exec(el.querySelector('[data-testid="navlog-row-dist"]')?.textContent ?? "")?.[1]),
        min: Number(/([\d.]+) min/.exec(el.textContent ?? "")?.[1]),
        gs: Number(el.querySelector('[data-testid="navlog-row-gs"]')?.textContent),
        said: el.querySelector('[data-testid="navlog-row-dist"]')?.textContent ?? "",
      })),
    );
  for (const row of rows) {
    if (!(row.gs > 0)) continue;
    // The rows' own rounding: a tenth of a mile and of a minute.
    expect(Math.abs((row.nm / row.gs) * 60 - row.min), JSON.stringify(row)).toBeLessThanOrEqual(0.3);
  }
  expect(rows.some((r) => /incl\. (departure|pattern)/.test(r.said))).toBe(true);
  await closeNavLog(page);
});

test("the airplane and the altitude stay on the first row's line, the page toggle at its end, at the owner's 19.65 px text", async ({
  page,
}) => {
  // The FPL audit's A3 (2026-11-08): at 19.65 px the three round buttons
  // wrapped onto a line of their own under N-_____ and FL-0xx.
  test.skip((page.viewportSize()?.width ?? 0) >= 660, "a phone's panel");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/plan?dep=C81&dest=KDLH");
  await settle(page);
  // A route's link opens at rest, the pill (layout.spec): the route's
  // line all the way up, where its buttons are.
  await controlsInSight(page);
  for (const root of ["17.88px", "19.65px"]) {
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = size;
    }, root);
    const chip = sideDrawer(page).getByTestId("aircraft-select");
    // The route's ••• is the floating bar's once there is a route
    // (FplTabBar), and VFR/IFR the Profile card's (2026-11-17): the line is
    // the airplane and the altitude, the page toggle at its end.
    const actions = sideDrawer(page).getByTestId("altitude-group");
    await expect(actions).toBeVisible({ timeout: slow(30000) });
    await expect
      .poll(
        async () => {
          const [a, b] = [await chip.boundingBox(), await actions.boundingBox()];
          return a && b ? Math.abs(a.y + a.height / 2 - (b.y + b.height / 2)) < 8 : false;
        },
        { message: `on one line at ${root}` },
      )
      .toBe(true);
  }
});
