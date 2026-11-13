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

export type StudioWeather = components["schemas"]["StudioWeather"];
export type NtsbEvent = components["schemas"]["NtsbEvent"];
export type StudioNotams = components["schemas"]["StudioNotams"];

/** The weather as it was over a track's hours (the planner's
 *  /api/studio/weather, from IEM, read once and kept): the METARs and TAFs
 *  of the fields along it, and the radar mosaic's frames. */
export const studioWeatherQuery = (id: string, span: { start: number; end: number } | null, points: [number, number][]) =>
  queryOptions({
    queryKey: ["studioWeather", id],
    queryFn: () => planner.POST("/api/studio/weather", { body: { ...span!, points } }).then(data<StudioWeather>),
    enabled: !!span && points.length > 0,
    staleTime: Infinity,
    retry: false,
    meta: { silent: true },
  });

/** The NTSB's events of an airplane a day either side of `day`. */
export const studioNtsbQuery = (registration: string | null, day: string | null) =>
  queryOptions({
    queryKey: ["studioNtsb", registration, day],
    queryFn: () =>
      planner.GET("/api/studio/ntsb", { params: { query: { registration: registration!, day: day! } } }).then(data<NtsbEvent[]>),
    enabled: !!registration && !!day,
    staleTime: Infinity,
    meta: { silent: true },
  });

/** The NOTAMs and TFRs in force at `at` (to the hour) in a box, from the
 *  day's kept snapshot; `archived` false where none was kept. */
export const studioNotamsQuery = (at: number | null, box: { lat_min: number; lat_max: number; lon_min: number; lon_max: number } | null) =>
  queryOptions({
    queryKey: ["studioNotams", at, box],
    queryFn: () => planner.GET("/api/studio/notams", { params: { query: { at: at!, ...box! } } }).then(data<StudioNotams>),
    enabled: at !== null && !!box,
    staleTime: Infinity,
    meta: { silent: true },
  });
