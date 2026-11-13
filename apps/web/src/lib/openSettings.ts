import { useConsoleOpen } from "./mapChrome";
import { wantScreen } from "./navigation/wanted";

/** The app's Settings opened, as a link's `open=setup` opens it
 *  (useOpenScreen): its own card over whatever is up, its ✕ back to it.
 *  The account button's and the Map card's gear (components/SettingsButton). */
export function openSettings() {
  wantScreen("setup");
  useConsoleOpen.getState().setOpen(true);
}
