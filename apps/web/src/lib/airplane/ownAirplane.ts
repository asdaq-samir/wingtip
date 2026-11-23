import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTailOf } from "../aircraftChoice";
import { useExtra } from "../extras";
import { usePreferences } from "../preferences";
import { pilotQuery } from "../queryClient";
import { aircraftListQuery } from "../queryClientRecords";
import { useTailLookup } from "./lookup";

/** The pilot's own airplanes as this device knows them: by ICAO address,
 *  My Plane and the airplane flown; by N-number, the airplane flown, My
 *  Plane and the airplanes on the pilot's record. */
interface OwnAirplanes {
  hexes: ReadonlySet<string>;
  tails: ReadonlySet<string>;
}

export function useOwnAirplanes(): OwnAirplanes {
  const mine = usePreferences((s) => s.myAircraft);
  const flownTail = useTailOf(usePreferences((s) => s.aircraft));
  // The flown airplane's address from the registry, the lookup the
  // airplane card already makes (cached); no live find.
  const flown = useTailLookup(flownTail, false);
  const { data: pilot } = useQuery(pilotQuery);
  const { data: list } = useQuery({ ...aircraftListQuery, enabled: !!pilot });
  // The same sets while what they are made of is, for a caller's memo.
  const mineHex = mine?.hex,
    mineName = mine?.name,
    flownHex = flown.hex;
  return useMemo(() => {
    const hexes = new Set([mineHex, flownHex].filter((h): h is string => !!h).map((h) => h.toLowerCase()));
    const tails = new Set(
      [flownTail, mineName, ...(list ?? []).map((a) => a.tailNumber)].filter((t): t is string => !!t).map((t) => t.toUpperCase()),
    );
    return { hexes, tails };
  }, [mineHex, mineName, flownHex, flownTail, list]);
}

/** Whether an airplane, by address or N-number, is one of the pilot's own. */
export function isOwn(own: OwnAirplanes, hex: string | null | undefined, tail?: string | null): boolean {
  return (!!hex && own.hexes.has(hex.toLowerCase())) || (!!tail && own.tails.has(tail.toUpperCase()));
}

/**
 * Whether an airplane's Follow, past flights and replay, NTSB cases,
 * ownership history, documents and usual base are offered: always for the
 * pilot's own, for any other only while Other Airplanes is on in
 * Settings' Extras (lib/extras; the feature review, 2026-11-21: a private
 * airplane's flights and home field are a person's movements).
 */
export function useAirplaneHistory(hex: string | null | undefined, tail?: string | null): boolean {
  const others = useExtra("otherAirplanes");
  const own = useOwnAirplanes();
  return others || isOwn(own, hex, tail);
}
