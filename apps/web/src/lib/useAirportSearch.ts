import { createContext, useContext, useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "./api/client";
import { searchIndex, useAirportIndex, type AirportSearchRow } from "./airportIndex";
import { useOwnShipNear } from "./map/position/ownShip";
import { useDebounced } from "./useDebounced";

/** Where the route is, as its ends' "lat,lon;lat,lon", for a stop's
 *  search (PlanWorkspace provides it round the route's box): of an
 *  ident's navaids in two places -- "AA", a beacon in North Dakota and
 *  another in Georgia -- the one the route will fly over is the one named
 *  (the planner's `near`). Empty off a route. */
export const SearchNear = createContext("");

/** How long a search's answer is good for: the fields and waypoints it
 *  reads change with the FAA's 28-day cycle, not while a pilot types. */
const SEARCH_FRESH_MS = 10 * 60_000;

/**
 * The airports whose ident or name starts with what is typed -- the
 * route form's pickers (AirportPicker) and the panel's search bar
 * (PanelCapsule) alike -- and, with `fixes`, a stop's: the VFR and GPS
 * waypoints too. The airports from the phone's own copy of the search
 * (lib/airportIndex) once it is in, at each letter, at the pilot's ask:
 * each letter's question waited on the planner, and a second and more
 * while it planned a route (0.2 to 1.5 s, measured 2026-10-09). A stop's
 * waypoints are still the planner's, a debounce and a request behind the
 * typing, the airports shown meanwhile; so are the airports until the
 * copy is in. `answered` says whether the rows are the answer to what is
 * in the box now, which is when Enter may take the first of them;
 * `airportsAnswered` whether the airports are, for the list to show them
 * at once while the waypoints are still asked.
 */
export function useAirportSearch(text: string, enabled = true, fixes = false) {
  const typed = text.trim();
  // 100ms, not on every keystroke -- a lookup this app already treats as
  // cheap server-side (an index of idents and words) still isn't worth a
  // request per character while someone's still mid-word. It was 200,
  // which with the answer's own time read as the suggestions lagging the
  // typing.
  const q = useDebounced(typed, 100);
  // Of fields alike, the nearest first: to the route where a stop is
  // typed, else to the pilot where own ship has a fix.
  const route = useContext(SearchNear);
  const own = useOwnShipNear();
  const by = route || (own ? `${own.lat.toFixed(2)},${own.lon.toFixed(2)}` : "");
  const index = useAirportIndex(enabled, typed.length > 0);
  // Once per typed value: the scan covers every row, and the panel
  // re-renders for much besides typing (map moves, weather, sheet drags).
  const local = useMemo(() => {
    if (!index || !typed) return null;
    const near = by
      .split(";")
      .map((pair) => pair.split(",").map(Number))
      .filter((p) => p.length === 2 && p.every(Number.isFinite))
      .map(([lat, lon]) => ({ lat: lat!, lon: lon! }));
    return searchIndex(index, typed, 8, near);
  }, [index, typed, by]);
  const { data, isPlaceholderData, isFetching } = useQuery({
    queryKey: ["airportSearch", q, fixes, by],
    // A letter's ask let go once the next letter asks (react-query's signal).
    queryFn: ({ signal }) => api.airportSearch(q, fixes, by, signal),
    // Airports alone and the copy in: nothing to ask.
    enabled: enabled && q.length > 0 && (fixes || !index),
    // The same letters' answer kept (SEARCH_FRESH_MS): with none, each
    // letter taken back and typed again, and each picker opened on them,
    // asked the planner the same question again.
    staleTime: SEARCH_FRESH_MS,
    placeholderData: keepPreviousData,
  });
  const asked = q === typed && !isPlaceholderData && !!data;
  // The planner's waypoints for what is typed, else the last answer's that
  // still match it: the group narrows as letters come, not emptied and
  // filled again at each.
  const fixRows = useMemo(() => {
    if (!fixes || !local || !data) return NONE;
    const upper = typed.toUpperCase();
    const all = data.filter((r) => r.kind === "fix");
    return asked ? all : all.filter((r) => r.ident.toUpperCase().startsWith(upper));
  }, [fixes, local, data, asked, typed]);
  const rows = useMemo(() => (local ? merged(local, fixRows, typed) : NONE), [local, fixRows, typed]);
  if (local && !fixes) return { typed, rows: local, answered: true, airportsAnswered: true };
  // A stop's: the copy's airports at each letter, ranked where the pilot
  // reads them and never replaced by the planner's own order -- the top
  // row swapped some 200 ms after a letter, under an Enter or a tap, for
  // another field -- and the planner's waypoints merged in as it answers.
  // `answered` waits on the planner, which an Enter of what is typed reads
  // (a waypoint the airports do not have); once it has failed or the
  // phone is offline the query has settled, and Enter may take the first.
  if (local) return { typed, rows, answered: asked || (q === typed && !isFetching), airportsAnswered: true };
  const answered = q === typed && !isPlaceholderData;
  return { typed, rows: typed && q ? (data ?? NONE) : NONE, answered, airportsAnswered: answered };
}

const NONE: AirportSearchRow[] = [];

/** The copy's airports with the planner's waypoints: one whose ident is
 *  what is typed first (a navaid typed whole, ORD), the rest after the
 *  airports. */
function merged(airports: AirportSearchRow[], fixRows: AirportSearchRow[], typed: string): AirportSearchRow[] {
  if (fixRows.length === 0) return airports;
  const upper = typed.toUpperCase();
  const whole = fixRows.filter((r) => r.ident.toUpperCase() === upper);
  return [...whole, ...airports, ...fixRows.filter((r) => r.ident.toUpperCase() !== upper)];
}
