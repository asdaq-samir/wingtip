import { expect, type Locator, type Page } from "@playwright/test";

export { closeProfile, openProfile, pressDryRunStart } from "./dryRun";
import { planFromSearch, showPage } from "./oneSearch";
export { emptyPlan, firstRow, searchAirports, showPlan, showSearch, showTraffic } from "./oneSearch";

/**
 * What the browser suite's specs share: the two pages, the waits CI
 * doubles, and the drawer opened and closed the way the stock
 * components open and close it. The head of layout.spec.ts, when
 * that file held nearly every test.
 */

export const PAGES = ["/app/plan", "/app/dev"] as const;

/** The seen-once keys (lib/firstRunTips: the first flight's welcome and FPL tip, the sunlight banner) marked seen, every one, in the page's
 *  storage: for page.evaluate, or page.addInitScript where a spec starts
 *  with none of the suite's saved session. */
export function noTips() {
  localStorage.setItem("wingtip.tips", JSON.stringify({ state: { seen: ["*"] }, version: 0 }));
  // The route's VFR checkpoints on, as a student has them: off by default
  // (lib/preferences), and most specs read the route through them; Comms
  // Assist on, off by default (2026-11-13), as the radio's specs need it.
  if (!localStorage.getItem("wingtip.preferences"))
    localStorage.setItem("wingtip.preferences", JSON.stringify({ state: { waypoints: true }, version: 1 }));
  if (localStorage.getItem("wingtip.commsAssist") === null) localStorage.setItem("wingtip.commsAssist", "true");
}

/** An explicit wait, doubled in CI: playwright.config.ts doubles the
 *  default waits there, and a wait written out here would otherwise
 *  stay at its local figure -- which on a runner carrying the stack,
 *  the browsers and a planner rendering tiles on four cores ran out. */
export const slow = (ms: number) => ms * (process.env.CI ? 2 : 1);

export async function settle(page: Page) {
  // The map's first layout pass: its first chart tile drawn (ChartGl), which is
  // after the container has been measured and the chart asked for --
  // these tests assert on structure and position, not on the route's
  // data arriving. Capped at the flat 1.5 s this used to sleep every
  // time (44 times a run, 66 s summed), for a page with no map to wait
  // on; usually it is a few hundred milliseconds.
  await page.waitForFunction(() => performance.getEntriesByName("chart-drawn").length > 0, null, { timeout: 1500 }).catch(() => {});
}

/** The panel over the map (MapPanel): a phone's sheet, else a side panel.
 *  Its `data-panel` is its own size, under a card too (a card's is on its
 *  own drawer, frontSheet): peek at rest, half or full when it is out. */
export const sideDrawer = (page: Page) => page.locator('[data-slot="map-panel"]');
/** The sheet in front: the top card's own drawer (CardStack), else the map's. */
export const frontSheet = (page: Page) => page.locator('[data-slot="map-panel"], [data-sheet-card][data-open]').last();

/** The first row in sight: the sheet's, static over a card, at the pill too. */
export async function showTabs(page: Page) {
  // From the sheet at rest. The first row: the one search, scoped to the traffic or Nearest where one is up; or the developer's places.
  await settled(sideDrawer(page));
  const first = page.getByTestId("search-airports").or(page.getByTestId("aircraft-search")).or(page.getByTestId("nearest-from"));
  if (!(await first.or(page.getByTestId("dev-tabs")).first().isVisible())) await grabberTo(page, "half");
}

/** The panel's head in sight: half way, with the route's box and its
 *  chips (Share, Procedures, Saved), a tab's search bar, a card. Nothing
 *  when it is out already, half or all the way up. */
export async function openPanel(page: Page) {
  const panel = sideDrawer(page);
  await panel.waitFor();
  // Once it has come to rest: on its way down to the pill it is not the capsule yet, and was taken for one out already.
  await settled(panel);
  if ((await panel.getAttribute("data-capsule")) === null) return;
  await grabberTo(page, "half");
}

/** The route cleared by its ••• menu's Clear route (the owner, 2026-11-11). */
export async function clearTheRoute(page: Page) {
  await openPanel(page);
  await controlsInSight(page);
  await sideDrawer(page).getByTestId("share-route").click();
  await page.getByTestId("route-clear").click();
}

const RANK = { peek: 0, half: 1, full: 2 } as const;

/** The sheet in front to a height by its grabber (a card's, the map's):
 *  the pill, half and all the way up, a step at a time by its arrow keys,
 *  as a keyboard and VoiceOver move it. Each step waited on. */
export async function grabberTo(page: Page, state: "peek" | "half" | "full") {
  const panel = frontSheet(page);
  await panel.waitFor();
  const grabber = page.getByTestId("sidebar-trigger-button");
  const size = async () => (await panel.getAttribute("data-panel")) as keyof typeof RANK;
  for (let steps = 0; steps < 6; steps++) {
    const now = await size();
    if (now === state) break;
    // Pressed again if it did not take: a layer opening in the panel (the
    // console's) takes the focus as it comes, and an arrow pressed just
    // then went to it (the iOS audit's iPad).
    // Not pressed again once it has moved: a press that took long to land
    // on a busy page, pressed twice, went on past the size asked for.
    await expect(async () => {
      if ((await size()) !== now) return;
      await grabber.focus();
      await page.keyboard.press(RANK[state] > RANK[now] ? "ArrowUp" : "ArrowDown");
      await expect.poll(size, { timeout: 4000 }).not.toBe(now);
    }).toPass({ timeout: 15_000 });
  }
  await expect(panel).toHaveAttribute("data-panel", state);
  // And come to rest there, its layout the size's own.
  await settled(panel);
}

/** The sheet half way from the pill, as a pilot pulls it up to type: typing
 *  leaves it where it is (5db1f8b10), its results under the pill's edge. */
export async function sheetUpToType(page: Page) {
  if ((await sideDrawer(page).getAttribute("data-panel")) === "peek") await grabberTo(page, "half");
}

/** A row of the sheet's, or of a card's over it, in sight before it is
 *  tapped. Half way the sheet's body is cut off at its edge, as Apple
 *  Maps' is, and a row under that edge is reached by pulling the sheet up,
 *  not by scrolling (the owner, 2026-11-05); a click there landed on the
 *  map. A card opens half way too (6d7eba6d7), its rows under the edge
 *  alike. All the way up when it is under the edge, then scrolled to, as a
 *  pilot's finger would. */
export async function inSheet(page: Page, locator: Locator) {
  const panel = frontSheet(page);
  await locator.waitFor();
  const under = await locator.evaluate((el) => {
    const sheet = el.closest("[data-sheet-card], [data-slot=map-panel]");
    if (!sheet || sheet.getAttribute("data-panel") === "full") return false;
    const box = sheet.getBoundingClientRect();
    // A bottom sheet's edge is the screen's foot; a top sheet's, its own;
    // either way above the route's figures pinned at its foot.
    const foot = sheet.querySelector("[data-testid=panel-foot]")?.getBoundingClientRect();
    const edge = Math.min(box.top < 0 ? box.bottom : window.innerHeight, foot && foot.height > 0 ? foot.top : Infinity);
    return el.getBoundingClientRect().bottom > edge + 1;
  });
  if (under) await grabberTo(page, "full");
  await settled(panel);
  await locator.scrollIntoViewIfNeeded();
}

/** The route's controls in sight -- its box, the airplane, the time,
 *  Share -- all the way up, where the pill has them too (MapPanel), with
 *  room for what a chip opens. */
export async function controlsInSight(page: Page) {
  const panel = sideDrawer(page);
  await panel.waitFor();
  // The Brief, a card over FPL, has them out of sight: put away.
  await closeBrief(page);
  await grabberTo(page, "full");
  await settled(panel);
  // With no route the search's page is up: Plan a Flight, the empty box.
  await planFromSearch(page);
}

/** FPL's Brief, a card over the route (BriefCard), from the chips' Brief:
 *  its pages -- Preflight, Depart, En route and Arrive -- are its. */
export async function openBrief(page: Page) {
  const card = sideDrawer(page).getByTestId("brief-card");
  if (await card.isVisible().catch(() => false)) return;
  await openPanel(page);
  await sideDrawer(page)
    .getByTestId("route-brief")
    .click({ timeout: slow(30000) });
  await expect(card).toBeVisible();
}

/** The Brief put away, by its own close (closeCard), which goes back
 *  one at a time: from a page to the
 *  Brief's cards (BriefGlance), then FPL's route and nav log again. */
async function closeBrief(page: Page) {
  const card = sideDrawer(page).getByTestId("brief-card");
  if (!(await card.isVisible().catch(() => false))) return;
  if (!(await card.getByTestId("brief-glance").isVisible())) {
    await closeCard(page, "brief-close");
    await expect(card.getByTestId("brief-glance")).toBeVisible();
  }
  await closeCard(page, "brief-close");
  await expect(card).toHaveCount(0);
}

/** The panel all the way out, as a finger takes it: a drag on its
 *  grabber to the screen's far edge from half; from the pill, the
 *  grabber's arrow keys. */
async function panelFull(page: Page) {
  const panel = frontSheet(page);
  await panel.waitFor();
  if ((await panel.getAttribute("data-panel")) === "full") return;
  // By the grabber, as a keyboard and VoiceOver take it.
  await grabberTo(page, "full");
  await settled(panel);
}

/** The console out, all the way up: the account button (in the title row,
 *  gone all the way up) opens the account page (Setup) itself. At the pill,
 *  where the developer's page rests, the page is under the pill's edge. */
export async function openConsole(page: Page) {
  await showPage(page, 0); // the account button is the Search page's (PageToggle)
  await showTabs(page);
  if (!(await page.getByTestId("account-button").isVisible())) await grabberTo(page, "half");
  await page.getByTestId("account-button").click();
  await expect(page.getByTestId("console-sheet")).toBeVisible(); // there before it is raised
  await expandConsole(page);
}

/** Settings, You's row, all the way out, its Sunlight tile on top (QuickControls). Escape closes it. */
export async function openSetup(page: Page) {
  await openConsole(page);
  await page.getByTestId("settings-row").click();
  await expect(page.getByTestId("quick-controls").first()).toBeVisible();
  await expandConsole(page);
}

/** A look tile set from its menu: Sunlight in Settings, Theme and Appearance in the Map card's Look (LookChoice). */
export async function pickControl(page: Page, control: "theme-select" | "brand-select" | "sunlight-select", item: string) {
  const home = control === "sunlight-select" ? "settings-page" : "map-look";
  await page.getByTestId(home).getByTestId(control).click();
  await page.getByTestId(item).click();
}

/** The map's settings: its button's card in the sheet (MapSettingsButton),
 *  as Apple Maps' Choose Map card is. Escape puts it away. */
export async function openMapSettings(page: Page) {
  // The map's buttons are under a phone's sheet all the way up: the pill.
  if ((page.viewportSize()?.width ?? 0) < 768 && (await frontSheet(page).getAttribute("data-panel")) === "full")
    await grabberTo(page, "peek");
  await page.locator("[data-map-controls]").getByTestId("map-settings-button").click();
  await expect(page.getByTestId("map-settings")).toBeVisible();
}

/** The console all the way out. On a phone it is a card of its own over
 *  the map's sheet (ConsoleLayer's CardLayer, the stock Drawer's nested
 *  drawer, as every card is; the owner, 2026-11-13), opened half way as
 *  every card is: its grabber brings it all the way, as a finger's drag
 *  does. From `md` up the side panel has one height, and this does nothing. */
export async function expandConsole(page: Page) {
  if (page.viewportSize()!.width >= 768) return;
  await expect(page.getByTestId("console-sheet")).toBeVisible();
  await grabberTo(page, "full");
}

/** The console's title, a menu of roles -- Pilot, Developer for whoever
 *  may use dev mode, then Sign out for whoever is signed in -- opened,
 *  with the console out first. Nobody signed in and no dev mode, there
 *  is no menu (the title is plain), and neither item is there. Escape
 *  closes the menu; closeConsole puts the console away after it. */
export async function roleMenu(page: Page) {
  const sheet = page.getByTestId("console-sheet");
  if (!(await sheet.isVisible())) await openConsole(page);
  await expect(sheet).toBeVisible();
  // In Pilot Details (AccountGroup), You's first row.
  await openAccount(page);
  const trigger = sheet.getByTestId("role-menu");
  // The menu comes with who is signed in, or dev mode, once known.
  await trigger.waitFor({ timeout: 3000 }).catch(() => {});
  if (await trigger.count()) {
    await trigger.click();
    await expect(page.getByRole("menu")).toBeVisible();
  }
  return { pilot: page.getByRole("menuitemradio", { name: "Pilot" }), developer: page.getByRole("menuitemradio", { name: "Developer" }) };
}

/** Escape until the console is away: a menu open in it takes the first. */
export async function closeConsole(page: Page) {
  const sheet = page.getByTestId("console-sheet");
  await expect(async () => {
    // Escape, as a keyboard puts it away, wherever the focus is.
    if (await sheet.count()) await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0, { timeout: 1000 });
  }).toPass({ timeout: 10000 });
}
/** The console: a stock Sheet from the top from `md` up, a sheet up from
 *  the bottom edge on a phone (shadcn's Drawer). */
export const consoleSheet = (page: Page) => page.getByTestId("console-sheet");

/** The pilot console's Personal tab (it was Library), on one of its
 *  four pages: the tab, back to its list from a page open on it, then
 *  the page's row. */
export async function library(scope: Page | Locator, section: "Airplanes" | "Flights" | "Logbook" | "Minimums") {
  await consolePage(scope, "Account");
  const list = scope.getByTestId("library-section");
  await expect(list).toBeVisible();
  // Setup opens half way, as every card does (e7bb15ec8): a row under its
  // edge is reached by pulling it up.
  const row = list.getByRole("button", { name: new RegExp(`^${section}`) });
  await inSheet("page" in scope ? scope.page() : scope, row); // Setup opens half way
  await row.click();
}

/** At rest: only its head in sight. */
export async function expectDrawerClosed(page: Page) {
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "peek");
  // And come to rest there: easing down it is still the half's layout and
  // height, over what a tap next would be aimed at. The panel's own
  // easing, not what is in it: a button's easing in the body, put out of
  // sight on the way, can stay unfinished (settled).
  await sideDrawer(page).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished.catch(() => undefined))));
}

/** Out: all the way up. */
export async function expectDrawerOpen(page: Page) {
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "full");
}

/** Lowering the panel is one shape everywhere: Escape, pressed in it.
 *  The sheet on a phone, and the card elsewhere, lower on an Escape
 *  pressed inside them. The pointer off the panel first, as a finger is:
 *  left on the toggle, a tooltip could take the Escape. And the panel at
 *  rest first: an Escape pressed while it was still moving left it out,
 *  now and then, on a loaded machine. */
export async function closeSidebarWithTheStockKey(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("no viewport configured");
  await page.mouse.move(viewport.width - 4, viewport.height / 2);
  await settled(sideDrawer(page));
  await page.getByTestId("sidebar-trigger-button").focus();
  await page.keyboard.press("Escape");
}

/** Every finite animation on and under an element run out -- a
 *  sheet's slide, the panel's width easing in. A spinner's spin is
 *  endless and left alone: waited on, it never finished. And one
 *  cancelled on the way is as done as one that ran out: its `finished`
 *  rejects, with an AbortError, and Promise.all used to take that for
 *  the whole wait failing (the Model Training drawer, its table drawn
 *  at once from the planner's kept read, three times running on CI).
 *  Nor one out of sight in a tab not up (PanelTabs' data-hidden page,
 *  content-visibility: hidden) or scrolled out of sight under
 *  content-visibility: auto: the browser stops updating it there, and
 *  its `finished` never comes -- the nav log's rows, arriving as the
 *  Weather tab opened, held this for two minutes on CI, and the
 *  briefing's Write button, its visibility easing as the sheet came
 *  down to the pill, for a minute. */
export async function settled(locator: Locator) {
  // And never past a few seconds: an animation the browser stops updating
  // in a way the filters above do not see never finishes, and held CI's
  // iPad audit of "no legal altitude, opened" to its six-minute timeout
  // three times running on PR #238. Waited out, the test goes on with the
  // page as it is, as it would a moment later.
  await locator.evaluate((el) =>
    Promise.race([
      Promise.all(
        el
          .getAnimations({ subtree: true })
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .filter((a) => {
            const target = a.effect instanceof KeyframeEffect ? a.effect.target : null;
            return !target || target.checkVisibility({ contentVisibilityAuto: true });
          })
          .map((a) => a.finished.catch(() => undefined)),
      ),
      new Promise((done) => window.setTimeout(done, 5000)),
    ]),
  );
}

/** The panel's box once it is out and done moving: measured 300 ms
 *  after the tap, a drawer was 29 px short of its width on a loaded
 *  runner. */
export async function openedDrawerBox(page: Page) {
  await expectDrawerOpen(page);
  await settled(sideDrawer(page));
  return sideDrawer(page).boundingBox();
}

export async function openSidebar(page: Page) {
  const sidebarTrigger = page.getByTestId("sidebar-trigger-button");
  // All the way up, the grabber's Up arrow (grabberTo).
  await grabberTo(page, "full");
  await expectDrawerOpen(page);
  await expect(sidebarTrigger).toHaveAttribute("aria-expanded", "true");
  await expect(sidebarTrigger).toBeEnabled();

  await closeSidebarWithTheStockKey(page);
  await expectDrawerClosed(page);
  await expect(sidebarTrigger).toHaveAttribute("aria-expanded", "false");
}

/** The briefing is the flight planning panel: open it from its
 *  toggle, and the URL says so. */
export async function openBriefing(page: Page) {
  await grabberTo(page, "full");
  await expect(page).toHaveURL(/[?&]view=briefing/);
  await expectDrawerOpen(page);
}

/** The planning panel's tabs by the names they had before they were the
 *  flight's phases (the owner's pick of the redesign, "C"): the Brief's
 *  go / no-go is Preflight's, the weather on the way En route's, the
 *  takeoff Depart's -- the Brief's pages now, a card over FPL. The nav log
 *  is FPL's own (Nav Log, Local): all the way up, the Brief put away. */
const PHASE_OF = { Brief: "Preflight", Weather: "En route", Performance: "Depart" } as const;
type PhaseTab = "Preflight" | "Depart" | "En route" | "Arrive";

/** One of the planning panel's tabs: Nav Log (Local, for one airport to
 *  itself), or one of the Brief's pages. */
export async function openTab(page: Page, name: keyof typeof PHASE_OF | PhaseTab | "Nav Log" | "Local") {
  if (name === "Nav Log" || name === "Local") {
    await closeBrief(page);
    await panelFull(page);
    return;
  }
  await openBrief(page);
  // The tabs are past the half panel's foot, which ends at the flight's
  // line: all the way out, as a finger drags it, to reach them.
  await panelFull(page);
  const phase: PhaseTab = name in PHASE_OF ? PHASE_OF[name as keyof typeof PHASE_OF] : (name as PhaseTab);
  // On the Brief's cards (BriefGlance), the page's card; then its tab.
  await briefPage(page, phase);
  // Not the tab up already: tapped again all the way up, it lowers the
  // panel to half (PanelTabs).
  const tab = panelTabs(page).getByRole("tab", { name: phase, exact: true });
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

/** The Nav Log, its own card from the route's ••• menu (PlanPage), FPL all
 *  the way up under it: FPL lists the route in order (ProceduresRoute), at
 *  the owner's ask. */
export async function openNavLog(page: Page) {
  await openTab(page, "Nav Log");
  const sheet = navLogSheet(page);
  // In the route's menu since the Profile took its button (the owner,
  // 2026-11-04).
  if (!(await sheet.isVisible())) {
    await sideDrawer(page)
      .getByTestId("share-route")
      .click({ timeout: slow(60_000) });
    await page.getByTestId("route-navlog").click();
  }
  await expect(sheet).toBeVisible();
  return sheet;
}

/** The nav log's card over FPL (the owner's "make Navlog open like brief
 *  does"), and what scrolls in it. */
export const navLogSheet = (page: Page) => page.getByTestId("navlog-sheet");
export const navLogScroller = (page: Page) => page.getByTestId("navlog-card-scroller");

/** The nav log's card put away, FPL under it again: its close, kept for a
 *  keyboard and a screen reader (CardClose), the tab bar's Back's twin. */
export async function closeNavLog(page: Page) {
  if (await navLogSheet(page).isVisible()) {
    await page.getByTestId("navlog-close").focus();
    await page.keyboard.press("Enter");
  }
  // Kept between its openings, closed (CardLayer's `open`).
  await expect(navLogSheet(page)).toBeHidden();
}

/** The planning panel's own tabs. */
export const panelTabs = (page: Page) => sideDrawer(page).getByTestId("panel-tabs");

const PAGE_OF: Record<PhaseTab, string> = { Preflight: "preflight", Depart: "depart", "En route": "enroute", Arrive: "arrive" };

/** The Brief open on its cards (BriefGlance, the owner's D′), one of its
 *  pages opened by its card; the tabs are over a page once one is open. */
export async function briefPage(page: Page, phase: PhaseTab) {
  const glance = sideDrawer(page).getByTestId("brief-glance");
  await expect(glance.or(panelTabs(page))).toBeVisible();
  if (await glance.isVisible()) await glance.getByTestId(`brief-glance-${PAGE_OF[phase]}`).click();
  await expect(panelTabs(page)).toBeVisible();
}

const PHASES: PhaseTab[] = ["Preflight", "Depart", "En route", "Arrive"];

/** A section by its title, brought into sight: on the tab up, or on
 *  whichever of the phases' tabs holds it (an airport's on Depart or
 *  Arrive, the winds on En route), its sections one under another. */
export async function openSection(page: Page, title: string) {
  const panel = sideDrawer(page);
  // The legs, FPL's own: the nav log all the way up.
  if (title === "Legs") {
    await openTab(page, "Nav Log");
    await expect(async () => {
      await panel.locator('[data-title="Legs"]').first().scrollIntoViewIfNeeded({ timeout: 2000 });
    }).toPass({ timeout: 10000 });
    return;
  }
  await openBrief(page);
  await panelFull(page); // its page cards are past the half card's foot, as in openTab
  const here = panel.locator(`[role="tabpanel"]:not([inert]) [data-title="${title}"]`).first();
  if (!(await here.isVisible().catch(() => false))) {
    await briefPage(page, "Preflight");
    // Round the phases again until it is on one: a section drawn once the
    // plan is in -- the Flight Plan with the nav log's totals -- is on
    // none of them for as long as a cold
    // planner takes, and one round of 3 s a phase gave up first (CI's
    // flight-plan and oral specs, 2026-10-28).
    await expect(async () => {
      for (const phase of PHASES) {
        const tab = panelTabs(page).getByRole("tab", { name: phase, exact: true });
        if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
        if (
          await here.waitFor({ timeout: 3000 }).then(
            () => true,
            () => false,
          )
        )
          return;
      }
      throw new Error(`no "${title}" section on any of the Brief's pages yet`);
    }).toPass({ timeout: slow(60_000) });
  }
  // A section drawn again as its tab's content arrives can be detached
  // between finding it and scrolling to it: tried until it holds still.
  await expect(async () => {
    await here.scrollIntoViewIfNeeded({ timeout: 2000 });
  }).toPass({ timeout: 10000 });
  // A folded one -- Preflight's under its checks -- opened; one laid open in a tab has no fold.
  if ((await here.getAttribute("data-slot")) !== "open-section" && (await here.getAttribute("data-open")) === null) {
    await here.locator('[data-slot="accordion-trigger"]').first().click();
    await expect(here).toHaveAttribute("data-open", "");
  }
}

/** Once the map has stopped moving: not moving now nor 300 ms before
 *  (GlMapShell's data-moving). A route being fitted, or a card
 *  moving the map to keep the route clear of the panel, moves it after
 *  the page looks settled. */
export async function mapStill(page: Page) {
  await expect
    .poll(
      () =>
        page
          .getByTestId("gl-map")
          .first()
          .evaluate(async (map) => {
            const before = (map as HTMLElement).dataset.moving;
            await new Promise((r) => setTimeout(r, 300));
            return before === undefined && (map as HTMLElement).dataset.moving === undefined;
          }),
      { timeout: slow(10000) },
    )
    .toBe(true);
}

/** A tap on the chart itself, somewhere nothing else is: not a marker,
 *  a popup, the panel over the map or its buttons -- found by asking the
 *  browser what is under each candidate point. */
export async function tapTheChart(page: Page) {
  // Once the map is still: a spot found empty in a move had a field's
  // chip slide under it before the tap (KCWI, on CI's desktop).
  await mapStill(page);
  const at = await page
    .locator(".maplibregl-map")
    .first()
    .evaluate((map) => {
      const r = map.getBoundingClientRect();
      // Clear of every mark by more than a near miss (a 44-point target),
      // which a tap there would select: the markers' (own ship), and those drawn on the canvas -- the airports, the VORs
      // and fixes, the route's own marks, the weather's -- each a mark's 26
      // across round where its probe says it is (useGlProbe).
      const marks = [...map.querySelectorAll(".maplibregl-marker")].map((m) => m.getBoundingClientRect());
      for (const probe of map.querySelectorAll<HTMLElement>("[data-gl-probe]")) {
        const name = probe.dataset.glProbe!;
        for (const m of JSON.parse(probe.getAttribute(`data-${name}`) ?? "[]") as { x?: number; y?: number }[]) {
          if (typeof m.x === "number" && typeof m.y === "number") marks.push(new DOMRect(r.left + m.x - 13, r.top + m.y - 13, 26, 26));
        }
      }
      // And clear of the course, whose legs a tap within 22 opens (RouteGl's
      // route-legs probe: each leg's ends on the screen).
      const legs = (
        JSON.parse(map.querySelector("[data-route-legs]")?.getAttribute("data-route-legs") ?? "[]") as {
          legs: { ends: [number, number][] }[];
        }[]
      )
        .flatMap((row) => row.legs)
        .map((l) => l.ends.map(([x, y]) => ({ x: r.left + x, y: r.top + y })));
      const offLine = (x: number, y: number) =>
        legs.every(([a, b]) => {
          const dx = b!.x - a!.x,
            dy = b!.y - a!.y,
            l2 = dx * dx + dy * dy;
          const t = l2 ? Math.max(0, Math.min(1, ((x - a!.x) * dx + (y - a!.y) * dy) / l2)) : 0;
          return Math.hypot(x - (a!.x + t * dx), y - (a!.y + t * dy)) > 30;
        });
      const clear = (x: number, y: number) =>
        offLine(x, y) && marks.every((m) => x < m.left - 30 || x > m.right + 30 || y < m.top - 30 || y > m.bottom + 30);
      for (let fy = 0.85; fy > 0.1; fy -= 0.1) {
        for (let fx = 0.15; fx < 0.9; fx += 0.1) {
          const x = r.left + r.width * fx,
            y = r.top + r.height * fy;
          const hit = document.elementFromPoint(x, y);
          if (hit && map.contains(hit) && clear(x, y) && hit.matches("canvas.maplibregl-canvas")) return { x, y };
        }
      }
      return null;
    });
  expect(at, "somewhere on the chart with nothing on it").not.toBeNull();
  await page.mouse.click(at!.x, at!.y);
}

/** A tap on the chart a little off a mark: 16 points from its middle,
 *  inside a near miss's 22 (AirportsLayer) and clear of the mark's own 26,
 *  on a side with nothing else under the finger. Not to the right, where
 *  an airport's ident is. Measured and tapped again until the address is
 *  `opens`: a card opening flies the map to its field and moves it again
 *  as the panel settles, and on CI's runners the mark moved from under a
 *  tap measured between the two (PR #238, three tries of three). */
export async function tapNear(page: Page, mark: Locator | (() => Promise<{ x: number; y: number } | null>), opens: RegExp) {
  await expect(async () => {
    await mapStill(page);
    // A drawn airport's point (airportMark), or a marker's middle.
    let middle: { x: number; y: number };
    if (typeof mark === "function") {
      const point = await mark();
      expect(point, "the mark drawn").not.toBeNull();
      middle = point!;
    } else {
      const box = (await mark.boundingBox())!;
      middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }
    const at = await page.evaluate(
      ([x, y]) => {
        // Then a ring of points 14 and 18 out: what is drawn round a route's
        // field -- its traffic pattern, from the first plan since the planner
        // picks its runway -- covered all seven fixed ones round C81 on CI's
        // runners (places.spec, both projects, three tries of three).
        const ring: number[][] = [
          [0, 16],
          [-16, 0],
          [0, -16],
          [-11, 11],
          [-11, -11],
          [11, 11],
          [11, -11],
        ];
        for (const r of [14, 18])
          for (let a = 0; a < 360; a += 30)
            ring.push([Math.round(r * Math.sin((a * Math.PI) / 180)), Math.round(r * Math.cos((a * Math.PI) / 180))]);
        for (const [dx, dy] of ring) {
          const hit = document.elementFromPoint(x! + dx!, y! + dy!);
          if (hit?.matches("canvas.maplibregl-canvas")) return { x: x! + dx!, y: y! + dy! };
        }
        return null;
      },
      [middle.x, middle.y],
    );
    expect(at, "the chart beside the mark, nothing else there").not.toBeNull();
    await page.mouse.click(at!.x, at!.y);
    await expect(page).toHaveURL(opens, { timeout: 2000 });
  }).toPass({ timeout: slow(20_000) });
}

/** A card put away by its way back: its own close in its head, inline
 *  with its name (CardClose), which goes back one card -- no Back, at the
 *  owner's ask ("close button should behave as the back button"). */
export async function closeCard(page: Page, closeTestId: string) {
  await page.getByTestId(closeTestId).click();
}

/** The console's Personal tab, where who is signed in and the mode are
 *  (AccountMenu), at the owner's ask: they were the console's title row. */
export async function openAccount(page: Page) {
  const sheet = page.getByTestId("console-sheet");
  await consolePage(sheet, "Account");
  // Pilot Details, where the role's menu is (AccountGroup; the You card,
  // 2026-11-13), once the sign-in is known: greyed signed out with no dev
  // mode, You's own head then the way in (its Sign In).
  await expect(sheet.getByText("Checking your sign-in…")).toHaveCount(0);
  const row = sheet.getByTestId("pilot-row");
  if (await row.isEnabled()) await row.click();
}

/** One of the console's places by name: the developer's console's tab of
 *  that name; the pilot's console is You, Account the page itself, Guide,
 *  About and Status rows of Settings' Help & About (the owner, 2026-11-13). */
export async function consolePage(scope: Page | Locator, name: "Account" | "Guide" | "About" | "Status") {
  const tab = scope.getByRole("tab", { name, exact: true });
  const setup = scope.getByTestId("setup-page");
  await expect(tab.or(setup).first()).toBeVisible();
  if (await tab.count()) {
    await tab.click();
    return;
  }
  // Back to You from the pages open on it, one close at a time.
  const back = scope.getByRole("button", { name: /^Back to (?!the map)/ }).locator("visible=true");
  while (await back.count()) await back.first().click();
  if (name === "Account") return;
  for (const id of ["settings-row", "help-row", `${name.toLowerCase()}-link`]) {
    const row = scope.getByTestId(id);
    await inSheet("page" in scope ? scope.page() : scope, row);
    await row.click();
  }
}

/** A strip set to show one of its lists -- the flights' Saved or Recents, the traffic's Favorites,
 *  Recents or a question -- from the filter menu at its heading's right (StripSection). */
export async function stripShows(page: Page, menu: "fpl-strip-shows" | "aircraft-question", item: string) {
  await sideDrawer(page).getByTestId(menu).click();
  await page.getByTestId(item).click();
}

/** The one search, in sight: the sheet's first row, at every height. */
export async function airportSearch(page: Page) {
  const search = page.getByTestId("search-airports");
  await showPage(page, 0); // the field is the Search page's (PageToggle)
  if (!(await search.isVisible())) await showTabs(page);
  await expect(search).toBeVisible();
  // Its results in sight when typed in: typing leaves the sheet where it is.
  await sheetUpToType(page);
  return search;
}

/** A chart airport as the map drew it (AirportsGl's probe,
 *  `data-airport-marks`): its ident, where it is on the page, whether it
 *  wears its mark (`chip`) and the mark's airspace, use and weather colour. */
interface DrawnAirport {
  ident: string;
  x: number;
  y: number;
  chip: boolean;
  space: string;
  use: string;
  weather: string;
}

/** Every chart airport drawn now, on the page's own pixels: the Class B,
 *  C and D fields' canvas and the others' (AirportsLayer). */
export async function airportMarks(page: Page): Promise<DrawnAirport[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-airport-marks]")].flatMap((c) => {
      const r = c.closest(".maplibregl-map")!.getBoundingClientRect();
      const drawn = JSON.parse(c.getAttribute("data-airport-marks") ?? "[]") as { x: number; y: number }[];
      return drawn.map((m) => ({ ...m, x: m.x + r.left, y: m.y + r.top }));
    }),
  ) as Promise<DrawnAirport[]>;
}

/** The VFR waypoints drawn on the map (WaypointsGl's probe), in the page's own points. */
export async function waypointMarks(page: Page): Promise<{ ident: string; x: number; y: number }[]> {
  return page.evaluate(() => {
    const out: { ident: string; x: number; y: number }[] = [];
    for (const c of document.querySelectorAll<HTMLElement>("[data-navaid-marks]")) {
      const r = c.closest(".maplibregl-map")!.getBoundingClientRect();
      for (const m of JSON.parse(c.getAttribute("data-navaid-marks") ?? "[]") as { ident: string; kind: string; x: number; y: number }[]) {
        if (m.kind === "vfr") out.push({ ident: m.ident, x: m.x + r.left, y: m.y + r.top });
      }
    }
    return out;
  });
}

/** One chart airport drawn, by its ident; null while it is not. */
export async function airportMark(page: Page, ident: string): Promise<DrawnAirport | null> {
  return (await airportMarks(page)).find((m) => m.ident === ident) ?? null;
}

/** A card's own close in the map's sheet, by its test id: in its head on
 *  every screen, the tabs over it static (TabBar). */
export function cardClose(page: Page, testId: string) {
  return page.getByTestId(testId);
}

/** What a map layer has drawn now, as its probe records it (useGlProbe):
 *  each feature's fields and, for a point or an area, where it is on the
 *  map in the map's own points. */
export async function drawn(page: Page, name: string): Promise<Record<string, unknown>[]> {
  return page.evaluate(
    (n) =>
      [...document.querySelectorAll<HTMLElement>(`[data-gl-probe="${n}"]`)].flatMap(
        (p) => JSON.parse(p.getAttribute(`data-${n}`) ?? "[]") as Record<string, unknown>[],
      ),
    name,
  );
}

/** The level of the chart's tiles the map draws now (ChartGl's
 *  data-chart-zoom), NaN before the chart is up. */
export async function chartZoom(page: Page): Promise<number> {
  return Number(await page.getByTestId("gl-map").first().getAttribute("data-chart-zoom"));
}
