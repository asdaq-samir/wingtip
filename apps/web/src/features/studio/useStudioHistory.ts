import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePastFlight } from "../../lib/replay/clock";
import type { ReplayTrack } from "../replay";
import { studioNotamsQuery, studioNtsbQuery, studioWeatherQuery, type StudioWeather } from "./studioApi";

/** At most this many of a track's points are sent for the fields near it. */
const ALONG_POINTS = 200;

const epoch = (iso: string) => Date.parse(iso) / 1000;

/** The latest of `items` at or before `t` by `when`, or null. */
function latest<T>(items: T[], when: (x: T) => number, t: number): T | null {
  let best: T | null = null;
  for (const x of items) if (when(x) <= t && (!best || when(x) > when(best))) best = x;
  return best;
}

/** Each field's METAR in force at `t` (its latest at or before it). */
function metarsAt(weather: StudioWeather | undefined, t: number) {
  if (!weather) return [];
  const stations = [...new Set(weather.metars.map((m) => m.station))];
  return stations
    .map((s) =>
      latest(
        weather.metars.filter((m) => m.station === s),
        (m) => epoch(m.time),
        t,
      ),
    )
    .filter((m): m is StudioWeather["metars"][number] => !!m);
}

/**
 * What else was so at a replay's moment, for the Studio (the history the
 * planner keeps, app.routers.studio_history): the weather over the
 * track's hours (IEM's METARs and TAFs of the fields along it, and the
 * radar mosaic's frame at the moment), the NTSB's events of the airplane
 * that day, and the NOTAMs and TFRs in force at the hour, where the day's
 * snapshot was kept.
 */
export function useStudioHistory(track: ReplayTrack | null, registration: string | null, day: string | null) {
  const span = useMemo(() => (track ? { start: track.points[0]!.t, end: track.points.at(-1)!.t } : null), [track]);
  const along = useMemo((): [number, number][] => {
    if (!track) return [];
    const step = Math.max(1, Math.ceil(track.points.length / ALONG_POINTS));
    return track.points.filter((_, i) => i % step === 0).map((p) => [p.lat, p.lon]);
  }, [track]);
  const box = useMemo(() => {
    if (!along.length) return null;
    const lats = along.map((p) => p[0]),
      lons = along.map((p) => p[1]);
    const r = (x: number) => Math.round(x * 100) / 100;
    return { lat_min: r(Math.min(...lats)), lat_max: r(Math.max(...lats)), lon_min: r(Math.min(...lons)), lon_max: r(Math.max(...lons)) };
  }, [along]);
  // The replay's moment to the five minutes the radar is made in, and to
  // the hour the NOTAMs are asked at: a view redraws on these, not each second.
  const fiveMin = usePastFlight((s) => (s.at === null ? null : Math.floor(s.at / 300) * 300));
  const hour = fiveMin === null ? (span ? Math.floor(span.start / 3600) * 3600 : null) : Math.floor(fiveMin / 3600) * 3600;

  const weather = useQuery(studioWeatherQuery(track?.id ?? "", span, along));
  const ntsb = useQuery(studioNtsbQuery(registration, day));
  const notams = useQuery(studioNotamsQuery(track ? hour : null, box));
  const t = fiveMin ?? span?.start ?? 0;
  const radar = useMemo(() => latest(weather.data?.radar ?? [], (f) => epoch(f.valid), t + 299), [weather.data, t]);

  return {
    weather: weather.data,
    weatherProblem: weather.error ? "The weather as it was couldn't be fetched." : null,
    metars: metarsAt(weather.data, t),
    radar,
    ntsb: ntsb.data ?? [],
    notams: notams.data,
    /** The METAR nearest the airplane at `t`, for a video's frame. */
    metarNear: (at: number, here: { lat: number; lon: number } | null) => {
      const now = metarsAt(weather.data, at);
      if (!here || !now.length) return null;
      const k = Math.cos((here.lat * Math.PI) / 180);
      const far = (m: { lat: number; lon: number }) => (m.lat - here.lat) ** 2 + ((m.lon - here.lon) * k) ** 2;
      return now.reduce((a, b) => (far(b) < far(a) ? b : a)).raw;
    },
  };
}

export type StudioHistory = ReturnType<typeof useStudioHistory>;
