import { test, expect, type Page, type Route } from "@playwright/test";
import { clearTheRoute, settled as settledLocator, grabberTo, inSheet, openPanel, openRoute } from "./helpers";

/**
 * What a pilot meets when things go wrong, and the toasts that are left.
 *
 * What went wrong is said where it belongs, taking no more room than it
 * must (lib/problems): the planner or a service out is one line beside
 * the map's buttons, a route with no legal altitude says so in its own
 * panel (plans.spec), and a one-off failure is an alert with OK. Every
 * case here is reached by making the planner fail on purpose rather than
 * by waiting for it to: the failure path is the one a pilot hits in the
 * air on a bad connection, and no other test takes it.
 *
 * Each of these is a bug that actually happened. The planner went down
 * and produced a wall of three identical "planner service unreachable"
 * toasts, one per query that hit it. Widening the toasts so they read
 * properly on a phone made them swallow the wheel events meant for the
 * chart underneath. And errors as toasts that stayed, folded to lines,
 * sat over the location arrow and the panel's grabber.
 */

const PLAN = "/app/plan?dep=C81&dest=KDLH";

const banner = (page: Page) => page.locator("[data-problem-banner]");
const toasts = (page: Page) => page.locator("[data-slot=toast]");

/** Fail every planner call with one message, the way a planner that is
 *  simply down does. */
async function plannerDown(page: Page, detail = "planner service unreachable") {
  await page.route("**/api/planner/**", (route: Route) =>
    route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ detail }) }),
  );
}

/** The planner's progress line held up: the course never answers. */
async function holdCourse(page: Page) {
  await page.route("**/api/planner/course**", () => new Promise<void>(() => undefined));
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

/** The problems' words: the one, or each of several, opened to them. */
async function problemTitles(page: Page): Promise<string[]> {
  const title = page.getByTestId("problem-banner-title");
  if (!(await title.isVisible())) return [];
  const text = (await title.textContent()) ?? "";
  if (!/^\d+ problems$/.test(text)) return [text];
  if ((await title.getAttribute("aria-expanded")) !== "true") await title.click();
  return page.locator("[data-problem-item]").allTextContents();
}

/** Come to rest: its moves done (helpers' settled: the progress line's
 *  spinner, which never is, a move cancelled on the way, and what a tab
 *  out of sight holds, left out). */
async function settled(page: Page, selector: string) {
  await settledLocator(page.locator(selector).first());
}

test("a planner that is down says so once, in one line, not once per call", async ({ page }) => {
  // The bug this exists for: the problem was keyed by the query's own
  // hash, so the course, the checkpoints and the nav log each raised one
  // carrying the identical sentence, and they stacked up the screen.
  // Keyed by the message, the three are one -- and never a toast.
  await plannerDown(page);
  await page.goto(PLAN);

  await expect.poll(async () => (await problemTitles(page)).filter((t) => t.includes("unreachable")).length, { timeout: 20000 }).toBe(1);
  await expect(toasts(page).filter({ hasText: "unreachable" })).toHaveCount(0);
});

test("it offers a way out, the way out works, and the line goes with the problem", async ({ page }) => {
  // A failure with no action is just bad news. Try again refetches
  // everything currently in error, so one tap recovers the whole page
  // rather than a third of it; with no close, the line goes when what
  // caused it has.
  await plannerDown(page);
  await page.goto(PLAN);

  const retry = banner(page).getByRole("button", { name: "Try again" });
  await expect(retry).toBeVisible({ timeout: 20000 });
  // The map's one banner (MapBanner): on the map buttons' glass at the
  // banner's corner, a row 44 tall at the least, its glyph, line and
  // action, as every line over the map is.
  const look = await banner(page).evaluate((el) => ({
    glass: el.classList.contains("liquid-glass"),
    radius: getComputedStyle(el).borderTopLeftRadius,
    banner: getComputedStyle(el).getPropertyValue("--radius-banner").trim(),
    height: el.getBoundingClientRect().height,
  }));
  expect(look.glass).toBe(true);
  expect(look.radius).toBe(look.banner);
  expect(look.height).toBeGreaterThanOrEqual(44);

  // The planner comes back.
  await page.unroute("**/api/planner/**");
  await retry.click();
  await expect(banner(page)).toHaveCount(0, { timeout: 30000 });
});

test("two different failures are two problems, counted on the line and listed on a tap", async ({ page }) => {
  // Deduplication is by message, so genuinely different problems must
  // still each get said. Only the identical ones collapse.
  await page.route("**/api/planner/course**", (route: Route) =>
    route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ detail: "planner service unreachable" }) }),
  );
  await page.route("**/api/planner/aircraft-profiles**", (route: Route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "the aircraft store is offline" }) }),
  );
  await page.goto(PLAN);

  await expect(page.getByTestId("problem-banner-title")).toHaveText(/^\d+ problems$/, { timeout: 20000 });
  await expect
    .poll(
      async () => {
        const shown = await problemTitles(page);
        return [shown.some((t) => t.includes("unreachable")), shown.some((t) => t.includes("aircraft store"))];
      },
      { timeout: 15000 },
    )
    .toEqual([true, true]);
});

test("a problem goes with the route it was about", async ({ page }) => {
  // With no close of its own, a problem left behind by a route since
  // closed stayed on the map. A failure of the planner's own, not a
  // place it does not know (a 404, the route box's: below).
  await page.route("**/api/planner/course**", (route: Route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "the course store is offline" }) }),
  );
  await page.goto(PLAN);
  await expect
    .poll(async () => (await problemTitles(page)).some((t) => t.includes("course store is offline")), { timeout: 20000 })
    .toBe(true);

  // The route cleared from the panel, its Share menu's Clear the route.
  await clearTheRoute(page);
  await expect(banner(page)).toHaveCount(0);
});

test("an ident the planner does not know is said on its pill, not the map's line", async ({ page }) => {
  // The FPL audit's A2 (2026-11-08): KZZZ read as any other pill, and the
  // only word was the map's line, cut off, naming the data set. The pilot
  // typed it; it is said where they typed it, with Remove.
  await page.goto("/app/plan?dep=KUGN&dest=KZZZ");
  // Its timeline's line in red with why under it (the one layout), and the
  // route's field open under the timeline, saying it with Remove.
  await openPanel(page);
  const line = page.getByTestId("route-summary").getByTestId("timeline-line").last();
  await expect(line).toContainText("KZZZ", { timeout: 20000 });
  await expect(line.getByTestId("timeline-problem")).toHaveText("isn't an airport or waypoint we know");
  await expect(line.getByTestId("timeline-problem")).toHaveClass(/text-destructive/);
  await openRoute(page);
  const said = page.getByTestId("route-unknown");
  await expect(said).toContainText("KZZZ isn't an airport or waypoint we know", { timeout: 20000 });
  await expect(page.getByTestId("route-dest").locator("[aria-invalid=true]")).toHaveCount(1);
  await expect(banner(page)).toHaveCount(0);
  // The figures' To says it too, in red with its mark, the pill's face at
  // rest; nothing to brief, as nothing to log (the UI audit's B8, 2026-11-17).
  const to = page.getByTestId("flight-line").getByTestId("navlog-to");
  await expect(to).toHaveAttribute("data-alert", "true");
  await expect(to.getByTestId("figure-alert-mark")).toHaveCount(1);
  await expect(page.getByTestId("route-brief")).toBeDisabled();
  // Its Remove reached as a finger would, the sheet pulled up to it (inSheet).
  await inSheet(page, said.getByTestId("route-unknown-remove"));
  await said.getByTestId("route-unknown-remove").click();
  await expect(page).not.toHaveURL(/KZZZ/);
  await expect(said).toHaveCount(0);
});

test("an ident only a field abroad goes by is no destination: no distance, no ways, nothing planned", async ({ page }) => {
  // KORD-KIGN was planned 7,191 nm to Indagen, Papua New Guinea, whose
  // local code is IGN: the planner's K-form fallback reached a field
  // abroad, the strip gave its distance and the Routes row its ways
  // (2026-11-17). KIGN is no US field's: the unknown place, as KZZZ is.
  await page.goto("/app/plan?dep=KUGN&dest=KIGN");
  await openPanel(page);
  await expect(page.getByTestId("route-summary").getByTestId("timeline-problem").last()).toHaveText(
    "isn't an airport or waypoint we know",
    { timeout: 20000 },
  );
  // No ways to suggest, so no button for them: the chips' count below is
  // then no vacuous zero (they render only while the button is on).
  await expect(page.getByTestId("routes-toggle")).toHaveCount(0);
  await openRoute(page);
  const said = page.getByTestId("route-unknown");
  await expect(said).toContainText("KIGN isn't an airport or waypoint we know", { timeout: 20000 });
  await expect(page.getByTestId("flight-line").getByTestId("navlog-to")).toHaveAttribute("data-alert", "true");
  await expect(page.getByTestId("flight-line")).not.toContainText(/\d\s*(nm|nautical)/);
  await expect(page.getByTestId("route-line-chip")).toHaveCount(0);
  await expect(page.getByTestId("route-brief")).toBeDisabled();
});

test("a real field abroad is said to be outside the US charts, not planned", async ({ page }) => {
  // The planner's own words for one (wingtip.airport_lookup OutsideCharts),
  // as it answers for Indagen by its own ident; said on the route box's
  // line and the To, as an unknown place is.
  await page.route(
    (url) => url.pathname.startsWith("/api/planner/") && url.searchParams.get("dest") === "AYID",
    (route: Route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "'AYID' is outside the US charts: Indagen Airport, PG." }),
      }),
  );
  await page.goto("/app/plan?dep=KUGN&dest=AYID");
  await openPanel(page);
  await expect(page.getByTestId("route-summary").getByTestId("timeline-problem").last()).toHaveText("is outside the US charts", {
    timeout: 20000,
  });
  await openRoute(page);
  await expect(page.getByTestId("route-unknown")).toContainText("AYID is outside the US charts", { timeout: 20000 });
  await expect(page.getByTestId("flight-line").getByTestId("navlog-to")).toHaveAttribute("data-alert", "true");
  await expect(banner(page)).toHaveCount(0);
  await expect(page.getByTestId("route-brief")).toBeDisabled();
});

test("the line sits beside the map's buttons, level with them, one line tall, and the location arrow takes its tap", async ({ page }) => {
  // Problems that stayed were folded to lines over the map's buttons, and
  // the location arrow under them was out of reach for as long as they
  // lasted.
  await plannerDown(page);
  await page.goto(PLAN);
  const line = banner(page).getByRole("status");
  await expect(line).toBeVisible({ timeout: 20000 });

  const box = (await line.boundingBox())!;
  const controls = (await page.locator("[data-map-controls]").boundingBox())!;
  if (page.viewportSize()!.width < 768) {
    // A phone: at the top, the buttons riding on the sheet below it
    // (2026-10-26), clear of them.
    expect(box.y + box.height <= controls.y || box.x + box.width <= controls.x).toBe(true);
  } else {
    expect(box.x + box.width).toBeLessThanOrEqual(controls.x);
    const levelTop = Math.abs(box.y - controls.y) <= 1;
    const levelBottom = Math.abs(box.y + box.height - (controls.y + controls.height)) <= 1;
    expect(levelTop || levelBottom).toBe(true);
  }
  expect(box.height).toBeLessThanOrEqual(48);

  const arrow = (await page.getByTestId("my-position-button").boundingBox())!;
  const hit = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest("[data-testid=my-position-button]") !== null,
    [arrow.x + arrow.width / 2, arrow.y + arrow.height / 2],
  );
  expect(hit).toBe(true);
});

test("the panel all the way out goes over the line, and its grabber still lowers it", async ({ page }) => {
  // The line is the map's, under the panel: from the bottom of a phone the
  // sheet all the way out has its grabber at the top of the screen, where
  // a toast came in and a folded one stayed, and the sheet could not be
  // lowered while the problem lasted.
  test.skip(page.viewportSize()!.width >= 768, "a phone's sheet");
  await plannerDown(page);
  await page.goto(PLAN);
  const line = banner(page).getByRole("status");
  await expect(line).toBeVisible({ timeout: 20000 });

  // All the way up, as a drag takes it (the grabber's Up arrow).
  const sheet = page.locator('[data-slot="map-panel"]');
  await grabberTo(page, "full");
  await expect(sheet).toHaveAttribute("data-panel", "full");
  await settled(page, '[data-slot="map-panel"]');

  const box = (await line.boundingBox())!;
  const over = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest('[data-slot="map-panel"]') !== null,
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  expect(over).toBe(true);
  // A tap: down a size, to half (MapPanel's three sizes).
  await page.getByTestId("sidebar-trigger-button").click();
  await expect(sheet).toHaveAttribute("data-panel", "half");
});

test("the progress line spans the screen and is centred on it", async ({ page }) => {
  // On a phone the default 356px card left the screen empty either
  // side while the sentence inside it wrapped to three lines.
  await holdCourse(page);
  await page.goto(PLAN);

  const first = toasts(page).first();
  await expect(first).toBeVisible({ timeout: 15000 });
  await settled(page, "[data-slot=toast]");
  const box = (await first.boundingBox())!;
  const viewport = page.viewportSize()!;

  const leftGap = box.x;
  const rightGap = viewport.width - (box.x + box.width);
  expect(leftGap).toBeGreaterThanOrEqual(8); // a gutter, not edge to edge
  expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(2); // centred
  if (viewport.width < 768) {
    // A phone: the screen's width less a gutter either side, at its top
    // (the map's buttons ride on the sheet since 2026-10-26).
    expect(box.y).toBeLessThan(80);
    expect(box.width).toBeGreaterThan(viewport.width * 0.7);
  }
});

test("a toast sits clear of the panel: at the top of a phone's screen, the bottom of a desktop's", async ({ page }) => {
  // On a phone the panel is a sheet up from the bottom of the screen,
  // and a toast anchored there covered it: it comes in from the top
  // there, as an iOS banner does. From md up the panel is at the top,
  // and the toast comes in from the bottom.
  await holdCourse(page);
  await page.goto(PLAN);

  const first = toasts(page).first();
  await expect(first).toBeVisible({ timeout: 15000 });
  await settled(page, "[data-slot=toast]");
  const box = (await first.boundingBox())!;
  const panel = (await page.locator('[data-slot="map-panel"]').boundingBox())!;
  if (page.viewportSize()!.width < 768) {
    expect(box.y).toBeLessThan(60);
    expect(box.y + box.height).toBeLessThanOrEqual(panel.y);
  } else {
    expect(box.y).toBeGreaterThanOrEqual(panel.y + panel.height);
  }
});

test("the chart underneath stays draggable while a toast is showing", async ({ page }) => {
  // Sonner gives its container and cards pointer-events, so the band
  // they occupy was swallowing wheel and drag events meant for the
  // map. A pilot moving the chart should not have to wait out a toast.
  // The progress toast here lets the pointer through (index.css): a toast
  // with words to read is held under a touch (15e8f6b28), but one saying
  // what is under way has nothing to hold.
  await holdCourse(page);
  await page.goto(PLAN);

  const first = toasts(page).first();
  await expect(first).toBeVisible({ timeout: 15000 });
  await settled(page, "[data-slot=toast]");
  const box = (await first.boundingBox())!;

  // Dead centre of the toast card -- the worst case.
  const beneath = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el?.closest("[data-slot=toast]") ? "the toast" : "something under it";
    },
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  expect(beneath).toBe("something under it");
});

// What the planner is working on is a toast however far out the panel is,
// at the pilot's ask, and the flight's line keeps its figures; a toast
// takes no tap but its own controls', so the route's box under it does.
test("with the panel out, the progress is a toast and the flight's line keeps its figures", async ({ page }) => {
  await holdCourse(page);
  await page.goto(`${PLAN}&view=full`);
  await expect(toasts(page).filter({ hasText: "Drawing Route" })).toHaveCount(1, { timeout: 20000 });
  await expect(page.getByTestId("flight-line")).not.toContainText("Plotting");
});
