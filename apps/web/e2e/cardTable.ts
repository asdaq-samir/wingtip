import { expect, type Page } from "@playwright/test";
import {
  consolePage,
  grabberTo,
  inSheet,
  openBrief,
  openConsole,
  openMapSettings,
  openNavLog,
  openPanel,
  openProfile,
  sheetUpToType,
  showSearch,
  showTabs,
  sideDrawer,
  slow,
} from "./helpers";
import { tapMark } from "./marks";
import { go, nearbyStops, pick, ROUTE, sky, tapLeg } from "./cardEntries";
import { pickAirplane } from "./startState";

/**
 * Every card of the web app, by the one card rule (card-rule-spec, the owner
 * 2026-11-10), as one table that cards.spec and card-scroll.spec run the
 * same checks over: a card added here gets every check. Each row names the
 * card's stable test id and its ✕, and each way it is opened (`entries`):
 * a search pick, a map tap, a list row, the plan, a link of
 * design/screens.json. An entry says where its close goes back to
 * (`back`), checked after ✕ and Escape. A check that cannot apply to a card
 * says why in `not`, which the specs print as the skip's reason.
 *
 * On a phone each card is the stock Drawer's own nested drawer over the
 * map's sheet (sheet/CardStack, the owner 2026-11-11), checked by `nested`.
 */

/** Where a card's close goes back to. */
export type Back = "search" | "search-home" | "plan" | "map" | "console" | "profile";

export interface Entry {
  name: string;
  /** Opens the card from a fresh page. */
  open: (page: Page) => Promise<void>;
  back: Back;
}

/** The checks a row may be excused from, each with its reason. */
export type Check =
  | "searchHidden"
  | "escape"
  | "scroll"
  | "dragUp"
  | "dragDown"
  | "textSize"
  | "sideways"
  | "position"
  | "desktop"
  | "pill"
  | "nested"
  | "head";

export interface CardRow {
  name: string;
  /** The card's own test id: the same component whatever the entry. */
  card: string;
  /** Its ✕ in its head. */
  close: string;
  entries: Entry[];
  /** A question (SheetDialog): its ✕ is Cancel, the state left as it was. */
  question?: boolean;
  /** Emergency: the sheet all the way up, its ✕ at the top right. */
  fullHeight?: boolean;
  /** A row in it that slides sideways (photos, chips, pills). */
  sideways?: string;
  /** The short line under its name in its title row, in sight at the pill
   *  too (the owner, 2026-11-11: the pages that became cards). */
  pillLine?: RegExp;
  /** Something opened inside it, and the way back to it. */
  inside?: { open: (page: Page) => Promise<void>; back: (page: Page) => Promise<void> };
  not?: Partial<Record<Check, string>>;
}

export const CARDS: CardRow[] = [
  {
    name: "airport",
    card: "place-card",
    close: "place-close",
    sideways: "place-pictures",
    entries: [
      { name: "search pick", open: (p) => pick(p, "duluth", "airport"), back: "search" },
      {
        name: "map tap",
        open: async (p) => {
          await go(p, ROUTE);
          // The departure's mark, the route's own, tapped at its point: a
          // route's fields are drawn by it, not among the chart's airports,
          // and a tap beside it can take a neighbour (KARR's mark, round C81).
          await expect(async () => {
            await tapMark(p, "route-marks", "C81");
            await expect(p).toHaveURL(/[?&]place=C81(&|$)/, { timeout: 2_000 });
          }).toPass({ timeout: slow(20_000) });
          // The pointer off what came up under it: the card's head lands where
          // the chip was, and a hover there opens its Add to Favorites tooltip,
          // which an Escape closes first. A finger leaves nothing hovering.
          await p.mouse.move(1, 1);
        },
        back: "plan",
      },
      {
        name: "list row (Recents)",
        open: async (p) => {
          // A Recent is an airport picked from a search (useSearchPanel's
          // addRecentAirport), not one opened by a link or on the map.
          await pick(p, "duluth", "airport");
          await p.getByTestId("place-close").click();
          // Back on the search with "duluth" in it: cleared, its own page.
          await p.getByTestId("search-airports").fill("");
          await showSearch(p);
          // Recents is under the edge at half, past Find Nearby and
          // Favorites: pulled up to it, as a finger would.
          const recent = sideDrawer(p).getByTestId("airport-recent").first();
          await inSheet(p, recent);
          await recent.click();
        },
        back: "search-home",
      },
      { name: "link (place=)", open: (p) => go(p, "/app/plan?place=KDLH"), back: "map" },
    ],
    inside: {
      open: async (p) => {
        await grabberTo(p, "full");
        await sideDrawer(p).getByTestId("place-tab-weather").click();
      },
      back: async (p) => {
        await sideDrawer(p).getByTestId("place-tab-radio").click();
      },
    },
  },
  {
    name: "waypoint or navaid",
    card: "place-card",
    close: "place-close",
    entries: [{ name: "search pick", open: (p) => pick(p, "DLH", "waypoint"), back: "search" }],
    not: { sideways: "a navaid's card has no pictures", position: "checked on the airport's card, the same component" },
  },
  {
    name: "route leg",
    card: "route-leg-card",
    close: "route-leg-close",
    entries: [{ name: "map tap", open: tapLeg, back: "map" }],
    not: { sideways: "no sideways row", position: "nothing opens inside a leg", scroll: "a leg's card is shorter than the half sheet" },
  },
  {
    name: "an airplane's card",
    card: "flight-card",
    close: "flight-close",
    entries: [
      {
        name: "link (flight=)",
        open: async (p) => {
          await sky(p);
          await go(p, "/app/plan?flight=a0b7d8");
        },
        // With no route, the one search's own page under it.
        back: "search-home",
      },
    ],
    not: {
      sideways: "the stub gives it no photo, so no picture slides; its facts strip is the airport card's CardFacts, checked there",
      position: "checked on the airport's card, the same CardTitle and SheetCard",
      searchHidden: "a card hides the one search as any other (checked on the airport)",
    },
  },
  {
    name: "airplane profile",
    card: "airplane-profile",
    close: "sheet-card-close",
    entries: [{ name: "link (airplane=)", open: (p) => go(p, "/app/plan?airplane=N14511"), back: "map" }],
    not: {
      sideways: "no photo stubbed; its facts strip is the airport card's CardFacts, checked there",
      position: "nothing opens inside it",
    },
  },
  {
    name: "Map settings",
    card: "map-settings",
    close: "sheet-card-close",
    entries: [{ name: "map button", open: async (p) => (await go(p, ROUTE), await openMapSettings(p)), back: "map" }],
    not: { sideways: "its chart tiles wrap in a grid, none slides", position: "nothing opens inside it" },
  },
  {
    name: "Brief",
    card: "brief-card",
    close: "brief-close",
    entries: [
      { name: "the plan", open: async (p) => (await go(p, ROUTE), await openBrief(p)), back: "plan" },
      { name: "link (open=brief)", open: (p) => go(p, `${ROUTE}&open=brief`), back: "plan" },
    ],
    not: { sideways: "no sideways row on its glance", position: "its pages are a stack of their own (briefing.spec)" },
  },
  {
    name: "Nav Log",
    card: "navlog-sheet",
    close: "navlog-close",
    // Its totals: "65.3 nm · 35m · 9.0 gal".
    pillLine: /nm · .+ · .*gal/,
    // With an airplane, for its time and fuel (nothing assumes one, the
    // owner 2026-11-09: with none they read "—").
    entries: [
      { name: "the plan", open: async (p) => (await pickAirplane(p), await go(p, ROUTE), void (await openNavLog(p))), back: "plan" },
      { name: "link (open=navlog)", open: async (p) => (await pickAirplane(p), await go(p, `${ROUTE}&open=navlog`)), back: "plan" },
    ],
    not: { sideways: "its table scrolls sideways on purpose inside the card (nav-log-desk.spec)", position: "nothing opens inside it" },
  },
  {
    name: "Profile",
    card: "profile-card",
    close: "profile-close",
    // "Cruise FL-055 · clear of terrain".
    pillLine: /^Cruise FL-\d{3}/,
    entries: [
      { name: "the plan", open: async (p) => (await go(p, ROUTE), void (await openProfile(p))), back: "plan" },
      { name: "link (open=profile)", open: (p) => go(p, `${ROUTE}&open=profile`), back: "plan" },
    ],
    not: {
      sideways: "its altitude slider is upright",
      position: "nothing opens inside it",
      scroll: "capped to the sheet at each detent, nothing scrolls",
    },
  },
  {
    name: "Stops",
    card: "stops-card",
    close: "stops-close",
    // "2 stops", or "None within 25 nm".
    pillLine: /^(\d+ stops?|None (on the route|within \d+ nm))$/,
    entries: [
      {
        name: "list row (Find Nearby)",
        open: async (p) => {
          await nearbyStops(p);
          // Nearby is round the pilot's position, and the suite's account
          // has no home base: with neither the card only asks for one.
          await p.context().grantPermissions(["geolocation"]);
          await p.context().setGeolocation({ latitude: 42.3247, longitude: -88.0742 });
          await go(p, "/app/plan");
          await showSearch(p);
          await grabberTo(p, "full");
          await sideDrawer(p).getByTestId("find-nearby-fuel").click();
        },
        back: "search-home",
      },
    ],
    not: { position: "nothing opens inside it", scroll: "one stubbed field: shorter than the sheet" },
  },
  {
    name: "Settings and its About",
    card: "console-sheet",
    close: "console-close",
    entries: [
      { name: "account button", open: async (p) => (await go(p, "/app/plan"), await openConsole(p)), back: "search-home" },
      { name: "link (open=setup)", open: (p) => go(p, "/app/plan?open=setup"), back: "search-home" },
    ],
    inside: {
      open: (p) => consolePage(p.getByTestId("console-sheet"), "About"),
      // About is a page of Settings' Help & About (the owner, 2026-11-13):
      // its close goes back a page, to Help & About, You still open.
      back: (p) => p.getByTestId("console-sheet").getByRole("button", { name: "Back to Help & About", exact: true }).click(),
    },
    not: {
      sideways: "no sideways row",
      head: "no name in its head row, the gear and the ✕ alone: the pilot's name is the large line under it, as Apple Maps' account card's (ConsoleLayer, 2026-11-13)",
    },
  },
  {
    // A Settings page opened straight from the search: one ✕, its own, and
    // it goes back to the search in one tap, the console closed with it --
    // not to Settings first (the card rule, docs/design/rules.md).
    name: "Minimums from search",
    card: "console-page",
    close: "console-page-close",
    entries: [
      {
        name: "search Do",
        open: async (p) => {
          await go(p, "/app/plan");
          await showTabs(p);
          await sheetUpToType(p);
          await p.getByTestId("search-airports").fill("minimums");
          // Its row may be under the half sheet's edge, past the results.
          const row = sideDrawer(p).getByTestId("search-do-screen-minimums");
          await inSheet(p, row);
          await row.click();
          await expect(p.getByTestId("console-close")).toBeHidden();
        },
        back: "search",
      },
    ],
    not: { sideways: "no sideways row", position: "nothing opens inside it", scroll: "six rows: shorter than the sheet" },
  },
  {
    name: "Emergency",
    card: "emergency-sheet",
    close: "sheet-card-close",
    fullHeight: true,
    entries: [
      { name: "link (open=emergency)", open: (p) => go(p, "/app/plan?open=emergency"), back: "map" },
      {
        name: "search Do",
        open: async (p) => {
          await go(p, "/app/plan");
          await showTabs(p);
          await sheetUpToType(p);
          await p.getByTestId("search-airports").fill("emergency");
          // Its row may be under the half sheet's edge, past the results.
          const row = sideDrawer(p).getByTestId("search-do-screen-emergency");
          await inSheet(p, row);
          await row.click();
        },
        back: "search",
      },
    ],
    not: {
      sideways: "no sideways row",
      position: "nothing opens inside it",
      dragUp: "it opens all the way up and stays the one full-height card",
      dragDown: "all the way up by design; a drag lets the map show, checked in emergency.spec",
    },
  },
  {
    name: "Ready to Fly's prompt",
    card: "ready-prompt",
    close: "sheet-close",
    question: true,
    entries: [
      {
        name: "a dry run started",
        open: async (p) => {
          await pickAirplane(p);
          await go(p, ROUTE);
          await openPanel(p);
          await openProfile(p);
          const start = sideDrawer(p).getByTestId("dry-run-start");
          await expect(start).toBeVisible({ timeout: slow(60_000) });
          await start.click();
          await expect(p.getByTestId("ready-prompt")).toBeVisible({ timeout: slow(10_000) });
        },
        // The Profile card the dry run was started from, as it was.
        back: "profile",
      },
    ],
    not: {
      searchHidden: "a question is a sheet over the page (SheetDialog), not a card in the map's sheet",
      nested: "a question is a sheet over the page (SheetDialog), not a card over the map's sheet",
      scroll: "a question is short",
      dragUp: "a question's own sheet, not the map's",
      dragDown: "a question's own sheet, not the map's",
      textSize: "a question is short",
      sideways: "no sideways row",
      position: "nothing opens inside it",
      desktop: "on a desktop it is a centred alert (dialog-close), checked in ready-to-fly.spec",
    },
  },
];

// Ask is not a card on the web: its answers are a section of the search's
// own page (SearchHome's AskSection), and design/screens.json lists `ask`
// for iOS and Android only, so it has no row here.
