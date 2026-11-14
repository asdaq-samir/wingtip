import { useMemo } from "react";
import type { TrafficAircraft } from "../../../lib/api/types";
import { inAirWords, type StatusWords } from "../../../lib/airplane/lookup";
import { useTracking } from "../../../lib/map/position/tracking";
import type { AirplaneRow } from "./useAirplaneHits";

const NONE: { plane: TrafficAircraft }[] = [];
/** The most heard airplanes offered at once. */
const MOST = 4;

/** Whether an airplane's callsign, registration or ICAO address begins
 *  with what is typed (spaces and a registration's hyphen aside). */
function named(plane: TrafficAircraft, text: string): boolean {
  const bare = text.replace(/-/g, "");
  return (
    (plane.callsign ?? "").toUpperCase().startsWith(text) ||
    (plane.registration ?? "").replace(/-/g, "").toUpperCase().startsWith(bare) ||
    plane.hex.toUpperCase().startsWith(text)
  );
}

/**
 * The airplanes the map hears whose callsign, registration or ICAO address
 * begins with what is typed, for the one search's Airplanes: found as it is
 * typed, asking nothing, as the traffic's own search found them before it
 * went for the one search (the owner, 2026-11-14). Three letters at least,
 * as two match scores of ICAO addresses; a whole name first, so the top
 * hit is the one named. The heard list is read only while there is
 * something to find in it, so the traffic's every answer does not draw the
 * workspace again.
 */
export function useHeardHits(typed: string, enabled: boolean): (AirplaneRow & { plane: TrafficAircraft; live: StatusWords })[] {
  const wanted = typed.replace(/\s+/g, "").toUpperCase();
  const on = enabled && wanted.length >= 3;
  const seen = useTracking((s) => (on ? s.seen : NONE));
  return useMemo(() => {
    if (!on) return [];
    const bare = wanted.replace(/-/g, "");
    const whole = (p: TrafficAircraft) =>
      (p.callsign ?? "").trim().toUpperCase() === wanted ||
      (p.registration ?? "").replace(/-/g, "").toUpperCase() === bare ||
      p.hex.toUpperCase() === wanted;
    return seen
      .map((r) => r.plane)
      .filter((plane) => named(plane, wanted))
      .sort((a, b) => Number(whole(b)) - Number(whole(a)))
      .slice(0, MOST)
      .map((plane) => ({
        key: `heard-${plane.hex}`,
        title: plane.callsign?.trim() || plane.registration || plane.hex.toUpperCase(),
        detail:
          [plane.type, plane.registration && plane.callsign?.trim() ? plane.registration : null].filter(Boolean).join(" · ") || "Heard now",
        plane,
        live: inAirWords({ state: "flying", plane }),
      }));
  }, [on, seen, wanted]);
}
