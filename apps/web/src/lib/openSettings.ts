import { create } from "zustand";
import { useConsoleOpen } from "./mapChrome";
import { wantScreen } from "./navigation/wanted";
import { useWantedPage } from "./navigation/wantedPage";

/** You, the avatar's card (the owner's pick, option A of the account
 *  canvas, 2026-11-13: who the pilot is and what is theirs), opened as a
 *  link's `open=setup` opens it (useOpenScreen): its own card over
 *  whatever is up, its ✕ back to it. The account button's. */
export function openYou() {
  wantScreen("setup");
  useConsoleOpen.getState().setOpen(true);
}

/** A group of Settings' page a way in may open it at. */
export type SettingsGroup = "map";

/** The group Settings' page scrolls to as it opens, taken once by it
 *  (features/settings). */
export const useSettingsGroup = create<{ group: SettingsGroup | null }>(() => ({ group: null }));

/** The app's Settings, the one way in to it: You opened with its Settings
 *  page over it (the page's row's key, components/ConsolePages), its ✕
 *  back to what was up (You itself where it was already up), at `group` where one is asked for -- the Map
 *  card's gear opens it at Map (components/SettingsButton; the owner,
 *  2026-11-13). */
export function openSettings(group?: SettingsGroup) {
  // From You's own gear, You already up: Settings is a page of it, its
  // close back to You rather than out to the map.
  const inside = useConsoleOpen.getState().open;
  openYou();
  useSettingsGroup.setState({ group: group ?? null });
  useWantedPage.getState().want(["settings"], inside);
}
