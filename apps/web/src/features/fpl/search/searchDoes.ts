import { SCREENS, type ScreenId } from "../../../lib/navigation/generated/screens";
import { wantScreen } from "../../../lib/navigation/wanted";
import { POSITION_NAME, positionIdent } from "../../../lib/identSchema";
import { useOwnShip } from "../../../lib/map/position/ownShip";
import { usePreferences } from "../../../lib/preferences";
import { SCREEN_KEYS, DIRECT_KEY } from "../../../hooks/use-shortcuts";
import type { AirportSearchRow } from "../../../lib/airportIndex";
import type { SearchPick } from "../../../lib/oneSearch";

/** One thing to do: an action, a screen, or the words typed sent as a search round a place (Apple Maps' "Search
 *  Nearby" suggestion, the owner's screenshot, 2026-11-10). */
export interface DoHit {
  key: string;
  label: string;
  keys?: string;
  kind: "action" | "screen" | "nearby";
  run: () => void;
}

/** The screens the search's Do offers by their titles: a link opens any of
 *  them, and none of them needs an argument (a shared flight does). The
 *  tabs that were are the search, the plan and the account, which the
 *  sheet has without a row. */
const OFFERED: ScreenId[] = [
  "brief",
  "navlog",
  "profile",
  "nearest",
  "emergency",
  "flights",
  "favorites",
  "checklists",
  "airplanes",
  "logbook",
  "coach",
  "minimums",
  "guide",
  "about",
];

/** What is typed found in a name, ignoring case. */
const finds = (typed: string, name: string) => name.toLowerCase().includes(typed.toLowerCase());

/** Where the airplane is now, as a route's point, read at the tap. */
const positionNow = () => {
  const fix = useOwnShip.getState().fix;
  return fix ? positionIdent(fix) : null;
};

/**
 * The one search's Do (useOneSearch): My Location for a departure asked
 * for, Direct To the first airport found, the actions and the screens by
 * name, and the words typed sent as a search round a place.
 */
export function doHits(d: {
  typed: string;
  direct: boolean;
  pick: SearchPick | null;
  airplaneAsk: boolean;
  /** Whether a position is known (the fix itself read at the tap). */
  positioned: boolean;
  trafficOn: boolean;
  airports: AirportSearchRow[];
  /** Whether the radio can fly a Direct To. */
  canDirect: boolean;
  pickIdent: (ident: string) => void;
  flyDirect: (ident: string) => Promise<void>;
  startDirect: () => void;
  done: () => void;
  send: (text: string) => void;
}): DoHit[] {
  const { typed, pick, canDirect } = d;
  const does: DoHit[] = [];
  // The departure asked for: where the airplane is, first, as Maps' From
  // offers My Location -- a route may start at a present position, as Fly
  // Here's does (the owner's "Departure → HSKEL → KJAX", 2026-11-13);
  // a pick that says `position: false` not, as where the route is at My
  // Location already (useRouteListEdit's pickEnd).
  if ((pick?.position ?? pick?.label === "Departure") && d.positioned && (!typed || finds(typed, POSITION_NAME)))
    does.push({ key: "my-position", label: POSITION_NAME, kind: "action", run: () => d.pickIdent(positionNow() ?? "") });
  if (d.direct || pick || d.airplaneAsk) return does;
  const first = d.airports[0];
  // Direct To the first airport found, where the radio can fly one.
  if (first && canDirect)
    does.push({ key: "direct-first", label: `Direct to ${first.ident}`, kind: "action", run: () => void d.flyDirect(first.ident) });
  const actions: DoHit[] = [
    { key: "direct", label: "Direct To…", keys: DIRECT_KEY, kind: "action", run: d.startDirect },
    // The traffic on the map, where its page was (2026-11-14): the airplanes
    // heard are found by this search, and a tap on one opens its card.
    { key: "traffic", label: "Show Traffic", kind: "action", run: () => (d.done(), usePreferences.getState().setTraffic(true)) },
  ];
  for (const a of actions)
    if (!typed || finds(typed, a.label)) if ((a.key !== "direct" || canDirect) && (a.key !== "traffic" || !d.trafficOn)) does.push(a);
  for (const id of OFFERED) {
    const title = SCREENS[id].title;
    if (typed && !finds(typed, title)) continue;
    if (!typed && !SCREEN_KEYS[id] && id !== "emergency") continue;
    does.push({ key: `screen-${id}`, label: title, keys: SCREEN_KEYS[id], kind: "screen", run: () => (d.done(), wantScreen(id)) });
  }
  // The words typed sent as a search round a place, Apple's "Search Nearby" row, first.
  if (typed) does.push({ key: "nearby", label: typed, kind: "nearby", run: () => d.send(typed) });
  return does;
}
