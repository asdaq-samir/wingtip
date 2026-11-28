import { queryOptions } from "@tanstack/react-query";
import { api } from "./api/client";
import type { Flying } from "./airplaneKind";

/* The pilot's own records, kept by the gateway, and the airplanes' book
 * figures: one set of options each for all their readers (queryClient's
 * note on why they are defined once). */
/** How long the pilot's own records are fresh: a minute, as their
 *  airplanes, currency and what falls due are. Each change made here sets
 *  or invalidates its query (SaveFlight, refreshLogbook, the checkride's
 *  `keep`), and a sign-out drops them (useLogout); with none, each was
 *  stale at once, and every console, panel and tab that mounted it, and
 *  every return to the window, asked the gateway again for the same list
 *  (the logbook's four readers, the flights' three). */
export const RECORDS_FRESH_MS = 60_000;

/** The pilot's saved flights, for FPL's Saved and its list in full: quiet,
 *  each saying in place what it could not fetch (QueryState). */
export const flightsQuery = queryOptions({
  queryKey: ["flights"],
  queryFn: () => api.flights.list(),
  staleTime: RECORDS_FRESH_MS,
  meta: { silent: true },
});

/** The pilot's training record: the logbook's, the checkride's, the
 *  Brief's solo review's, a flight's page's. */
export const trainingQuery = queryOptions({ queryKey: ["training"], queryFn: () => api.training.get(), staleTime: RECORDS_FRESH_MS });

/** The pilot's logbook, for the You page's hours, the Logbook, its flights'
 *  list and the coach: one set of options for its four readers. Quiet,
 *  each list saying in place what it could not fetch (QueryState). */
export const logbookQuery = queryOptions({
  queryKey: ["logbook"],
  queryFn: () => api.logbook.list(),
  staleTime: RECORDS_FRESH_MS,
  meta: { silent: true },
});

/** The pilot's own airplanes, for the aircraft chips, the Brief and
 *  Setup's Aircraft: fresh for a minute. */
export const aircraftListQuery = queryOptions({ queryKey: ["aircraft"], queryFn: () => api.aircraft.list(), staleTime: 60_000 });

/** The airplanes' book figures the planner flies: the same while the page
 *  is open. */
export const aircraftProfilesQuery = queryOptions({
  queryKey: ["aircraftProfiles"],
  queryFn: () => api.aircraftProfiles(),
  staleTime: Infinity,
});

/** The pilot's currency from the logbook, judged for the airplane to be
 *  flown where it is known (lib/useCurrency): fresh for a minute. Kept
 *  under "currency" with it, so a change to the logbook asks each again. */
export const currencyQuery = (flying: Flying | null) =>
  queryOptions({ queryKey: ["currency", flying], queryFn: () => api.logbook.currency(flying), staleTime: 60_000 });

/** What falls due for the pilot and their airplanes (the Logbook's Coming
 *  up): fresh for a minute. */
export const paperworkQuery = queryOptions({ queryKey: ["paperwork"], queryFn: () => api.paperwork(), staleTime: 60_000 });
