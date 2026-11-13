import { create } from "zustand";

/** The Map card's pages, each opened from a row of the one under it
 *  (features/map-settings): its Map Settings, and from those the airport
 *  weather, the alerts and the sources. */
export type MapPage = "settings" | "airport-weather" | "alerts" | "sources";

const TITLES: Record<MapPage, string> = {
  settings: "Map Settings",
  "airport-weather": "Airport Weather",
  alerts: "Alerts",
  sources: "Sources",
};

/** A page's name on the card's head; the Map itself with none open. */
export const mapPageTitle = (page: MapPage | undefined) => (page ? TITLES[page] : "Map");

/** The Map card open (MapSettingsButton opens it, MapSettingsCard draws it):
 *  held here, not in the button, which rides the front sheet's top and is
 *  moved from sheet to card (OnSheetTop). And the pages opened in it, the
 *  last on top: its close goes back one, as every card's does, and the
 *  card closed opens on the Map again. */
export const useMapCard = create<{ open: boolean; pages: MapPage[] }>(() => ({ open: false, pages: [] }));

/** The card opened or put away, on the Map either way. */
export const showMapCard = (open: boolean) => useMapCard.setState({ open, pages: [] });

/** A page of the card opened over the one in sight. */
export const openMapPage = (page: MapPage) => useMapCard.setState((s) => ({ pages: [...s.pages, page] }));

/** Back one page. */
export const closeMapPage = () => useMapCard.setState((s) => ({ pages: s.pages.slice(0, -1) }));
