import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { describeError } from "../../lib/api/client";
import { TrackError } from "../../lib/track";
import { useShownOverlay } from "../../lib/map/sources/useShownOverlay";
import { clearPastFlight } from "../../lib/replay/clock";
import { dropAudio, loadReplay, readyTrack, resetReplayCamera, setReplayCamera, useExporting, type ReplayTrack } from "../replay";
import { importTrackFile } from "./importTrack";
import { studioGroundQuery, studioTrackQuery, studioWatchedQuery, type StudioTrack } from "./studioApi";
import { useDrafts } from "./useDrafts";
import { useStudioHistory } from "./useStudioHistory";

/** The ground asked for at most this many points along a track. */
const GROUND_POINTS = 200;
/** The flown altitude down to the profile's points: one each half
 *  minute of the flight is enough for a strip a phone wide. */
const PROFILE_POINTS = 600;

const DAY_NAME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** A day's answer made a replay's track, its credit with it. */
function dayTrack(answer: StudioTrack): ReplayTrack | null {
  if (answer.points.length < 2) return null;
  return readyTrack(answer.points, {
    id: `day:${answer.hex}:${answer.day}`,
    label: `${answer.registration ?? answer.hex.toUpperCase()} · ${DAY_NAME.format(new Date(`${answer.day}T00:00:00Z`))}`,
    altitude: answer.altitude,
    credit: answer.source === "adsb.lol" ? `adsb.lol, ${answer.license}` : answer.source,
    aircraft: { tail: answer.registration ?? null, icaoType: answer.type ?? null, model: answer.model ?? null },
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
 * the profile, and the flown line drawn over it; what else was so then
 * (useStudioHistory); the airplanes watched here; the crash drafts;
 * whether the map leaves Google's overlay off; and what went wrong, said
 * where the track would be. The Studio's views read this model alone;
 * the replay's shared parts (features/replay) keep their own stores, as
 * on Plan, and the replay's clock is read where a second redraws it.
 */
export function useStudio() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const day = params.get("day") ?? "";
  const asked = useQuery(studioTrackQuery(q, day));
  const watched = useQuery(studioWatchedQuery);
  const drafts = useDrafts();
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
  // The altitude strip's two lines, the nav log's profile's shapes
  // (ProfileChart): the ground under the track, and the flight flown
  // where the plan would be, broken at each gap.
  const profile = useMemo(() => {
    if (!track) return null;
    const step = Math.max(1, Math.ceil(track.points.length / PROFILE_POINTS));
    const points = track.points.flatMap((p, i) => {
      // A gap: a break before the report after it. On the ground no
      // altitude is sent, and none is drawn.
      const brk = p.gap ? [{ along_nm: p.along_nm, plan_ft: null }] : [];
      const kept = p.alt_ft != null && (i % step === 0 || p.gap || i === track.points.length - 1);
      return kept ? [...brk, { along_nm: p.along_nm, plan_ft: p.alt_ft! }] : brk;
    });
    return {
      ground: { length_nm: track.lengthNm, terrain: ground, airspace: [], obstacles: [] },
      flown: { length_nm: track.lengthNm, points, marks: [] },
    };
  }, [track, ground]);

  const registration = file ? null : (asked.data?.registration ?? null);
  const utcDay = file ? null : (asked.data?.day ?? null);
  const history = useStudioHistory(track, registration, utcDay);
  // Google's overlay (the Map menu's pick) is left off while a video is
  // rendered: Google's Map Tiles API terms forbid exporting its content.
  const exporting = useExporting((s) => s.running);
  const overlay = useShownOverlay();

  return {
    q,
    day,
    track,
    ground,
    problem,
    loading: asked.isFetching,
    /** The airplane's N-number and UTC day, where the track is a day's
     *  from the store (for the NTSB's events); null for a file's. */
    registration,
    utcDay,
    /** The altitude strip's ground and flown line, null with no track. */
    profile,
    /** What else was so at the replay's moment (useStudioHistory). */
    history,
    /** The radar mosaic's frame at the moment, its tiles, or null. */
    radar: history.radar?.tiles ?? null,
    /** Whether the map leaves Google's overlay off, a video rendering. */
    googleOff: exporting && overlay.startsWith("google"),
    /** The open crash draft's id at ?render=1, once its own airplane's
     *  track is the one loaded (its `q`, useDrafts): the render script's film of it
     *  (useRenderEntry, scripts/dev/studio-render.mjs). */
    renderDraft: params.get("render") === "1" && !file && drafts.draft && fromDay && q === drafts.draft.n_number ? drafts.draft.id : null,
    watched: watched.data ?? [],
    /** The crash drafts (useDrafts), the one open among them. */
    drafts,
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
