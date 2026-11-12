import { useEffect } from "react";
import { routeSearch, useDevMode } from "../hooks/use-dev-mode";
import { useConsoleOpen } from "../lib/mapChrome";
import { useWanted } from "../lib/navigation/wanted";

/** Dev mode's refusal: someone it is not for, on the dev page or the
 *  Studio, is taken
 *  to the map, with the console put away (it stays out across a change
 *  of page otherwise: useConsoleOpen) and nothing left asked for: the
 *  account menu's Setup asks the planner for its screen (wantScreen), which
 *  the dev page never takes, and the planner took it on arriving and opened
 *  the console again over the map just signed out to. Mounted with the
 *  page, not with the console, which is only in the page while it is out. */
export default function DevGuard() {
  const { refused, navigate } = useDevMode();
  useEffect(() => {
    if (!refused) return;
    useConsoleOpen.getState().setOpen(false);
    useWanted.setState({ screen: null });
    // The query as the browser has it, which nuqs writes (lib/address).
    void navigate(`/plan${routeSearch(window.location.search)}`, { replace: true });
  }, [refused, navigate]);
  return null;
}
