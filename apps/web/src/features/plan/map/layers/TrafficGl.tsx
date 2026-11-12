import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TrafficAircraft } from "../../../../lib/api/types";
import { api } from "../../../../lib/api/client";
import { M_PER_NM } from "../../../../lib/geo";
import { clearProblem, raiseProblem } from "../../../../lib/problems";
import { usePreferences } from "../../../../lib/preferences";
import { TRAFFIC_COLOURS } from "../../../../lib/map/marks/icons";
import { CHART } from "../../../../lib/tokens";
import { useOwnShip } from "../../../../lib/map/position/ownShip";
import { usePastFlight } from "../pastFlight";
import { CARRY_S, agedBy, carriedOn, markTraffic, nearOwnHeight, ownShipHex, trafficLabel, trendSeconds } from "../traffic";
import { trafficCredit } from "../trafficCredit";
import { reported, useTracking, useTrafficFocus, type Report } from "../../../../lib/map/position/tracking";
import { EMPTY, useGlLayer, useGlMap, useGlTap } from "../../../../lib/map/gl/glLayer";
import { TAP } from "../../../../lib/map/gl/layers/common";
import { useGlProbe } from "../../../../lib/map/gl/useGlProbe";
import { useMapCredit } from "../../../../lib/map/gl/creditStore";
import { appZoomOf, glZoom } from "../../../../lib/map/gl/glStyle";
import { useTerrainView } from "../terrain/useTerrainView";
import { addTrafficPictures, trafficLayers, trafficPicture, type TrafficMarkProps } from "./trafficMarks";
import { PastFlightGl, TrackedPathGl } from "./TracksGl";

/** Asked every five seconds, each airplane carried on
 *  between answers a frame at a time (more often closer in), blended over
 *  a second onto where the next answer puts it; heights from zoom 9 and
 *  call signs from 10, in the app's levels. */
const EVERY_MS = 5000;
const FRAME_MS = 100;
const frameMs = (zoom: number) => Math.min(1000, FRAME_MS * 2 ** Math.max(0, 10 - Math.round(zoom)));
const BLEND_MS = 1000;
const HEIGHT_ZOOM = 9;
const CALLSIGN_ZOOM = 10;
const PROBLEM = "traffic";
const STALE_MS = 30_000;
const POINTS = "traffic";
const TRENDS = "traffic-trends";
const IDS = { marks: "traffic-marks", tags: "traffic-tags", trends: "traffic-trend-lines" };
const SOURCES = { [POINTS]: { type: "geojson" as const, data: EMPTY }, [TRENDS]: { type: "geojson" as const, data: EMPTY } };
const LAYERS = trafficLayers(IDS, { points: POINTS, trends: TRENDS });

interface Target {
  plane: TrafficAircraft;
  at: number;
  shift: { lat: number; lon: number; from: number } | null;
  /** Where it is drawn now, carried on (null until it is first drawn). */
  pos: { lat: number; lon: number } | null;
  /** How it looks, from its report, own ship's height and the map's zoom. */
  look: { near: boolean; tracked: boolean; dim: boolean; label: string; callsign: string; trendS: number } | null;
}

/**
 * The airplanes ADS-B receivers hear about the map, drawn
 * bold as the thing on the map that moves most: each the app's own
 * traffic mark in MapLibre's own symbol layers (trafficMarks), the ones
 * the 3D view stands at their heights. A tap tracks one (tracking's
 * pick, in the map's one tap); a tracked airplane's path and a past
 * flight with its replay are drawn under it.
 */
export function TrafficGl() {
  const on = usePreferences((s) => s.traffic);
  const tracking = useTracking((s) => !!s.hex || s.listing);
  const hex = useTracking((s) => s.hex);
  const past = usePastFlight((s) => (s.hex === hex ? s.id : null));
  const focused = useTrafficFocus((s) => s.on);
  if (!on && !tracking && !focused) return null;
  return (
    <>
      <Traffic />
      {hex && past === null && <TrackedPathGl key={hex} hex={hex} />}
      {hex && past !== null && <PastFlightGl key={`${hex}-${past}`} hex={hex} id={past} />}
    </>
  );
}

function viewOf(map: ReturnType<typeof useGlMap>["map"]) {
  // In -180 to 180: past the antimeridian the world's copy's centre is not.
  const c = map.getCenter().wrap();
  const ne = map.getBounds().getNorthEast();
  return { lat: c.lat, lon: c.lng, radiusNm: Math.min(165, Math.max(10, c.distanceTo(ne) / M_PER_NM)), zoom: appZoomOf(map.getZoom()) };
}

function Traffic() {
  const { map } = useGlMap();
  // Own ship's height alone, exact (the 1,000 ft "near own height" rule is
  // the engine's traffic_marks, read against it as it is, not rounded), so
  // the traffic is not drawn again at a fix that moved only sideways.
  const ownFt = useOwnShip((s) => (s.enabled ? (s.fix?.altitudeFt ?? null) : null));
  const hex = useTracking((s) => s.hex);
  const follow = useTracking((s) => s.follow);
  const followed = useTracking((s) => (s.hex && s.follow && s.latest ? s.latest.plane : null));
  const [view, setView] = useState(() => viewOf(map));
  useEffect(() => {
    const rest = () => setView(viewOf(map));
    const drag = () => {
      if (useTracking.getState().follow) useTracking.setState({ follow: false });
    };
    map.on("moveend", rest);
    map.on("dragstart", drag);
    return () => {
      map.off("moveend", rest);
      map.off("dragstart", drag);
    };
  }, [map]);
  const at = followed ? { lat: followed.lat, lon: followed.lon } : view;
  const ask = { lat: Math.round(at.lat * 50) / 50, lon: Math.round(at.lon * 50) / 50, radius: Math.ceil(view.radiusNm / 10) * 10 };
  const { data, isError, isPlaceholderData, dataUpdatedAt, errorUpdatedAt } = useQuery({
    queryKey: ["traffic", ask.lat, ask.lon, ask.radius],
    queryFn: () => api.traffic(ask),
    refetchInterval: EVERY_MS,
    staleTime: EVERY_MS - 1000,
    placeholderData: keepPreviousData,
    meta: { silent: true },
  });
  // adsb.lol's licence (ODbL 1.0, 4.3) asks the map to credit it.
  const credit = trafficCredit(data?.source);
  useMapCredit("traffic", credit);
  useEffect(() => () => clearProblem(PROBLEM), []);

  const targets = useRef(new Map<string, Target>());
  useGlLayer("top", SOURCES, LAYERS);
  useEffect(() => {
    addTrafficPictures(map);
  }, [map]);
  // Hidden while the 3D view stands the traffic at its heights
  // (terrain/TrafficAloftGl), not drawn twice; still asked for here, as
  // the 3D view's airplanes are this one's reports (tracking's seen).
  const raised = useTerrainView().mode === "3d";
  useEffect(() => {
    for (const id of Object.values(IDS)) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", raised ? "none" : "visible");
  }, [map, raised]);
  // A tap on one tracks it, in the map's one tap: within 22 points of its
  // middle, the 44-point target every mark has.
  useGlTap([IDS.marks], TAP.mark, TAP.rank.mark, (feature) => {
    const tapped = String(feature.properties.hex);
    const { pick, seen } = useTracking.getState();
    pick?.(tapped, seen.find((r) => r.plane.hex === tapped)?.plane);
  });
  // Where each is, for the browser tests (useGlProbe).
  useGlProbe("traffic-marks", [IDS.marks], (f) => ({
    hex: f.properties.hex,
    track: f.properties.track,
    tracked: f.properties.tracked,
    label: f.properties.label,
    callsign: f.properties.callsign,
  }));
  useGlProbe("traffic-trends", [IDS.trends], (f) => ({ colour: f.properties.colour }));

  const [answer, setAnswer] = useState<{ data: NonNullable<typeof data>; at: number } | null>(null);
  if (data && !isPlaceholderData && answer?.at !== dataUpdatedAt) setAnswer({ data, at: dataUpdatedAt });
  const gone = isError && (!answer || errorUpdatedAt - answer.at > STALE_MS);
  useEffect(() => {
    if (gone) raiseProblem({ id: PROBLEM, title: "Traffic isn't available right now." });
    else clearProblem(PROBLEM);
  }, [gone]);
  // Own ship's own transponder, not drawn as traffic over itself: its fix
  // as each answer comes.
  const own = useMemo(() => (answer ? ownShipHex(agedBy(answer.data.aircraft, answer.data.age_s ?? 0), ownFix()) : null), [answer]);
  const merged = useMemo(
    () =>
      answer
        ? answer.data.aircraft
            .filter((plane) => plane.hex !== own)
            .map((plane) => ({ plane, at: answer.at - ((answer.data.age_s ?? 0) + (plane.seen_s ?? 0)) * 1000 }))
        : null,
    [answer, own],
  );

  useEffect(() => {
    if (!merged) return;
    const seen = new Set<string>();
    const reports: Report[] = [];
    for (const { plane, at } of merged) {
      seen.add(plane.hex);
      reports.push({ plane, at });
      reported({ plane, at });
      const held = targets.current.get(plane.hex);
      if (!held) {
        targets.current.set(plane.hex, { plane, at, shift: null, pos: null, look: null });
        continue;
      }
      if (at <= held.at) continue;
      const now = Date.now();
      // Blended over a second from where it is drawn onto where the new
      // report carries it, not jumped.
      const should = carriedOn(plane, (now - at) / 1000);
      held.shift = held.pos ? { lat: held.pos.lat - should.lat, lon: held.pos.lon - should.lon, from: now } : null;
      held.plane = plane;
      held.at = at;
    }
    for (const hex of targets.current.keys()) if (!seen.has(hex)) targets.current.delete(hex);
    useTracking.setState({ seen: reports });
  }, [merged]);

  const only = useTrafficFocus((s) => (s.on ? s.only : null));
  useEffect(() => {
    const heights = view.zoom >= HEIGHT_ZOOM,
      callsigns = view.zoom >= CALLSIGN_ZOOM;
    markTraffic(
      [...targets.current.values()].map((t) => t.plane),
      ownFt,
    );
    for (const target of targets.current.values()) {
      const { plane } = target;
      const tracked = plane.hex === hex;
      target.look = {
        near: nearOwnHeight(plane, ownFt),
        tracked,
        dim: !!only && !only.has(plane.hex) && !tracked,
        label: heights || tracked ? trafficLabel(plane, ownFt) : "",
        callsign: callsigns || tracked ? (plane.callsign ?? plane.registration ?? "") : "",
        trendS: plane.track_deg != null ? trendSeconds(plane.speed_kt, plane.lat, view.zoom) : 0,
      };
    }
    drawTargets(map, targets.current);
  }, [map, merged, ownFt, view.zoom, hex, only]);

  // The airplane tracked, followed: flown to as its first report comes.
  const heard = useTracking((s) => !!s.hex && s.latest?.plane.hex === s.hex);
  useEffect(() => {
    if (!hex || !follow) return;
    const ownShip = useOwnShip.getState();
    if (ownShip.follow && ownShip.enabled) ownShip.setFollow(false);
    const latest = useTracking.getState().latest;
    if (!heard || !latest) return;
    map.flyTo({ center: [latest.plane.lon, latest.plane.lat], zoom: Math.max(map.getZoom(), glZoom(9)), duration: 800 });
  }, [map, hex, follow, heard]);

  // The frames stop while the page is hidden (the app put away, the phone
  // locked) and start again as it is back; the answers stop with them
  // (TanStack Query's refetchIntervalInBackground, false).
  useEffect(() => {
    let timer = 0;
    const step = () => {
      timer = document.hidden ? 0 : window.setTimeout(step, frameMs(appZoomOf(map.getZoom())));
      if (!map.isZooming()) drawTargets(map, targets.current);
    };
    const back = () => {
      if (!document.hidden && !timer) timer = window.setTimeout(step, 0);
    };
    timer = window.setTimeout(step, 0);
    document.addEventListener("visibilitychange", back);
    return () => {
      document.removeEventListener("visibilitychange", back);
      window.clearTimeout(timer);
    };
  }, [map]);
  return null;
}

/** Each airplane carried on to now, in sight only, and the layers' data
 *  set again (Traffic's step, a frame at a time, more often closer in);
 *  those older than CARRY_S let go. */
function drawTargets(map: MlMap, targets: Map<string, Target>) {
  const now = Date.now();
  const b = map.getBounds();
  const dLat = (b.getNorth() - b.getSouth()) / 4,
    dLon = (b.getEast() - b.getWest()) / 4;
  const { hex: tracked } = useTracking.getState();
  const points: GeoJSON.Feature<GeoJSON.Point, TrafficMarkProps>[] = [];
  const trends: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (const [hex, target] of targets) {
    const age = (now - target.at) / 1000;
    if (age > CARRY_S) {
      targets.delete(hex);
      continue;
    }
    const { plane, look } = target;
    if (!look) continue;
    let shift = { lat: 0, lon: 0 };
    if (target.shift) {
      const left = 1 - (now - target.shift.from) / BLEND_MS;
      if (left <= 0) target.shift = null;
      else shift = { lat: target.shift.lat * left, lon: target.shift.lon * left };
    }
    const here = carriedOn(plane, age);
    const pos = { lat: here.lat + shift.lat, lon: here.lon + shift.lon };
    target.pos = pos;
    const inSight =
      hex === tracked ||
      (pos.lat >= b.getSouth() - dLat && pos.lat <= b.getNorth() + dLat && pos.lon >= b.getWest() - dLon && pos.lon <= b.getEast() + dLon);
    if (!inSight) continue;
    const colour = look.near ? TRAFFIC_COLOURS.near : TRAFFIC_COLOURS.far;
    points.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [pos.lon, pos.lat] },
      properties: {
        hex,
        icon: trafficPicture(look.near, plane.track_deg != null, look.tracked),
        track: plane.track_deg ?? 0,
        tracked: look.tracked,
        dim: look.dim,
        label: look.label,
        callsign: look.callsign,
        ink: look.near ? CHART.trafficNearText : CHART.casing,
        alt_m: 0,
      },
    });
    if (look.trendS > 0) {
      const ahead = carriedOn(plane, age + look.trendS);
      trends.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [pos.lon, pos.lat],
            [ahead.lon + shift.lon, ahead.lat + shift.lat],
          ],
        },
        properties: { colour, dim: look.dim },
      });
    }
  }
  setIfNew(map, POINTS, points);
  setIfNew(map, TRENDS, trends);
  const { follow } = useTracking.getState();
  const replaying = usePastFlight.getState().hex === tracked;
  const target = tracked && follow && !replaying ? targets.get(tracked) : undefined;
  if (target?.pos) map.jumpTo({ center: [target.pos.lon, target.pos.lat] });
}

/** Own ship's fix while it is on, read once (useOwnFix's, not followed). */
function ownFix() {
  const ship = useOwnShip.getState();
  return ship.enabled ? ship.fix : null;
}

/** What each source was last sent, as JSON: a frame with nothing moved
 *  (none in sight, or every one on the ground and still) sends nothing to
 *  the map's worker, where each setData is indexed again from nothing. By
 *  the source itself, so one made again (a new style) is sent afresh. */
const lastSent = new WeakMap<GeoJSONSource, string>();
function setIfNew(map: MlMap, id: string, features: GeoJSON.Feature[]) {
  const source = map.getSource<GeoJSONSource>(id);
  if (!source) return;
  const json = JSON.stringify(features);
  if (lastSent.get(source) === json) return;
  lastSent.set(source, json);
  source.setData({ type: "FeatureCollection", features });
}
