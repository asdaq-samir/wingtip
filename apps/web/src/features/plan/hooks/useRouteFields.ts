import { useQueries } from "@tanstack/react-query";
import type { AirportPlace } from "../../../lib/api/types";
import { airportQuery } from "../../../lib/queryClient";
import { fieldPermission, type VerdictItem } from "../../../lib/verdict";

/**
 * The NASR facts of the fields a flight lands at, from each one's card
 * (airportQuery, the answer the airport card reads, so asked once): for
 * the Go / No-Go's fields row (the engine's gonogo_field_permission: a
 * closed, private or military-only departure, stop or destination, 14 CFR
 * 91.103) and for the flight plan's ZZZZ (NASR's ICAO_ID, the engine's
 * filed_zzzz, AIM Appendix 4). A field whose card is not in yet says
 * nothing until it is.
 */
export function useRouteFields(dep: string, stops: readonly string[], dest: string, alternate: string | null) {
  const idents = [...new Set([dep, ...stops, dest, ...(alternate ? [alternate] : [])].filter(Boolean))];
  const places = new Map<string, AirportPlace>();
  const answers = useQueries({ queries: idents.map((ident) => airportQuery(ident)) });
  answers.forEach((a, i) => a.data && places.set(idents[i]!, a.data));
  const facts = (ident: string, role: "departure" | "stop" | "destination") => {
    const place = places.get(ident);
    return {
      ident,
      role,
      private: place?.private ?? null,
      military: place?.military ?? null,
      phone: place?.phone ?? null,
      status: nasrStatus(place),
    };
  };
  const permission: VerdictItem | null =
    dep && dest ? fieldPermission([facts(dep, "departure"), ...stops.map((s) => facts(s, "stop")), facts(dest, "destination")]) : null;
  // NASR's ICAO_ID by ident where the card is in: null where NASR lists
  // none (IL11, filed as ZZZZ); left out where it is not, the engine then
  // reading the ident.
  const icaoIds: Record<string, string | null> = Object.fromEntries([...places].map(([ident, p]) => [ident, p.icao_id ?? null]));
  return { permission, icaoIds };
}

/** NASR's ARPT_STATUS as a field's card carries it, CI or CP, for the
 *  engine's field_status to word ("closed indefinitely (NASR)", not a
 *  bare "closed"); where the card has no NASR record, its label alone:
 *  closed as a code that is not O, open as O. A card not in yet, unknown. */
export function nasrStatus(place: Pick<AirportPlace, "status" | "closed"> | undefined): string | null {
  if (!place) return null;
  return place.status ?? (place.closed ? "" : "O");
}
