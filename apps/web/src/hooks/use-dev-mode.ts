import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import { ENDS_KEYS } from "../lib/address";
import { capabilitiesQuery, pilotQuery } from "../lib/queryClient";

/** The route the two pages share -- dep, dest, altitude -- carried
 *  across; Plan's own `view` is not, Dev has no briefing. */
export function routeSearch(search: string): string {
  const params = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const key of [...ENDS_KEYS, "altitude_ft"]) {
    const value = params.get(key);
    if (value) kept.set(key, value);
  }
  const s = kept.toString();
  return s ? `?${s}` : "";
}

/**
 * Dev mode, off or on: the same page with the developer's drawers in
 * place of the pilot's. One control, Pilot and Developer in the
 * console's title (ConsoleHeader), instead of a Dev link on one page
 * and a Plan link on the other, and then a switch in the settings.
 * Flipping it navigates; the console stays out across it (useConsoleOpen). The route on screen comes along both ways,
 * and where Plan was (the open briefing, say) is remembered on the way
 * to Dev and restored on the way back -- plain location state, not
 * lifted into every caller's own props.
 *
 * Offered only to someone it is for. The training workspace and the
 * developer console are work on the model, not on a flight, so a pilot
 * has no business there and does not see the way in. Two conditions,
 * either of which is enough:
 *
 *   - the signed-in pilot has the developer role (pilots.role, V7)
 *   - the deployment is open to everyone (`access` "OPEN")
 *
 * The second is not a loophole: with no Google or Apple credentials and
 * no mail host there is no way to hold a role, and a deployment that
 * says to open up (app.open-writes) means everyone. One that cannot
 * sign anyone in and did not say so ("CLOSED") refuses every developer
 * path, and used to be offered the switch all the same. A real
 * deployment has sign-in configured, and there the role is the whole
 * answer.
 *
 * Both queries are quiet on failure: the settings are not the place to
 * report that a capability probe 500'd, and either failing simply
 * leaves the switch out. `refused` is someone it is not for on the dev
 * page -- signed out from the developer console, or a session that
 * ended -- whom DevGuard takes to the map.
 */
export type AppMode = "pilot" | "developer" | "studio";

/** The page a mode is, by its address. */
export function modeOf(pathname: string): AppMode {
  return pathname.startsWith("/dev") ? "developer" : pathname.startsWith("/studio") ? "studio" : "pilot";
}

export function useDevMode() {
  const { data: pilot, isSuccess: pilotKnown } = useQuery(pilotQuery);
  const { data: capabilities } = useQuery(capabilitiesQuery);
  const { pathname, state } = useLocation();
  const navigate = useNavigate();
  const mode = modeOf(pathname);
  const on = mode === "developer";
  // The Studio (features/studio) is offered and refused as Dev is: the
  // developer's for now, at the owner's pick (2026-11-12, "You only for
  // now"). Its address keeps its own track (`q`, `day`); the route comes
  // and goes as it does to Dev.
  const go = (next: AppMode) => {
    if (next === mode) return;
    // The query as the browser has it: nuqs (lib/address) writes it
    // without the router, whose location keeps the one it last landed.
    const search = window.location.search;
    if (next === "pilot") {
      // No state at all (opened directly, a bookmark or a fresh tab)
      // falls back to the map, with the page's own route.
      const from = (state as { from?: string } | null)?.from;
      void navigate(from ?? `/plan${routeSearch(search)}`);
      return;
    }
    // Where Plan was is remembered on the way to either, and carried
    // between them, for the way back.
    const from = mode === "pilot" ? pathname + search : ((state as { from?: string } | null)?.from ?? undefined);
    void navigate(`/${next === "developer" ? "dev" : "studio"}${routeSearch(search)}`, { state: { from } });
  };
  const flip = () => go(on ? "pilot" : "developer");
  // Undefined while either query is in flight: the switch appears when
  // the answer does, rather than flashing in and out.
  const allowed = pilot?.developer === true || capabilities?.access === "OPEN";
  const refused = mode !== "pilot" && pilotKnown && capabilities !== undefined && !allowed;
  return { on, mode, go, flip, allowed, refused, navigate };
}
