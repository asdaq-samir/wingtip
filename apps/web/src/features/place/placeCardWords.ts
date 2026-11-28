import type { QueryClient } from "@tanstack/react-query";
import type { AirportPin, AirportPlace, ClassBAirport } from "../../lib/api/types";
import type { Geo, LatLon } from "../../lib/geo";
import { awayFrom } from "../../lib/useAway";
import { clockTime, zoneName } from "../../lib/format";
import { sameField } from "../../lib/procedures";
import { callEngine } from "../../lib/engine/engine";

/** "18 nm NE", from wherever the card is measured from. */
function away(geo: Geo, from: LatLon, to: LatLon): string {
  return geo.distanceNm(from, to) < 0.5 ? "here" : awayFrom(geo, from, to);
}

/** How far the field is, for the facts' Distance (2026-11-14), "18 nm NE" from C81. Nothing
 *  where there is nothing to measure from, nor where the start is the
 *  field itself: the departure's own card, with no fix, said "here of
 *  KMSN", as the phones said "From KMSN 0 nm". */
export function distanceOf(geo: Geo | null, place: AirportPlace, from: { point: LatLon; name: string | null } | null): string | null {
  const itself = !!from?.name && (sameField(from.name, place.ident) || (geo?.distanceNm(from.point, place) ?? Infinity) < 0.5);
  if (!geo || !from || itself) return null;
  // "18 nm NE|C81", one string so the card redraws only when it changes; parted again by awayOf.
  return `${away(geo, from.point, place)}|${from.name ?? ""}`;
}

/** The distance's two parts for the fact strip: "18 nm NE", and "C81" or none for own ship. */
export function awayOf(distance: string | null) {
  if (!distance) return null;
  const [words = "", from = ""] = distance.split("|");
  return { words, from: from || null };
}

/** Who may land there, the card's one use line on every app (the owner,
 *  2026-11-13), under its name (PlaceSubtitle): the engine's airport_use_words,
 *  "Private: permission required", "Military: prior permission required",
 *  none for a public or joint-use field; first, one NASR lists as closed,
 *  its label (decision 0043). */
export function kindOf(place: AirportPlace | undefined): string | null {
  if (!place || place.closed) return place?.closed ?? null;
  return callEngine("airport_use_words", { private: place.private, military: place.military ?? null }).words;
}

/** A forecast's hour in the sentence over the hours, this device's clock
 *  with its zone, "15:00 CST": the card says "Observed 0355Z" beside it,
 *  and a bare "15:00" read as either. */
export const zonedClock = (ms: number) => `${clockTime(new Date(ms))} ${zoneName(new Date(ms))}`;

/** An airport's name and weather from whatever the map has already
 *  asked for it in: the fields in view, the route's, the Class B ones. */
export function knownOf(queryClient: QueryClient, ident: string): { name: string; category: string | null } | null {
  for (const key of ["airportsInView", "airportsReporting", "classB"]) {
    for (const [, pins] of queryClient.getQueriesData<(AirportPin | ClassBAirport)[]>({ queryKey: [key] })) {
      const hit = pins?.find((p) => p.ident === ident);
      if (hit) return { name: hit.name, category: hit.flight_category ?? null };
    }
  }
  return null;
}
