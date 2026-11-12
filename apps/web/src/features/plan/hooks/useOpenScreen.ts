import { useEffect } from "react";
import type { Address, SetAddress } from "../../../lib/address";
import { useWantedPage } from "../../../components/wantedPage";
import { openEmergency } from "../../../lib/emergencyStore";
import { useConsoleOpen, type PanelState } from "../../../lib/mapChrome";
import { SCREEN_LINK, screenOf, type ScreenId } from "../../../lib/navigation/generated/screens";
import { stale, takeScreen, useWanted, wantScreen } from "../../../lib/navigation/wanted";
import { tailOf } from "../../../lib/aircraftChoice";
import { openAirplaneProfile } from "../../../lib/airplane/profileStore";
import { usePreferences } from "../../../lib/preferences";
import type { PanelView } from "./usePanelView";
import { riseToSee } from "./panelNow";

/** The account page's pages a screen is (the account button's page, which
 *  took Setup's place), as the path of page keys down to it
 *  (components/wantedPage): the page alone is none. */
const SETUP_PAGES: Partial<Record<ScreenId, string[]>> = {
  setup: [],
  flights: ["flights"],
  airplanes: ["aircraft"],
  logbook: ["logbook"],
  // Setup's own rows since 2026-11-09 (SetupRows), two taps from the map.
  coach: ["coach"],
  checklists: ["checklists"],
  minimums: ["minimums"],
  guide: ["guide"],
  about: ["about"],
};

/** The screens drawn over a route, which wait for one. */
const OVER_ROUTE = new Set<ScreenId>(["brief", "navlog", "profile"]);

/**
 * Any screen opened by its name (design/screens.json): a link's `open=`,
 * read off the address once and put away, or an ask from inside the app
 * (lib/navigation/wanted). The one place the web says how each screen is
 * opened -- the switch below is over the generated list, so a screen added
 * there fails the type check here until it opens.
 */
export function useOpenScreen({
  routed,
  address,
  setAddress,
  setViewPick,
  setPanel,
  openBrief,
  openNavLogCard,
  openProfileCard,
  openNearest,
}: {
  routed: boolean;
  address: Address;
  setAddress: SetAddress;
  setViewPick: (view: PanelView) => void;
  setPanel: (state: PanelState) => void;
  openBrief: () => void;
  openNavLogCard: () => void;
  openProfileCard: () => void;
  openNearest: () => void;
}) {
  // The link's own word, taken off the address so a reload or Back does
  // not open the screen again.
  const linked = address[SCREEN_LINK.key];
  useEffect(() => {
    if (linked === null) return;
    const screen = screenOf(linked);
    if (screen) wantScreen(screen);
    void setAddress({ [SCREEN_LINK.key]: null });
  }, [linked, setAddress]);

  const wanted = useWanted((s) => s.screen);
  useEffect(() => {
    if (!wanted) return;
    // A link with the route in it is planned first: the Brief waits for it.
    if (OVER_ROUTE.has(wanted) && !routed && !stale()) return;
    const screen = takeScreen();
    if (!screen) return;
    const pages = SETUP_PAGES[screen];
    useConsoleOpen.getState().setOpen(!!pages);
    if (pages) {
      // Settings' own card all the way up (ConsoleLayer's `opens`).
      if (pages.length) useWantedPage.getState().want(pages);
      return;
    }
    switch (screen) {
      // The tabs that were (the one search, 2026-11-09): FPL is the plan,
      // Airport the search's own page, Airplane the airplane picked's
      // profile -- the traffic about where none is picked -- and Setup the
      // account page (SETUP_PAGES, above).
      // The sheet's two pages (SheetPager, the owner 2026-11-11): FPL the plan's, Search the one search's.
      case "fpl":
        setViewPick("plan");
        riseToSee(setPanel);
        return;
      case "search":
      case "airport":
        setViewPick("search");
        riseToSee(setPanel);
        return;
      case "airplane": {
        const tail = tailOf(usePreferences.getState().aircraft);
        if (tail) {
          openAirplaneProfile(tail);
          return;
        }
        void setAddress({ aircraft: true });
        riseToSee(setPanel);
        return;
      }
      case "brief":
      case "navlog":
      case "profile":
        setViewPick("plan");
        if (!routed) return;
        if (screen === "brief") openBrief();
        else if (screen === "navlog") openNavLogCard();
        else openProfileCard();
        return;
      case "favorites":
        void setAddress({ list: "favorites" });
        riseToSee(setPanel);
        return;
      case "nearest":
        openNearest();
        return;
      case "emergency":
        openEmergency("link");
        return;
      case "setup":
      case "flights":
      case "airplanes":
      case "logbook":
      case "coach":
      case "checklists":
      case "minimums":
      case "guide":
      case "about":
        return;
      // A shared flight's preview is opened by its link alone, taken off
      // the address as the page loads (features/shared-flight), with the
      // plan it needs; asked for by name, there is none to show.
      case "shared":
        return;
      default:
        screen satisfies never;
    }
  }, [wanted, routed, setAddress, setViewPick, setPanel, openBrief, openNavLogCard, openProfileCard, openNearest]);
}
