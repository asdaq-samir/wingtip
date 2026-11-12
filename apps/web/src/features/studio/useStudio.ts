import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { describeError } from "../../lib/api/client";
import { TrackError } from "../../lib/track";
import { clearPastFlight } from "../../lib/replay/clock";
import { dropAudio, loadReplay, readyTrack, resetReplayCamera, setReplayCamera, type ReplayTrack } from "../replay";
import { importTrackFile } from "./importTrack";
import { studioGroundQuery, studioTrackQuery, studioWatchedQuery, type StudioTrack } from "./studioApi";

/** The ground asked for at most this many points along a track. */
const GROUND_POINTS = 200;

const DAY_NAME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** A day's answer made a replay's track, its credit with it. */
function dayTrack(answer: StudioTrack): ReplayTrack | null {
  if (answer.points.length < 2) return null;
  return readyTrack(answer.points, {
    id: `day:${answer.hex}:${answer.day}`,
    label: `${answer.registration ?? answer.hex.toUpperCase()} · ${DAY_NAME.format(new Date(`${answer.day}T00:00:00Z`))}`,
    altitude: answer.altitude,
    credit: answer.source === "adsb.lol" ? `adsb.lol, ${answer.license}` : answer.source,
  });
}

/** Today's UTC day, the date field's most. */
export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The Studio's view model, its one hook: which track is loaded -- an
 * airplane's UTC day (the address's `q` and `day`, so a link opens it),
 * or a file picked -- the track made ready (features/replay), handed to
 * the map's replay clock and the chase camera; the ground under it for
 * the profile; the airplanes watched here; and what went wrong, said
 * where the track would be.
 */
export function useStudio() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const day = params.get("day") ?? "";
  const asked = useQuery(studioTrackQuery(q, day));
  const watched = useQuery(studioWatchedQuery);
  const [file, setFile] = useState<{ track: ReplayTrack | null; problem: string | null } | null>(null);

  const fromDay = useMemo(() => (asked.data ? dayTrack(asked.data) : null), [asked.data]);
  const track = file?.track ?? (file ? null : fromDay);
  const problem =
    file?.problem ??
    (asked.error
      ? describeError(asked.error, "The track couldn't be fetched")
      : asked.data && !fromDay
        ? `No reports of ${asked.data.registration ?? asked.data.hex.toUpperCase()} on ${asked.data.day} (UTC).`
        : null);

  // The track on the clock, from its start, the chase camera on it; the
  // clock and the camera put back as the Studio is left.
  useEffect(() => {
    if (!track) return;
    loadReplay(track.id, track.points);
    setReplayCamera("chase");
  }, [track]);
  useEffect(
    () => () => {
      clearPastFlight();
      resetReplayCamera();
      dropAudio();
    },
    [],
  );

  const along = useMemo((): [number, number][] => {
    if (!track) return [];
    const step = Math.max(1, Math.ceil(track.points.length / GROUND_POINTS));
    return track.points.filter((_, i) => i % step === 0).map((p) => [p.lat, p.lon]);
  }, [track]);
  const groundAsked = useQuery(studioGroundQuery(track?.id ?? "", along));
  const ground = useMemo(() => {
    const feet = groundAsked.data?.ground_ft;
    if (!track || !feet) return [];
    const step = Math.max(1, Math.ceil(track.points.length / GROUND_POINTS));
    return feet.map((ft, k) => ({ along_nm: track.points[k * step]?.along_nm ?? 0, ground_ft: ft }));
  }, [groundAsked.data, track]);

  return {
    q,
    day,
    track,
    ground,
    problem,
    loading: asked.isFetching,
    /** The airplane's N-number and UTC day, where the track is a day's
     *  from the store (for the NTSB's events); null for a file's. */
    registration: file ? null : (asked.data?.registration ?? null),
    utcDay: file ? null : (asked.data?.day ?? null),
    watched: watched.data ?? [],
    /** An airplane's day, by N-number or ICAO address. */
    load: (tail: string, utcDay: string) => {
      setFile(null);
      setParams({ q: tail.trim().toUpperCase(), day: utcDay }, { replace: true });
    },
    /** A KML, GPX or CSV track file. */
    importFile: async (picked: File) => {
      try {
        const read = await importTrackFile(picked);
        const ready = readyTrack(read.reports, {
          id: `file:${picked.name}:${picked.size}`,
          label: picked.name,
          altitude: read.altitude,
          credit: null,
        });
        setFile({
          track: ready.points.length > 1 ? ready : null,
          problem: ready.points.length > 1 ? null : "There is no track in this file.",
        });
      } catch (err) {
        setFile({ track: null, problem: err instanceof TrackError ? err.message : "This file couldn't be read." });
      }
    },
  };
}

export type Studio = ReturnType<typeof useStudio>;
