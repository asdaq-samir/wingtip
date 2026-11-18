import { expect, type Page } from "@playwright/test";
import { showPage } from "./oneSearch";
import {
  slow,
  sideDrawer,
  showTabs,
  openPanel,
  grabberTo,
  sheetUpToType,
  expectDrawerOpen,
  closeBrief,
  frontSheet,
  settled,
} from "./sheetHelpers";

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

/** The briefing is the flight planning panel: open it from its
 *  toggle, and the URL says so. */
export async function openBriefing(page: Page) {
  await grabberTo(page, "full");
  await expect(page).toHaveURL(/[?&]view=full/);
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
  // A tile under the route (FplActions; the owner's pick A, 2026-11-15).
  if (!(await sheet.isVisible())) {
    await sideDrawer(page)
      .getByTestId("route-navlog")
      .click({ timeout: slow(60_000) });
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

/** A strip set to show one of its lists -- the flights' Saved or Recents -- from the filter menu
 *  at its heading's right (StripSection). */
export async function stripShows(page: Page, menu: "fpl-strip-shows", item: string) {
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
