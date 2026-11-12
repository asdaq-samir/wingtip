import { queryOptions } from "@tanstack/react-query";
import { data, planner } from "../../lib/api/client";
import type { components } from "../../lib/api/schema";

export type StudioTrack = components["schemas"]["StudioTrack"];
export type StudioWatched = components["schemas"]["StudioWatched"];
type StudioGround = components["schemas"]["StudioGround"];

/** An airplane's UTC day (the planner's /api/studio/track, from the store,
 *  adsb.lol's history read once): a past day never changes, so asked once. */
export const studioTrackQuery = (q: string, day: string) =>
  queryOptions({
    queryKey: ["studioTrack", q.toUpperCase(), day],
    queryFn: () => planner.GET("/api/studio/track", { params: { query: { q, day } } }).then(data<StudioTrack>),
    enabled: q.length >= 2 && !!day,
    staleTime: Infinity,
    retry: false,
    meta: { silent: true },
  });

/** The airplanes followed here, with the days they have reports on. */
export const studioWatchedQuery = queryOptions({
  queryKey: ["studioWatched"],
  queryFn: () => planner.GET("/api/studio/watched").then(data<StudioWatched[]>),
  staleTime: 60_000,
  meta: { silent: true },
});

/** The ground under a track's points, ft MSL, for its profile strip. */
export const studioGroundQuery = (id: string, points: [number, number][]) =>
  queryOptions({
    queryKey: ["studioGround", id],
    queryFn: () => planner.POST("/api/studio/ground", { body: { points } }).then(data<StudioGround>),
    enabled: points.length > 1,
    staleTime: Infinity,
    meta: { silent: true },
  });
