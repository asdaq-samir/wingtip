import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { TrafficAircraft, TrafficFound } from "../api/types";
import { reportedAltitude } from "../format/figures";
import { NO_CONNECTION, noConnection } from "../problems";
import { useDebounced } from "../useDebounced";

/**
 * An airplane looked up by its N-number, in two answers asked at once (the
 * owner, 2026-11-14: "Why does looking up a plane takes a long time?"): the
 * FAA's record, which the planner reads off its own disk in milliseconds,
 * and whether it is in the air now, which waits on the live sources --
 * ADS-B Exchange, then adsb.lol, whose API takes a search in its turn behind
 * the map's regions, seconds at a time. The record was only given with the
 * live answer, so every N-number waited about five seconds for its type.
 */

/** The FAA's record of the airplane an N-number names, or null where the
 *  registry has none: kept a day, as the registry is written once a day. */
export const registeredQuery = (tail: string) =>
  queryOptions({
    queryKey: ["registered", tail],
    queryFn: () => api.trafficRegistered(tail),
    staleTime: 24 * 60 * 60_000,
    meta: { silent: true },
  });

/** A live search adsb.lol could not be asked for (`checked` false), asked
 *  again this many times… */
export const SEARCH_RETRIES = 3;
/** …this long apart: past the planner's fifteen-second wait after adsb.lol
 *  turns it away (wingtip.traffic BACKOFF_S), in three tries. */
const SEARCH_RETRY_MS = 6_000;

/** The airplanes in the air by a name (the planner's /api/traffic/find),
 *  asked again while adsb.lol could not be asked (`checked` false), three
 *  times at most. Quiet: whoever shows it says what it has, in place. */
export const liveFindQuery = (name: string) =>
  queryOptions({
    queryKey: ["trafficFind", name],
    queryFn: () => api.trafficFind(name),
    staleTime: 30_000,
    refetchInterval: (query) =>
      query.state.data?.checked === false && query.state.dataUpdateCount <= SEARCH_RETRIES ? SEARCH_RETRY_MS : false,
    meta: { silent: true },
  });

/** Whether the airplane named is in the air, as far as is known now. */
export type InAir =
  | { state: "checking" }
  | { state: "flying"; plane: TrafficAircraft }
  | { state: "ground" }
  /** adsb.lol could not be asked: `again` while its tries go on. */
  | { state: "unknown"; again: boolean }
  | { state: "failed"; offline: boolean };

/** The live find's answer read for one airplane: the one in the air with
 *  that address where the FAA's record gives one, else the first found. */
export function inAirOf(
  find: { data?: TrafficFound; isError: boolean; error?: unknown; failureReason?: unknown; fetchStatus?: "fetching" | "paused" | "idle" },
  hex?: string | null,
  /** How many answers it has had: the tries spent while adsb.lol is busy. */
  answers = 0,
): InAir {
  const { data } = find;
  if (!data) return find.isError || noConnection(find) ? { state: "failed", offline: noConnection(find) } : { state: "checking" };
  const plane = data.aircraft.find((a) => !hex || a.hex.toLowerCase() === hex.toLowerCase()) ?? null;
  if (plane) return { state: "flying", plane };
  if (data.checked === false) return { state: "unknown", again: answers <= SEARCH_RETRIES };
  return { state: "ground" };
}

/** What a list or a card says of it, in place (lib/problems): the words,
 *  and whether they are a problem's. */
export function inAirWords(inAir: InAir): { text: string; problem: boolean } {
  switch (inAir.state) {
    case "checking":
      return { text: "Checking whether it's in the air…", problem: false };
    case "flying": {
      const { altitude_ft: ft, speed_kt: kt } = inAir.plane;
      const how = [ft == null ? null : reportedAltitude(ft), kt == null ? null : `${Math.round(kt)} kt`].filter(Boolean);
      return { text: ["In the air", ...how].join(" · "), problem: false };
    }
    case "ground":
      return { text: "Not in the air now", problem: false };
    case "unknown":
      return inAir.again
        ? { text: "adsb.lol is busy; checking again…", problem: false }
        : { text: "Whether it's in the air isn't known now. Try again in a moment.", problem: true };
    case "failed":
      return inAir.offline
        ? { text: NO_CONNECTION, problem: true }
        : { text: "Couldn't check whether it's in the air. Try again in a moment.", problem: true };
  }
}

/** What is typed waits this long for the next letter before the live find
 *  is asked: each is one of ADS-B Exchange's month of requests, or a turn
 *  adsb.lol paces, and "N1", "N12"... are each an N-number on the way. */
const TYPING_MS = 500;

/**
 * An N-number's two answers, asked at once: the FAA's record as soon as the
 * planner reads it off its disk, and whether the airplane is in the air
 * once the live find answers (`live` false: the record alone). The view
 * says each as it comes: the record's type at once, "Checking whether it's
 * in the air…" until the find is back.
 */
export function useTailLookup(tail: string | null, live = true) {
  const registry = useQuery({ ...registeredQuery(tail ?? ""), enabled: !!tail });
  const asked = useDebounced(tail, TYPING_MS);
  const settled = live && !!tail && asked === tail;
  const liveFind = liveFindQuery(tail ?? "");
  const find = useQuery({ ...liveFind, enabled: settled });
  const answers = useQueryClient().getQueryState(liveFind.queryKey)?.dataUpdateCount ?? 0;
  const record = registry.data ?? null;
  const inAir: InAir = settled ? inAirOf(find, record?.mode_s_hex, answers) : { state: "checking" };
  return {
    record,
    /** The record still being fetched. */
    fetching: registry.isFetching,
    /** Its ICAO address, the FAA's, for its flights; null where none. */
    hex: record?.mode_s_hex?.toLowerCase() ?? null,
    inAir,
    inAirWords: inAirWords(inAir),
  };
}
