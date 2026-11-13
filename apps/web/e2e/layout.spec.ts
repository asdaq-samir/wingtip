import { test, expect } from "@playwright/test";
import {
  closeSidebarWithTheStockKey,
  expectDrawerClosed,
  firstRow,
  grabberTo,
  openBrief,
  openPanel,
  openSetup,
  openSidebar,
  PAGES,
  settle,
  settled,
  showTabs,
  sideDrawer,
  slow,
  frontSheet,
} from "./helpers";
import { fromRest } from "./startState";

/**
 * The regressions this file exists to catch (see playwright.config.ts
 * for why these need a real browser rather than the vitest suite):
 *
 *  - a corner-pinned button not actually flush against the edge it's
 *    meant to sit on, because a wider sibling was silently deciding
 *    the shared container's own shrink-to-fit width
 *  - the sidebar (a `MapDrawer` over the map area) not actually
 *    starting closed, not opening from its trigger, or covering the
 *    header it is meant to sit under
 *  - wide content (the nav log table) pushing the whole page into
 *    horizontal scroll instead of scrolling inside its own container,
 *    because an ancestor flex item was missing `min-w-0`
 *
 * None of these are about what a component renders -- only about
 * where things actually land once a real layout engine gets to them,
 * which is why the whole file runs under both of playwright.config.ts's
 * own projects (a phone size and a desktop one) rather than picking
 * one -- most tests here compute their own thresholds off
 * `page.viewportSize()`, so the same assertion holds at either size
 * unmodified.
 *
 * The pages' other tests are in files of their own, by subject:
 * briefing, checkpoints, map, plans, switch, dev-page, consoles and
 * tiles. Their names are chosen for CI as well: `--shard` cuts the
 * suite, in file order, into equal counts of tests, and while nearly
 * every test was here the slow ones (the altitude plans, the popups,
 * the worklist, the TAC) fell on the same two shards of eight.
 */

test.describe("/app/plan", () => {
  // At rest the panel is a pill of the tabs, at the owner's ask ("When no
  // route is entered, let's have tabs on the pill"), a route's figures
  // pinned under them ("If a route is entered, then let's pin the
  // calculations at the bottom"); the grabber half way.
  test("the panel rests as the one search, a route's figures under it, and half way has the route's box", async ({ page }) => {
    await page.goto("/app/plan");
    await settle(page);
    await fromRest(page);
    await expect(sideDrawer(page)).toHaveAttribute("data-capsule", "true");
    await expect(firstRow(page)).toBeVisible();
    await expect(sideDrawer(page).getByTestId("route-type")).toBeHidden();
    await expect(sideDrawer(page).getByTestId("flight-line")).toHaveCount(0);
    await page.goto("/app/plan?dep=C81&dest=KDLH");
    await settle(page);
    await fromRest(page);
    await expect(sideDrawer(page)).toHaveAttribute("data-capsule", "true");
    // With a route the sheet opens on FPL, whose pill on a phone is the
    // route's figures, To, Dist, ETE and Fuel (the owner, 2026-11-11, the
    // canvas's b; the pill's one fixed height, sheet/insets), the route's
    // row from half up; in the side panel they are pinned under the one
    // search. A no-break space between a figure and its unit, so \s.
    const figures = sideDrawer(page).getByTestId("flight-line");
    await expect(figures).toContainText(/\d+\s*nm/, { timeout: slow(30000) });
    if ((page.viewportSize()?.width ?? 0) < 768) {
      await expect(sideDrawer(page).getByTestId("route-box").or(sideDrawer(page).getByTestId("route-line")).first()).toBeHidden();
      // The pill no taller for them: the search's own 4.75 rem.
      const pill = await sideDrawer(page).evaluate((el) => el.getBoundingClientRect().top);
      const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
      expect((page.viewportSize()?.height ?? 0) - pill).toBeLessThanOrEqual(4.75 * rem + 40);
    } else await expect(firstRow(page)).toBeVisible();
    await page.getByTestId("sidebar-trigger-button").click();
    await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
    // The plan, the sheet's main content with a route.
    await expect(sideDrawer(page).getByTestId("route-box").or(sideDrawer(page).getByTestId("route-line")).first()).toBeVisible();
    await expect(sideDrawer(page).getByTestId("flight-line")).toContainText(/\d+\s*nm/, { timeout: slow(30000) });
    await expect(page.getByLabel(/^(\S+, )?Departure$/)).toBeVisible();
    expect(await page.getByTestId("toolbar-trigger").count()).toBe(0);
  });

  // The grabber steps the three sizes. A route's link lands at rest; a
  // reload forgets it (features/shell/freshLoad).
  test("a fresh load opens as the pill, a route's link at rest, and a reload forgets the route", async ({ page }) => {
    await page.goto("/app/plan");
    await settle(page);
    await fromRest(page);
    await expect(page.getByTestId("search-close")).toHaveCount(0);

    // The grabber on the panel's far edge, once the panel has come to rest.
    const phone = page.viewportSize()!.width < 768;
    await expect(async () => {
      const panelBox = (await sideDrawer(page).boundingBox())!;
      const grabber = (await page.getByTestId("sidebar-trigger-button").boundingBox())!;
      if (phone) expect(Math.abs(grabber.y - panelBox.y)).toBeLessThan(2);
      else expect(Math.abs(grabber.y + grabber.height - (panelBox.y + panelBox.height))).toBeLessThan(2);
    }).toPass({ timeout: 10_000 });
    await page.getByTestId("sidebar-trigger-button").click();
    await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
    await expect(sideDrawer(page).getByTestId("account-button")).toBeVisible();
    await grabberTo(page, "full");

    await page.goto("/app/plan?dep=C81&dest=KDLH");
    await settle(page);
    await fromRest(page);
    // Share among the route's chips half way.
    await openPanel(page);
    await sideDrawer(page).getByTestId("share-route").click();
    // The route's own link: the GPX file this read went with the SD-card
    // and USB files (the owner, 2026-11-02, "No need for sd card or usb").
    await expect(page.getByTestId("share-link")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.reload();
    await settle(page);
    await expect(page).not.toHaveURL(/[?&]dep=/);
    await fromRest(page);
  });

  test("sidebar opens from its own trigger, closes on Escape", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/app/plan");
    await settle(page);
    await closeSidebarWithTheStockKey(page);
    await expectDrawerClosed(page);
    await openSidebar(page);
  });

  // Three heights to the pilot, at their ask: the pill, all the way up,
  // and one half way -- the route's to its tabs' bar, and the search's
  // and an airport's card the same, what comes next under them (the
  // Recents, the weather) out of sight. The route cleared keeps its
  // shape and height; its close again shows the search under it.
  // All the way up, the Brief's pages: a page tapped is that page.
  test("a route's page tapped all the way up is that page", async ({ page }) => {
    await page.goto("/app/plan?dep=C81&dest=KDLH");
    await settle(page);
    await openBrief(page);
    await grabberTo(page, "full");
    await page.getByTestId("brief-glance-enroute").click();
    await expect(frontSheet(page)).toHaveAttribute("data-panel", "full");
    await expect(page.getByTestId("panel-tab-enroute")).toHaveAttribute("aria-selected", "true");
  });
});

// Deliberately the same shape as the /app/plan describe block above --
// Plan and Label are meant to look and behave like the same shell
// around a different sidebar now (see TrainWorkspace's own comment on its
// header), not two pages that happen to share components, so their own
// layout tests are the same tests, not analogous ones. The view
// filters used to live behind their own collapsible toolbar trigger;
// that's gone now (moved into the sidebar's own top, see TrainWorkspace),
// so there's nothing toolbar-specific left to test here that Plan's
// own suite doesn't already cover for both.
test.describe("/app/dev", () => {
  test("the panel rests as the tabs' pill, the tab up tapped opening the route form", async ({ page }) => {
    await page.goto("/app/dev");
    await settle(page);
    await expect(sideDrawer(page)).toHaveAttribute("data-capsule", "true");
    await showTabs(page);
    await expect(page.getByTestId("tab-train")).toHaveAttribute("aria-selected", "true");
    // The training page's route form is all the way up's: its pill is the
    // tabs (MapPanel).
    await grabberTo(page, "full");
    await expect(page.getByLabel(/^(\S+, )?Departure$/)).toBeVisible();
    expect(await page.getByTestId("toolbar-trigger").count()).toBe(0);
  });

  test("sidebar starts closed on load, every load", async ({ page }) => {
    await page.goto("/app/dev");
    await settle(page);
    await expectDrawerClosed(page);
  });

  test("sidebar opens from its own trigger, closes on Escape", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/app/dev");
    await settle(page);
    await openSidebar(page);
  });

  test("the old labeling address still lands here, route and all", async ({ page }) => {
    await page.goto("/app/label?dep=C81&dest=KDLH");
    await page.waitForURL("**/app/dev?dep=C81&dest=KDLH");
  });
});

const TITLES: Record<string, string> = { "/app/plan": "Plan a route — Wingtip Maps", "/app/dev": "Dev — Wingtip Maps" };

for (const path of PAGES) {
  test.describe(path, () => {
    // The page renders its own <title> and React hoists it into the
    // head, above index.html's own static one (which is there for a
    // crawler that never runs JS). Both are in the document; the
    // browser reads the first, so this pins which wins.
    test("the browser tab is named for this page, not the static fallback", async ({ page }) => {
      await page.goto(path);
      await settle(page);
      await expect(page).toHaveTitle(TITLES[path]!);
    });

    test("no page-level horizontal overflow", async ({ page }) => {
      await page.goto(path);
      await settle(page);
      const overflowing = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflowing).toBe(false);
    });

    // No guide button in either header any more: the planner's guide
    // lives in the Pilot drawer's Guide tab, the rating guide in the
    // Developer drawer's own rating step.
    test("no info button in the header", async ({ page }) => {
      await page.goto(path);
      await settle(page);
      expect(await page.getByTestId("guide-button").count()).toBe(0);
    });
  });
}

test.describe("/app/plan", () => {
  // One bar, the panel's head, the same shape as Dev's: no tabs in it
  // (the briefing is the flight planning panel, not a second view), the
  // route leading it, and the panel's grabber on its far edge.
  test("the panel's head is the page's one bar, with no tabs: at the bottom of a phone and the top from md up, the route leading it, and the panel's grabber opens the nav log", async ({
    page,
  }) => {
    await page.goto("/app/plan?dep=C81&dest=KDLH");
    await settle(page);
    // Out half way, where the head is the route form (at rest, the capsule).
    await openPanel(page);
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("no viewport configured");
    const phone = viewport.width < 768;

    const header = page.locator("header");
    await expect(header.getByRole("tablist")).toHaveCount(0);
    const headerBox = (await header.boundingBox())!;
    if (phone) expect(headerBox.y).toBeGreaterThan(viewport.height / 2);
    // From md up the one search is the panel's first row (OneSearchField)
    // under its title row (the owner's Apple Maps screenshot, 2026-11-10),
    // the head under it.
    else {
      const bar = (await firstRow(page).boundingBox())!;
      expect(bar.y).toBeLessThan(100);
      expect(headerBox.y).toBeLessThan(bar.y + bar.height + 8);
    }
    const departureBox = (await header.getByLabel(/^(\S+, )?Departure$/).boundingBox())!;
    expect(departureBox.x - headerBox.x).toBeLessThan(40);

    // The grabber on the panel's far edge: the top of a phone's sheet,
    // the bottom of a card at the top of the screen -- once the sheet has
    // come to rest: measured once, a busy runner caught it moving, 7.6 px
    // off, then 2.2 and 2.9 on its retries (main's run 37340767548).
    await expect(async () => {
      const panelBox = (await sideDrawer(page).boundingBox())!;
      const grabber = (await page.getByTestId("sidebar-trigger-button").boundingBox())!;
      if (phone) expect(Math.abs(grabber.y - panelBox.y)).toBeLessThan(2);
      else expect(Math.abs(grabber.y + grabber.height - (panelBox.y + panelBox.height))).toBeLessThan(2);
    }).toPass({ timeout: 10_000 });
    // Taps cycle it: on up from half, then back down to the pill.
    for (const height of ["full", "half", "peek"]) {
      await page.getByTestId("sidebar-trigger-button").click();
      await expect(frontSheet(page)).toHaveAttribute("data-panel", height);
    }
    await expectDrawerClosed(page);
  });
});

for (const path of PAGES) {
  test(`${path}: the map's buttons sit at the map's right edge, away from the panel, and the console's button is on the panel's capsule: the planner's search bar, the training page's route`, async ({
    page,
  }) => {
    await page.goto(`${path}?dep=C81&dest=KDLH`);
    await settle(page);
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("no viewport configured");

    // The group's own first, not the radio's mic, which from md up stands
    // over it in the same column (the owner, 2026-11-06).
    const first = page.locator("[data-map-controls] > div:not([data-map-food]) button").first();
    const firstBox = (await first.boundingBox())!;
    // On the map, flush with its right edge -- the same on both pages: on a
    // phone just over the sheet's top, the search's row, riding it as the
    // radio's button does at the left (the owner, 2026-11-11), at the
    // bottom under a desktop's card.
    expect(viewport.width - (firstBox.x + firstBox.width)).toBeLessThan(20);
    if (viewport.width < 768) {
      await settled(page.locator("[data-slot=map-panel]"));
      const sheet = (await page.locator("[data-slot=map-panel]").boundingBox())!;
      const group = (await page.locator("[data-map-controls]").boundingBox())!;
      expect(Math.round(sheet.y - (group.y + group.height))).toBe(24);
    } else {
      expect(firstBox.y).toBeGreaterThan(viewport.height / 2);
      // The mic a button of its own right over the group, at the same edge.
      const mic = (await page.locator("[data-map-controls]").getByTestId("mic-circle").boundingBox())!;
      expect(mic.y + mic.height).toBeLessThanOrEqual(firstBox.y);
      expect(viewport.width - (mic.x + mic.width)).toBeLessThan(20);
    }
    // Never among the map's buttons, on either page: their first is the
    // map's own, its card the map's settings in the sheet (a desktop's side
    // panel too), as Apple Maps' Choose Map card is (the owner, 2026-11-10).
    expect(await page.locator("[data-map-controls]").getByTestId("account-button").count()).toBe(0);
    await expect(first).toHaveAttribute("data-testid", "map-settings-button");
    await first.click();
    await expect(sideDrawer(page).getByTestId("map-settings").getByRole("heading", { name: "Map", level: 2 })).toBeVisible();
    await expect(page.getByTestId("map-settings").getByTestId("base-chart-select")).toBeVisible();
    await expect(page.getByTestId("map-settings").getByTestId("waypoints-toggle")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("map-settings")).toHaveCount(0);
    if (path === "/app/dev") {
      // At the end of the training page's route capsule, which has no
      // search bar.
      await showTabs(page);
      await expect(sideDrawer(page).getByTestId("account-button")).toBeVisible();
    } else {
      // At the end of the route's capsule, as at the search bar's once
      // the route is closed, as Maps' account is.
      await showTabs(page);
      await expect(sideDrawer(page).getByTestId("account-button")).toBeVisible();
      await page.goto(path);
      await settle(page);
      await showTabs(page);
      await expect(sideDrawer(page).getByTestId("account-button")).toBeVisible();
      expect(await page.locator("[data-map-controls]").getByTestId("account-button").count()).toBe(0);
    }

    // Setup holds the cockpit's Controls, never the map's: they are the
    // map button's.
    await openSetup(page);
    expect(await page.getByTestId("base-chart-select").count()).toBe(0);
    await page.keyboard.press("Escape");
  });

  test(`${path}: the full-screen button takes the whole screen and gives it back`, async ({ page }) => {
    await page.goto(`${path}?dep=C81&dest=KDLH`);
    await settle(page);
    // The map has to have drawn something before this test can say
    // anything about it redrawing. `settle` waits a fixed 1.5s, which
    // is plenty when the planner is idle and not always enough when
    // three other workers are asking it for chart tiles.
    await expect(page.locator("[data-chart-zoom]").first()).toBeAttached();
    // Drawn only where it would work: Chromium allows it, an iPad
    // does, an iPhone does not and the button is absent there rather
    // than present and refusing (see `FullscreenButton`).
    expect(await page.evaluate(() => document.fullscreenEnabled)).toBe(true);
    const button = page.getByTestId("fullscreen-button");
    await expect(button).toHaveAttribute("aria-label", "Full screen");

    await button.click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await expect(button).toHaveAttribute("aria-label", "Leave full screen");
    // The map re-measured rather than keeping its old size: it is
    // still drawing tiles (`ResizeAware` watches the container).
    await expect(page.locator("[data-chart-zoom]").first()).toBeAttached();

    await button.click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await expect(button).toHaveAttribute("aria-label", "Full screen");
  });
}
