import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Marker } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TrafficAircraft } from "../../../../lib/api/types";
import { api } from "../../../../lib/api/client";
import { M_PER_NM } from "../../../../lib/geo";
import { clearProblem, raiseProblem } from "../../../../lib/problems";
import { usePreferences } from "../../../../lib/preferences";
import { TRAFFIC_COLOURS, trafficIcon, trafficTag } from "../../../../lib/map/marks/icons";
import { useOwnFix, useOwnShip } from "../../../../lib/map/position/ownShip";
import { usePastFlight } from "../pastFlight";
import { CARRY_S, agedBy, carriedOn, markTraffic, nearOwnHeight, ownShipHex, trafficLabel, trendPx } from "../traffic";
import { trafficCredit } from "../trafficCredit";
import { reported, useTracking, useTrafficFocus, type Report } from "../../../../lib/map/position/tracking";
import { useGlMap } from "../../../../lib/map/gl/glLayer";
import { useMapCredit } from "../../../../lib/map/gl/creditStore";
import { appZoomOf, glZoom } from "../../../../lib/map/gl/glStyle";
import { fadeInMarker, iconMarker, setMarkerIcon } from "../../../../lib/map/gl/htmlMarker";
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
const ADD_PER_STEP = 40;

interface Target {
  /** The arrow, turned with the map to the airplane's track. */
  marker: Marker;
  /** Its height and callsign on the same point, upright (trafficTag). */
  tag: Marker;
  plane: TrafficAircraft;
  at: number;
  shift: { lat: number; lon: number; from: number } | null;
  icon: ReturnType<typeof trafficIcon> | null;
  words: ReturnType<typeof trafficTag> | null;
  drawn: boolean;
}

/** Both of a target's marks: the arrow and its words go together. */
const both = (t: Target, act: (m: Marker) => void) => {
  act(t.marker);
  act(t.tag);
};

/**
 * The airplanes ADS-B receivers hear about the map, drawn
 * bold as the thing on the map that moves most: each the app's own
 * traffic mark (icons.ts trafficIcon, its words trafficTag) as MapLibre markers, which the map
 * places in the frame it draws the chart. A tap tracks one (tracking's
 * pick); a tracked airplane's path and a past flight with its replay are
 * drawn under it.
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
  const fix = useOwnFix();
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
  useEffect(() => {
    const drawn = targets.current;
    return () => {
      for (const t of drawn.values()) both(t, (m) => m.remove());
      drawn.clear();
    };
  }, [map]);

  const [answer, setAnswer] = useState<{ data: NonNullable<typeof data>; at: number } | null>(null);
  if (data && !isPlaceholderData && answer?.at !== dataUpdatedAt) setAnswer({ data, at: dataUpdatedAt });
  const gone = isError && (!answer || errorUpdatedAt - answer.at > STALE_MS);
  useEffect(() => {
    if (gone) raiseProblem({ id: PROBLEM, title: "Traffic isn't available right now." });
    else clearProblem(PROBLEM);
  }, [gone]);
  // Own ship's own transponder, not drawn as traffic over itself.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once an answer
  const own = useMemo(() => (answer ? ownShipHex(agedBy(answer.data.aircraft, answer.data.age_s ?? 0), fix) : null), [answer]);
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
        const hexOf = plane.hex;
        const icon = trafficIcon(plane.track_deg ?? null, TRAFFIC_COLOURS.far, 0, false);
        const marker = iconMarker(icon, { interactive: true }).setLngLat([plane.lon, plane.lat]);
        const tag = iconMarker(trafficTag(TRAFFIC_COLOURS.far, "", null, false)).setLngLat([plane.lon, plane.lat]);
        marker.getElement().addEventListener("click", (e) => {
          e.stopPropagation();
          useTracking.getState().pick?.(hexOf, targets.current.get(hexOf)?.plane);
        });
        targets.current.set(plane.hex, { marker, tag, plane, at, shift: null, icon: null, words: null, drawn: false });
        continue;
      }
      if (at <= held.at) continue;
      const now = Date.now();
      const was = held.marker.getLngLat();
      const should = carriedOn(plane, (now - at) / 1000);
      held.shift = { lat: was.lat - should.lat, lon: was.lng - should.lon, from: now };
      held.plane = plane;
      held.at = at;
    }
    for (const [hex, target] of targets.current) {
      if (!seen.has(hex)) {
        both(target, (m) => m.remove());
        targets.current.delete(hex);
      }
    }
    useTracking.setState({ seen: reports });
  }, [merged]);

  const ownFt = fix?.altitudeFt ?? null;
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
      const colour = nearOwnHeight(plane, ownFt) ? TRAFFIC_COLOURS.near : TRAFFIC_COLOURS.far;
      const icon = trafficIcon(plane.track_deg ?? null, colour, trendPx(plane.speed_kt, plane.lat, view.zoom), tracked);
      if (icon !== target.icon) {
        target.icon = icon;
        setMarkerIcon(target.marker, icon);
      }
      const words = trafficTag(
        colour,
        heights || tracked ? trafficLabel(plane, ownFt) : "",
        callsigns || tracked ? (plane.callsign ?? plane.registration ?? null) : null,
        tracked,
      );
      if (words !== target.words) {
        target.words = words;
        setMarkerIcon(target.tag, words);
      }
      both(target, (m) => {
        const el = m.getElement();
        el.style.zIndex = tracked ? "2" : "1";
        el.style.opacity = only && !only.has(plane.hex) && !tracked ? "0.25" : "1";
      });
    }
  }, [merged, ownFt, view.zoom, hex, only]);

  // The airplane tracked, followed: flown to as its first report comes.
  const heard = useTracking((s) => !!s.hex && s.latest?.plane.hex === s.hex);
  useEffect(() => {
    if (!hex || !follow) return;
    if (useOwnShip.getState().follow) useOwnShip.getState().setFollow(false);
    const latest = useTracking.getState().latest;
    if (!heard || !latest) return;
    map.flyTo({ center: [latest.plane.lon, latest.plane.lat], zoom: Math.max(map.getZoom(), glZoom(9)), duration: 800 });
  }, [map, hex, follow, heard]);

  // Each airplane carried on a frame at a time, in sight only, a few
  // added a step.
  useEffect(() => {
    let timer = 0;
    const step = () => {
      timer = window.setTimeout(step, frameMs(appZoomOf(map.getZoom())));
      if (map.isZooming()) return;
      const now = Date.now();
      const { hex: tracked, follow } = useTracking.getState();
      const b = map.getBounds();
      const dLat = (b.getNorth() - b.getSouth()) / 4,
        dLon = (b.getEast() - b.getWest()) / 4;
      let added = 0;
      for (const [hex, target] of targets.current) {
        const age = (now - target.at) / 1000;
        if (age > CARRY_S) {
          both(target, (m) => m.remove());
          targets.current.delete(hex);
          continue;
        }
        let { lat, lon } = carriedOn(target.plane, age);
        if (target.shift) {
          const left = 1 - (now - target.shift.from) / BLEND_MS;
          if (left <= 0) target.shift = null;
          else {
            lat += target.shift.lat * left;
            lon += target.shift.lon * left;
          }
        }
        const inSight =
          hex === tracked ||
          (lat >= b.getSouth() - dLat && lat <= b.getNorth() + dLat && lon >= b.getWest() - dLon && lon <= b.getEast() + dLon);
        if (!inSight) {
          if (target.drawn) {
            both(target, (m) => m.remove());
            target.drawn = false;
          }
          continue;
        }
        if (!target.drawn && (!target.icon || added >= ADD_PER_STEP)) continue;
        both(target, (m) => m.setLngLat([lon, lat]));
        if (!target.drawn) {
          both(target, (m) => fadeInMarker(m.addTo(map)));
          target.drawn = true;
          added += 1;
        }
      }
      const replaying = usePastFlight.getState().hex === tracked;
      const target = tracked && follow && !replaying ? targets.current.get(tracked) : undefined;
      if (target) map.jumpTo({ center: target.marker.getLngLat() });
    };
    timer = window.setTimeout(step, 0);
    return () => window.clearTimeout(timer);
  }, [map]);
  return null;
}
