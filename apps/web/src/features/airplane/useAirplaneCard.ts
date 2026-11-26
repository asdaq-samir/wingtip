import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { airplaneDetailsQuery, airplanePhotoQuery } from "../../lib/airplane/details";
import { useTailLookup } from "../../lib/airplane/lookup";
import { useAirplaneHistory } from "../../lib/airplane/ownAirplane";
import { pastFlightsQuery } from "../../lib/airplane/pastFlightsQuery";
import { aircraftKind } from "../../lib/aircraftKind";
import type { KeptAircraft } from "../../lib/preferences";
import { useMinuteClock } from "../../lib/useMinuteClock";
import { statusLine } from "./airplaneStatus";

/**
 * What the airplane card says of the airplane itself, laid out as the
 * airport card is (the owner's P1, 2026-11-14, "Ok I take your rec"; the
 * canvas https://claude.ai/artifact/XFZoWyJWzov7RCwRRPH253): its FAA record
 * for the line under its name and the Info tab, its flights by the address
 * the registry gives its N-number, what it is kept as, and the one
 * status line on the ground. Every N-number, the pilot's own airplanes'
 * too; the flight in the air is the card's other half (useFlightLive).
 */
export function useAirplaneCard(tail: string, known: string | null = null) {
  const lookup = useTailLookup(tail || null);
  const { record, inAir } = lookup;
  // Its ICAO address the registry's, else the one the card was opened by (traffic's).
  const hex = lookup.hex ?? known;
  // The rest of its public record and its photo, for Info: by its N-number, apart from the record
  // above, so the card never waits on them (lib/airplane/details).
  const details = useQuery({ ...airplaneDetailsQuery(tail), enabled: !!tail });
  const photo = useQuery({ ...airplanePhotoQuery(tail), enabled: !!tail });
  // Its flights, Alerts and history: the pilot's own always, another's while Other Airplanes is
  // on in Settings' Extras (lib/airplane/ownAirplane), else neither offered nor fetched.
  const history = useAirplaneHistory(hex, tail);
  // Its flights, newest first: the Flights tab's list (PastFlights, the same query) and the status
  // line's last landing. Undefined while still being looked for, back through the archive.
  const past = useInfiniteQuery({ ...pastFlightsQuery(hex ?? "", null), enabled: !!hex && history });
  const listed = past.data?.pages.flatMap((page) => page.flights ?? []);
  const flights = listed?.length || (past.data && !past.hasNextPage) ? listed : undefined;
  // Kept as traffic is kept (useFlightLive): by its address, its N-number its name.
  const kept = useMemo<KeptAircraft | null>(
    () => (hex ? { hex, name: tail, type: record?.model ?? null, kind: aircraftKind({ faa: record ?? undefined }) } : null),
    [hex, tail, record],
  );
  // "landed 20m ago" as of this minute: the compiler keeps a call's answer
  // while its inputs are the same, so a Date.now() inside it froze the age.
  const now = useMinuteClock();
  const line = record ? [[record.manufacturer, record.model].filter(Boolean).join(" "), record.year].filter(Boolean).join(", ") : null;
  return {
    record,
    details: details.data,
    detailsFailed: details.isError,
    photo: photo.isError ? null : photo.data,
    hex,
    /** Whether its Alerts, flights and history are offered (useAirplaneHistory). */
    history,
    /** Under its name: "Piper PA-28-140, 1971", the registry's; null where it has none. */
    line,
    status: statusLine(inAir, flights, now),
    /** In the air by the live find: its report, for the card to track it (AirplaneCard). */
    flyingPlane: inAir.state === "flying" ? inAir.plane : null,
    /** The flights found so far, the Flights tab's hint. */
    flightCount: listed?.length ?? null,
    kept,
  };
}
