import { queryOptions } from "@tanstack/react-query";
import { api } from "../api/client";

// An airplane's whole public record (the planner's /api/airplanes/{n_number},
// wingtip.aircraft_details) and its photo apart, for the airplane card's Info and header.

/** Everything public about the airplane, asked again while where it is based is looked up. */
export const airplaneDetailsQuery = (tail: string) =>
  queryOptions({
    queryKey: ["airplane-details", tail],
    queryFn: () => api.airplaneDetails(tail),
    staleTime: 60 * 60_000,
    refetchInterval: (query) => (query.state.data?.based_pending && query.state.dataUpdateCount <= 5 ? 5_000 : false),
    meta: { silent: true },
  });

/** Its photo, apart, so the record never waits on Planespotters.net. */
export const airplanePhotoQuery = (tail: string) =>
  queryOptions({
    queryKey: ["airplane-photo", tail],
    queryFn: () => api.airplanePhoto(tail),
    staleTime: 24 * 60 * 60_000,
    meta: { silent: true },
  });
