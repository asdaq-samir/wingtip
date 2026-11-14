import { useQuery } from "@tanstack/react-query";
import type { Aircraft, AircraftProfileSummary } from "../../../lib/api/types";
import { N_NUMBER } from "../../../lib/aircraftChoice";
import { useTailLookup } from "../../../lib/airplane/lookup";
import { usePreferences, type KeptAircraft } from "../../../lib/preferences";
import { aircraftListQuery, aircraftProfilesQuery, pilotQuery } from "../../../lib/queryClient";

/** What is typed found in a name, ignoring case. */
const finds = (typed: string, name: string) => name.toLowerCase().includes(typed.toLowerCase());

/** The most airplane rows offered at once. */
const MOST = 6;
/** An N-number typed in full: no figure or letter more makes another, by
 *  the engine's N-number rule (N_NUMBER, 14 CFR 47.15(b)); one in full the
 *  registry has no record of is not registered, where a shorter one may yet
 *  be the start of one. */
const whole = (tail: string) => !N_NUMBER.test(`${tail}1`) && !N_NUMBER.test(`${tail}A`);

/** One airplane row, as the one search and the FPL's airplane field both
 *  draw it; what a pick does is each caller's. */
export interface AirplaneRow {
  key: string;
  title: string;
  detail: string;
}

/**
 * The airplanes that answer what is typed, in the groups both the one search
 * and the FPL's airplane field offer them (the owner, 2026-11-14, S1 on
 * https://claude.ai/artifact/XFZoWyJWzov7RCwRRPH253), from this one source so
 * the two cannot drift apart: the pilot's own (their records), the ones kept
 * on this device (their Airplane, Favorites and Recents), the FAA registry's
 * by the N-number typed -- its record at once, from the planner's disk
 * (lib/airplane/lookup), and whether it is in the air where `live` -- and the
 * types the planner flies by the book.
 */
export function useAirplaneHits({ typed, tail, live, enabled }: { typed: string; tail: string | null; live: boolean; enabled: boolean }) {
  const { data: pilot } = useQuery(pilotQuery);
  const { data: records } = useQuery({ ...aircraftListQuery, enabled: !!pilot });
  const { data: profiles } = useQuery(aircraftProfilesQuery);
  const mine = usePreferences((p) => p.myAircraft);
  const favoriteAircraft = usePreferences((p) => p.favoriteAircraft);
  const recentAircraft = usePreferences((p) => p.recentAircraft);
  const ownTail = !!tail && !!records?.some((r) => r.tailNumber.toUpperCase() === tail);
  // The registry's by the N-number typed, where none of the pilot's (lib/airplane/lookup).
  const lookup = useTailLookup(enabled && tail && !ownTail ? tail : null, live);
  const on = enabled && !!typed;

  const own: (AirplaneRow & { record: Aircraft })[] = [];
  for (const r of on ? (records ?? []) : [])
    if (finds(typed, r.tailNumber) || finds(typed, r.typeDesignator))
      own.push({ key: `own-${r.tailNumber}`, title: r.tailNumber, detail: `${r.typeDesignator} · Your airplane`, record: r });

  const kept: (AirplaneRow & { kept: KeptAircraft })[] = [];
  const seen = new Set<string>();
  for (const a of on ? [mine, ...favoriteAircraft, ...recentAircraft] : []) {
    if (!a || seen.has(a.hex)) continue;
    seen.add(a.hex);
    if (own.some((o) => o.title === a.name.toUpperCase())) continue;
    if (finds(typed, a.name) || (a.type && finds(typed, a.type)))
      kept.push({
        key: `kept-${a.hex}`,
        title: a.name,
        detail: [a.type, a.hex === mine?.hex ? "Your airplane" : "Kept"].filter(Boolean).join(" · "),
        kept: a,
      });
  }

  const { record } = lookup;
  const registry =
    on && tail && !ownTail && ![...own, ...kept].some((o) => o.title === tail)
      ? {
          key: `registry-${tail}`,
          title: tail,
          detail: record
            ? `${[[record.manufacturer, record.model].filter(Boolean).join(" "), record.year].filter(Boolean).join(", ")} · FAA registry`
            : lookup.fetching
              ? "Fetching from the FAA registry…"
              : whole(tail)
                ? "Not registered"
                : "Type the rest to look it up",
          /** Typed in full: picked as it is, registered or not; else the start of one. */
          whole: !!record || whole(tail),
          lookup,
        }
      : null;

  // A type the planner flies by its book: flown under an N-number of the pilot's.
  const room = MOST - own.length - kept.length - (registry ? 1 : 0);
  const types: (AirplaneRow & { profile: AircraftProfileSummary })[] =
    on && typed.length >= 2 && room > 0
      ? (profiles ?? [])
          .filter((p) => finds(typed, p.name) || finds(typed, p.type))
          .slice(0, room)
          .map((p) => ({
            key: `type-${p.name}`,
            title: p.name.toUpperCase(),
            detail: `${p.type} · Fly by the book · add your N-number`,
            profile: p,
          }))
      : [];

  return { own, kept, registry, types, ownTail, mineHex: mine?.hex ?? null, profiles };
}
