import { aircraftKey, choiceOf } from "../../../lib/aircraftChoice";
import { openAirplaneProfile } from "../../../lib/airplane/profileStore";
import { useAirplaneHits } from "../../plan";
import { useHeardHits } from "./useHeardHits";
import type { TrafficAircraft } from "../../../lib/api/types";
import { registeredQuery } from "../../../lib/airplane/lookup";
import type { KeptAircraft } from "../../../lib/preferences";
import { queryClient } from "../../../lib/queryClient";
import { keptOf, keptPlane } from "./keptAircraft";
import { wantScreen } from "../../../lib/navigation/wanted";

/** One airplane the search found: the pilot's own (their record, or one
 *  kept on this device), one the FAA's registry has by the N-number typed,
 *  or a type the planner has a book for. */
export interface AirplaneHit {
  key: string;
  title: string;
  detail: string;
  pick: () => void;
  /** The plan flown in it: one of the pilot's own airplanes, picked as
   *  the plan's airplane straight from the result (the top hit's "Fly This
   *  Airplane", Apple Maps' quick actions in a result, 2026-11-10). */
  fly?: () => void;
  /** Whether it is in the air, said in place as the live find answers (lib/airplane/lookup). */
  live?: { text: string; problem: boolean };
  /** In the air: its card by its ICAO address, tracked (features/airplane). */
  track?: () => void;
}

/**
 * The one search's Airplanes (useOneSearch): from the one source the FPL's
 * airplane field shares (useAirplaneHits), the pilot's own open their
 * profile and fly from the top hit, the kept their flight, the registry's
 * its profile with whether it is in the air, a type the pilot's airplanes;
 * and those the map hears by their callsign or address (useHeardHits), each
 * once. Asked for an airplane to keep (`airplaneAsk`), the one picked is
 * kept rather than opened.
 */
export function useSearchAirplanes(a: {
  typed: string;
  tail: string | null;
  /** Searching: not Direct To nor a picker's ask. */
  enabled: boolean;
  airplaneAsk: boolean;
  pickAirplane: (kept: KeptAircraft, open: (hex: string) => void) => void;
  changeAircraft: (key: string) => void;
  selectFlight: (hex: string, plane?: TrafficAircraft) => void;
  setProblem: (problem: string) => void;
  /** The search let go, once an airplane asked for is kept. */
  done: () => void;
}): AirplaneHit[] {
  const { typed, airplaneAsk, selectFlight } = a;
  const hits = useAirplaneHits({ typed, tail: a.tail, live: true, enabled: a.enabled });
  const known = new Set([...hits.kept.map((k) => k.kept.hex), hits.registry?.lookup.hex]);
  const heard = useHeardHits(typed, a.enabled).filter((h) => !known.has(h.plane.hex));
  // Kept as asked, else opened: the one rule (useSearchPanel's pickAirplane).
  const keep = (kept: KeptAircraft, open: (hex: string) => void) => {
    a.pickAirplane(kept, open);
    if (airplaneAsk) a.done();
  };
  // One named by its N-number asked for to keep -- the pilot's own, the
  // registry's -- by the address on the FAA's record (asked already, so at once).
  const keepTail = async (tail: string) => {
    const record = await queryClient.fetchQuery(registeredQuery(tail)).catch(() => null);
    if (record?.mode_s_hex) keep(keptOf({ ...record, mode_s_hex: record.mode_s_hex }), () => {});
    else a.setProblem(`The FAA's registry gives no address for ${tail}, so it cannot be kept.`);
  };
  return [
    ...hits.own.map(({ record: r, ...row }) => ({
      ...row,
      pick: () => (airplaneAsk ? void keepTail(r.tailNumber) : openAirplaneProfile(r.tailNumber)),
      fly: airplaneAsk ? undefined : () => a.changeAircraft(aircraftKey(choiceOf(r, hits.profiles ?? []))),
    })),
    ...hits.kept.map(({ kept: k, ...row }) => ({ ...row, pick: () => keep(k, selectFlight) })),
    ...(hits.registry ? [registryHit(hits.registry, selectFlight, airplaneAsk ? keepTail : null)] : []),
    ...heard.map(({ plane, ...row }) => ({ ...row, pick: () => keep(keptPlane(plane), () => selectFlight(plane.hex, plane)) })),
    ...(airplaneAsk ? [] : hits.types.map(({ profile: _, ...row }) => ({ ...row, pick: () => wantScreen("airplanes") }))),
  ];
}

/** The registry's row in the one search: its profile, whether it is in the air under it, and
 *  Track where it is. */
function registryHit(
  row: NonNullable<ReturnType<typeof useAirplaneHits>["registry"]>,
  selectFlight: (hex: string, plane?: TrafficAircraft) => void,
  /** Asked for one to keep: kept by its N-number, not opened. */
  keep: ((tail: string) => Promise<void>) | null,
): AirplaneHit {
  const { key, title, detail, lookup } = row;
  const { inAir } = lookup;
  return {
    key,
    title,
    detail,
    live: lookup.inAirWords,
    pick: () => (keep ? void keep(title) : openAirplaneProfile(title)),
    track: !keep && inAir.state === "flying" ? () => selectFlight(inAir.plane.hex, inAir.plane) : undefined,
  };
}
