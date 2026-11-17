import { expect, type Locator, type Page } from "@playwright/test";
import { planFromSearch } from "./oneSearch";

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
  // From the sheet at rest. The first row: the one search, or Nearest's field where its card is up; or the developer's places.
  await settled(sideDrawer(page));
  const first = page.getByTestId("search-airports").or(page.getByTestId("nearest-from"));
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

/** The Brief put away, by its own close (closeCard), which goes back
 *  one at a time: from a page to the
 *  Brief's cards (BriefGlance), then FPL's route and nav log again. */
export async function closeBrief(page: Page) {
  const card = sideDrawer(page).getByTestId("brief-card");
  if (!(await card.isVisible().catch(() => false))) return;
  if (!(await card.getByTestId("brief-glance").isVisible())) {
    await closeCard(page, "brief-close");
    await expect(card.getByTestId("brief-glance")).toBeVisible();
  }
  await closeCard(page, "brief-close");
  await expect(card).toHaveCount(0);
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

/** A card put away by its way back: its own close in its head, inline
 *  with its name (CardClose), which goes back one card -- no Back, at the
 *  owner's ask ("close button should behave as the back button"). */
export async function closeCard(page: Page, closeTestId: string) {
  await page.getByTestId(closeTestId).click();
}

/** A card's own close in the map's sheet, by its test id: in its head on
 *  every screen, the tabs over it static (TabBar). */
export function cardClose(page: Page, testId: string) {
  return page.getByTestId(testId);
}
