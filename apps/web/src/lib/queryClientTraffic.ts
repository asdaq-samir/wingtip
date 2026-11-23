import { queryOptions } from "@tanstack/react-query";
import { api } from "./api/client";

/* The live traffic's queries (wingtip.traffic), one set of options each for
 * every reader of a tracked airplane: its card, the map's path and the
 * alerts set on it (queryClient's note on why they are defined once). */
/** A tracked flight's airplane, where it took off and its path today
 *  (wingtip.traffic.flight): read again every minute while it is tracked, by
 *  its card and the map's path alike. Quiet: the card says what it has. */
export const flightQuery = (hex: string) =>
  queryOptions({
    queryKey: ["flight", hex],
    queryFn: () => api.trafficFlight(hex),
    staleTime: 60_000,
    refetchInterval: 60_000,
    meta: { silent: true },
  });

/** An airplane's state now, for the alerts a pilot set on it
 *  (AircraftAlerts): asked every fifteen seconds while the app is open and
 *  an alert waits on it -- the planner reads adsb.lol's recent trace, a
 *  static file, no turn of its API -- and not while the page is hidden.
 *  Quiet: a missed answer is the next one's to make up. */
export const flightStatusQuery = (hex: string) =>
  queryOptions({
    queryKey: ["flight-status", hex],
    queryFn: () => api.trafficStatus(hex),
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: false,
    meta: { silent: true },
  });

/** The route a tracked flight's number is scheduled to fly, asked once a
 *  callsign (wingtip.traffic.route; the planner keeps it six hours): where the
 *  airplane is says whether it is on it, so the position, to a degree, is
 *  in the key and a diversion or a reused callsign is asked again. Quiet,
 *  as the flight's. */
export const routeQuery = (callsign: string | null, at: { lat: number; lon: number } | null) =>
  queryOptions({
    queryKey: ["route", callsign, at ? Math.round(at.lat) : null, at ? Math.round(at.lon) : null],
    queryFn: () => api.trafficRoute({ callsign: callsign!, ...at }),
    enabled: !!callsign,
    staleTime: 30 * 60_000,
    meta: { silent: true },
  });
