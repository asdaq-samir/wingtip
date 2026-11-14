import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTailLookup } from "../../lib/airplane/lookup";
import { useAddress } from "../../lib/address";
import { aircraftKind } from "../../lib/aircraftKind";
import { useTracking } from "../../lib/map/position/tracking";
import { usePreferences, type KeptAircraft } from "../../lib/preferences";
import { shareOrCopy } from "../../lib/share";
import { pastFlightsQuery } from "../plan/components/pastFlightsQuery";
import { statusLine } from "./airplaneStatus";

/**
 * What the airplane card says of the airplane itself, laid out as the
 * airport card is (the owner's P1, 2026-11-14, "Ok I take your rec"; the
 * canvas https://claude.ai/artifact/XFZoWyJWzov7RCwRRPH253): its FAA record
 * for the line under its name and the Info tab, its flights by the address
 * the registry gives its N-number, the actions Follow, Favorite and Share
 * as the flight card has them, and the one status line. Every N-number,
 * the pilot's own airplanes' too.
 */
export function useAirplaneCard(tail: string) {
  const lookup = useTailLookup(tail || null);
  const { record, hex, inAir } = lookup;
  const [, setAddress] = useAddress();
  // Its flights, newest first: the Flights tab's list (PastFlights, the same query) and the status
  // line's last landing. Undefined while still being looked for, back through the archive.
  const past = useInfiniteQuery({ ...pastFlightsQuery(hex ?? "", null), enabled: !!hex });
  const listed = past.data?.pages.flatMap((page) => page.flights ?? []);
  const flights = listed?.length || (past.data && !past.hasNextPage) ? listed : undefined;
  // Kept as the flight card keeps one (FlightCard's Favorite): by its address, its N-number its name.
  const kept = useMemo<KeptAircraft | null>(
    () => (hex ? { hex, name: tail, type: record?.model ?? null, kind: aircraftKind({ faa: record ?? undefined }) } : null),
    [hex, tail, record],
  );
  const starred = usePreferences((s) => !!hex && s.favoriteAircraft.some((a) => a.hex === hex));
  const line = record ? [[record.manufacturer, record.model].filter(Boolean).join(" "), record.year].filter(Boolean).join(", ") : null;
  return {
    record,
    hex,
    /** Under its name: "Piper PA-28-140, 1971", the registry's; null where it has none. */
    line,
    status: statusLine(inAir, flights),
    /** In the air: its flight's card, tracked (FlightCard). */
    track: inAir.state === "flying" ? () => useTracking.getState().pick?.(inAir.plane.hex, inAir.plane) : null,
    airborne: inAir.state === "flying",
    /** The flights found so far, the Flights tab's hint. */
    flightCount: listed?.length ?? null,
    kept,
    starred,
    toggleFavorite: () => {
      if (kept) usePreferences.getState().toggleFavoriteAircraft(kept);
    },
    /** The card's link, shared where the device can, copied where not, as the flight card's. */
    share: () =>
      void shareOrCopy({ title: tail, url: `${location.origin}/app/plan?airplane=${tail}` }).catch(() => {
        /* put away, or not allowed: nothing to say */
      }),
    /** One of its past flights' cards, its replay, over this one (PastFlightCard, `?flight=&past=`). */
    openPast: (id: number) => {
      if (hex) void setAddress({ flight: hex, past: id, place: null, at: null, near: null, nearAt: null, nearName: null });
    },
  };
}
