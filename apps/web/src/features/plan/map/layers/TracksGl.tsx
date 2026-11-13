import { useQuery } from "@tanstack/react-query";
import type { Marker } from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import { pastFlightQuery } from "../../components/pastFlightsQuery";
import type { Course } from "../../../../lib/api/types";
import { flightQuery } from "../../../../lib/queryClient";
import { altFt } from "../../../../lib/format";
import { useFlownTrack } from "../../../../lib/map/position/flownTrack";
import { TRAFFIC_COLOURS, trafficIcon, trafficTag } from "../../../../lib/map/marks/icons";
import { useLegHighlight } from "../legHighlight";
import { useMapHover } from "../../../../lib/map/marks/mapHover";
import { useOwnFix } from "../../../../lib/map/position/ownShip";
import { SIMULATED_FIX_MS, endSimulation, simulateFix } from "../../../../lib/map/position/dryRun";
import { useOwnTrail } from "../../../../lib/map/position/ownTrail";
import { positionAt, stepPastFlight, usePastFlight, type ReplayPoint } from "../pastFlight";
import { colourRuns } from "../traffic";
import { useTracking } from "../../../../lib/map/position/tracking";
import { useGlMap } from "../../../../lib/map/gl/glLayer";
import { iconMarker, setMarkerIcon } from "../../../../lib/map/gl/htmlMarker";
import { useGlFit } from "../useGlFit";
import { picked, pilotMoved } from "../../../../lib/map/gl/pilotCamera";
import { useGlLines, type GlRun } from "../../../../lib/map/gl/useGlLines";
import { CHART } from "../../../../lib/tokens";

/** Every track's white casing, so it reads over any chart. */
const CASING = { colour: CHART.casing, width: 6, opacity: 0.85 };

/** Where own ship has flown, at the pilot's ask: blue on
 *  a white casing, joined to the position now. The path is its own source,
 *  sent to the map's worker only when a point is added to it (every tenth
 *  of a mile or ten seconds, lib/map/position/ownTrail), and the stretch from
 *  its last point to the fix another of two points, the one sent at each
 *  fix: the whole path (up to 5,000 points) went at every fix. The stretch
 *  has no casing, so it joins the path's end with its own round cap rather
 *  than a casing's over it, and is a few seconds of flying long. */
export function OwnTrailGl() {
  const path = useOwnTrail((s) => s.path);
  const fix = useOwnFix();
  const trail = useMemo<GlRun[] | null>(
    () => (path.length < 2 ? null : [{ points: path.map((p) => [p.lat, p.lon] as [number, number]), colour: CHART.mapBlue, width: 3 }]),
    [path],
  );
  const end = path.length < 2 ? undefined : path.at(-1);
  const tail = useMemo<GlRun[] | null>(
    () =>
      end && fix
        ? [
            {
              points: [
                [end.lat, end.lon],
                [fix.lat, fix.lon],
              ],
              colour: CHART.mapBlue,
              width: 3,
            },
          ]
        : null,
    [end, fix],
  );
  useGlLines("own-trail", "route", trail, CASING);
  useGlLines("own-trail-tail", "route", tail, null);
  return null;
}

/** A saved flight's flown track over its route, from its debrief:
 *  black where it kept to the course, red where off. */
export function FlownTrackGl({ course }: { course: Course }) {
  const track = useFlownTrack((s) => s.track);
  const runs = useMemo<GlRun[] | null>(() => {
    if (!track || track.departure !== course.departure.ident || track.destination !== course.destination.ident) return null;
    const out: GlRun[] = [];
    track.line.forEach((pt, i) => {
      const last = out.at(-1);
      const off = pt.off;
      const colour = off ? CHART.warning : CHART.fixInk;
      if (last && last.colour === colour) last.points.push([pt.lat, pt.lon]);
      else
        out.push({
          colour,
          width: off ? 3.5 : 2.5,
          points:
            i > 0
              ? [
                  [track.line[i - 1]!.lat, track.line[i - 1]!.lon],
                  [pt.lat, pt.lon],
                ]
              : [[pt.lat, pt.lon]],
        });
    });
    return out;
  }, [track, course]);
  useGlLines("flown-track", "route", runs, { colour: CHART.casing, width: 6, opacity: 0.9 });
  return null;
}

/** The legs a hazard in the Brief is on, at the pilot's tap:
 *  a wide amber band under the course, fitted. */
export function LegHighlightGl({ course }: { course: Course }) {
  const shown = useLegHighlight((s) => s.shown);
  const clear = useLegHighlight((s) => s.clear);
  const route = `${course.departure.ident}-${(course.stops ?? []).map((s) => s.ident).join("-")}-${course.destination.ident}`;
  useEffect(() => clear, [route, clear]);
  const runs = useMemo<GlRun[] | null>(
    () =>
      shown
        ? shown.lines.map((line) => ({
            points: line.map((p) => [p.lat, p.lon] as [number, number]),
            colour: CHART.caution,
            width: 12,
            opacity: 0.55,
          }))
        : null,
    [shown],
  );
  useGlLines("leg-highlight", "lines", runs, null);
  const points = useMemo(() => shown?.lines.flat() ?? [], [shown]);
  useGlFit(points, shown?.key ?? null, 11);
  return null;
}

/** The leg a mouse rests on in the nav log (lib/map/marks/mapHover): a
 *  band in the selection's yellow under the course, the map left where it
 *  is (a hover never moves it). */
export function LegHoverGl() {
  const leg = useMapHover((s) => s.leg);
  const runs = useMemo<GlRun[] | null>(
    () =>
      leg && leg.length > 1
        ? [{ points: leg.map((p) => [p.lat, p.lon] as [number, number]), colour: CHART.selected, width: 10, opacity: 0.6 }]
        : null,
    [leg],
  );
  useGlLines("leg-hover", "lines", runs, null);
  return null;
}

/** A replay's airplane along a past flight's path, or -- `asOwnShip`, the
 *  planned flight's dry run -- own ship flown along it (useReplayMarker). */
export function ReplayGl({ asOwnShip = false }: { asOwnShip?: boolean }) {
  const { map } = useGlMap();
  // The airplane, turned with the map, and its height upright under it.
  const marker = useRef<{ mark: Marker; tag: Marker } | null>(null);
  useEffect(() => {
    const drop = () => {
      marker.current?.mark.remove();
      marker.current?.tag.remove();
      marker.current = null;
    };
    let frame = 0,
      last = performance.now(),
      stepping = false,
      reported = -Infinity,
      reportedAt: number | null = null,
      // A paused scrub's report held for the quarter second (draw).
      trailing = 0,
      wasPlaying = false,
      // What the marker was last drawn at, so a frame with nothing new
      // writes nothing to it (a paused replay's, or a reduced-motion step's).
      drawnAt: number | null | undefined,
      drawnPoints: ReplayPoint[] | undefined;
    const draw = (now: number) => {
      const { at, points, playing } = usePastFlight.getState();
      const here = at === null ? null : positionAt(points, at);
      if (asOwnShip) {
        if (!here) endSimulation();
        else if (at !== reportedAt && now - reported >= SIMULATED_FIX_MS) {
          simulateFix(here);
          reported = now;
          reportedAt = at;
        } else if (at !== reportedAt && !playing && !trailing) {
          // Paused, no frame comes after this one: a scrub inside the
          // quarter second (Page Down twice) is reported as it ends, where
          // it was dropped and own ship left a scrub behind (dry-run.spec).
          trailing = window.setTimeout(
            () => {
              trailing = 0;
              draw(performance.now());
            },
            SIMULATED_FIX_MS - (now - reported),
          );
        }
        return;
      }
      // Kept in sight while it plays, its Play being the pilot's pick
      // (lib/map/gl/pilotCamera); not once they move the map by hand.
      if (playing && !wasPlaying) picked();
      wasPlaying = playing;
      if (at === drawnAt && points === drawnPoints) return;
      drawnAt = at;
      drawnPoints = points;
      if (!here) {
        drop();
        return;
      }
      const height = here.alt_ft == null ? null : Math.round(here.alt_ft / 100) * 100;
      const icon = trafficIcon(here.track_deg ?? null, TRAFFIC_COLOURS.far, 0, true);
      const tag = trafficTag(TRAFFIC_COLOURS.far, altFt(height), null, true);
      const point: [number, number] = [here.lon, here.lat];
      if (!marker.current)
        marker.current = { mark: iconMarker(icon).setLngLat(point).addTo(map), tag: iconMarker(tag).setLngLat(point).addTo(map) };
      else {
        marker.current.mark.setLngLat(point);
        marker.current.tag.setLngLat(point);
        setMarkerIcon(marker.current.mark, icon);
        setMarkerIcon(marker.current.tag, tag);
      }
      // Not while a replay's camera has the map (features/replay/camera,
      // which marks the map's container): it keeps the airplane in sight.
      if (playing && !pilotMoved() && !map.getContainer().dataset.replayCamera) {
        const p = map.project([here.lon, here.lat]);
        const { clientWidth: w, clientHeight: h } = map.getContainer();
        if (p.x < w * 0.15 || p.x > w * 0.85 || p.y < h * 0.15 || p.y > h * 0.85) map.jumpTo({ center: [here.lon, here.lat] });
      }
    };
    // The clock stepped at each frame only while it plays; paused, the
    // frames stop, and a scrub or a new flight (a change to the clock) is
    // drawn as it comes, as Play starts the frames again.
    const step = (now: number) => {
      frame = 0;
      stepping = true;
      stepPastFlight(now - last);
      stepping = false;
      last = now;
      draw(now);
      if (usePastFlight.getState().playing) frame = requestAnimationFrame(step);
    };
    const wake = () => {
      if (stepping || frame) return;
      if (usePastFlight.getState().playing) {
        last = performance.now();
        frame = requestAnimationFrame(step);
      } else draw(performance.now());
    };
    const unsubscribe = usePastFlight.subscribe(wake);
    wake();
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
      window.clearTimeout(trailing);
      drop();
      if (asOwnShip) endSimulation();
    };
  }, [map, asOwnShip]);
  return null;
}

/** A past flight of the airplane tracked (PastFlightPath): its path in its
 *  heights' colours, fitted, and its replay. */
export function PastFlightGl({ hex, id }: { hex: string; id: number }) {
  const { data } = useQuery(pastFlightQuery(hex, id));
  useEffect(() => {
    if (data) usePastFlight.setState({ points: data.points });
  }, [data]);
  const points = useMemo(() => data?.points ?? [], [data]);
  const runs = useMemo<GlRun[]>(
    () =>
      colourRuns(points.map((p) => ({ lat: p.lat, lon: p.lon, altFt: p.alt_ft ?? null }))).map((r) => ({
        points: r.points,
        colour: r.colour,
        width: 3,
      })),
    [points],
  );
  useGlLines("past-flight", "route", runs, CASING);
  useGlFit(points, points.length > 1 ? `${hex}-${id}` : null, 13);
  return <ReplayGl />;
}

/** The tracked airplane's path so far, in its
 *  heights' colours. */
export function TrackedPathGl({ hex }: { hex: string }) {
  const { data } = useQuery(flightQuery(hex));
  const since = useTracking((s) => s.path);
  const runs = useMemo<GlRun[]>(() => {
    const trail = (data?.trail ?? []).map((p) => ({ t: p.t * 1000, lat: p.lat, lon: p.lon, altFt: p.alt_ft ?? null }));
    const last = trail.at(-1)?.t ?? 0;
    return colourRuns([...trail, ...since.filter((p) => p.t > last)]).map((r) => ({ points: r.points, colour: r.colour, width: 3 }));
  }, [data, since]);
  useGlLines("tracked-path", "route", runs, CASING);
  return null;
}
