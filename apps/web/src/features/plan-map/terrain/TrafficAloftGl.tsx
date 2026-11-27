import { LineLayer } from "@deck.gl/layers";
import { useDrawnStretch } from "./heightStretch";
import { useEffect, useEffectEvent } from "react";
import { deckColour, deckSlot, putDeckLayers, useDeckLayers } from "../../../lib/map/gl/deckLayers";
import { EMPTY, drawnWithData, useGlLayer, useGlMap, useGlTap } from "../../../lib/map/gl/glLayer";
import type { GeoJSONSource } from "maplibre-gl";
import { TAP } from "../../../lib/map/gl/layers/common";
import { TRAFFIC_COLOURS } from "../../../lib/map/marks/icons";
import { useOwnFix } from "../../../lib/map/position/ownShip";
import { useTracking, type Report } from "../../../lib/map/position/tracking";
import { usePreferences, type HeightStretch } from "../../../lib/preferences";
import { CHART } from "../../../lib/tokens";
import { addTrafficPictures, trafficLayers, trafficPicture, type TrafficMarkProps } from "../layers/trafficMarks";
import { carryS, carriedOn, markTraffic, nearOwnHeight, trafficLabel } from "../../../lib/traffic";
import { standAtM } from "./trafficAloft";
import { useGeo, type Geo } from "../../../lib/geo";
import { pickOnMap } from "../../../lib/map/mapPick";

/** How often the airplanes are carried on along their tracks, ms: about
 *  the 2D map's own step close in (TrafficGl's FRAME_MS). */
const STEP_MS = 200;
const POINTS = "traffic-aloft";
const TRENDS = "traffic-aloft-trends";
const IDS = { marks: "traffic-aloft", tags: "traffic-aloft-tags", trends: "traffic-aloft-trend-lines" };
/** The 2D map's own layers (trafficMarks), each mark and tag lifted to
 *  its `alt_m`; the trend source stays empty, as a minute's line ahead is
 *  drawn on the flat map only. */
const SOURCES = { [POINTS]: { type: "geojson" as const, data: EMPTY }, [TRENDS]: { type: "geojson" as const, data: EMPTY } };
const LAYERS = trafficLayers(IDS, { points: POINTS, trends: TRENDS });

/**
 * The traffic in 3D (TerrainGl mounts it while the traffic is drawn): each
 * airplane at its reported height over where it is, drawn by the 2D map's
 * own layers (trafficMarks) with only the height changed, and a thin line
 * down to the ground under it (deck.gl's LineLayer), so its height reads
 * against the hills and the runway. The 2D marks on the ground are hidden
 * meanwhile (TrafficGl). A tap on one tracks it, as on the 2D map. The
 * heights are as the feed sends them (trafficAloft: geometric, else pressure set on
 * the nearest altimeter).
 */
export default function TrafficAloftGl() {
  const on = usePreferences((s) => s.traffic);
  const tracking = useTracking((s) => !!s.hex);
  const geo = useGeo();
  return (on || tracking) && geo ? <Aloft geo={geo} /> : null;
}

interface Drawn {
  hex: string;
  lon: number;
  lat: number;
  groundM: number;
  altM: number;
  near: boolean;
}

function Aloft({ geo }: { geo: Geo }) {
  const { map } = useGlMap();
  const seen = useTracking((s) => s.seen);
  const hex = useTracking((s) => s.hex);
  const ownFt = useOwnFix()?.altitudeFt ?? null;
  const stretch = useDrawnStretch();
  useGlLayer("top", SOURCES, LAYERS);
  useEffect(() => {
    addTrafficPictures(map);
  }, [map]);

  useDeckLayers(KEY, NONE);

  // Each airplane carried on to now and given to the map and to deck.gl
  // (drawAloft), a step at a time, only while the page is in sight:
  // hidden, nothing is drawn, and the step ran on for nothing (the
  // in-flight audit, 2026-11-21). Back in sight it steps at once to now.
  // Stepped here, not by a state set each step: that drew the component
  // again five times a second for what is only the map's (the speed
  // audit of 2026-11-27).
  const step = useEffectEvent(() => drawAloft(geo, map, { seen, hex, ownFt, stretch }));
  useEffect(() => {
    step();
  }, [geo, map, seen, ownFt, hex, stretch]);
  useEffect(() => {
    let timer = 0;
    const run = () => {
      window.clearInterval(timer);
      timer = 0;
      if (document.hidden) return;
      step();
      timer = window.setInterval(() => step(), STEP_MS);
    };
    run();
    document.addEventListener("visibilitychange", run);
    return () => {
      document.removeEventListener("visibilitychange", run);
      window.clearInterval(timer);
    };
  }, [map]);

  // A tap on one tracks it, as on the 2D map.
  useGlTap([IDS.marks], TAP.mark, TAP.rank.mark, (feature) => {
    const tapped = String(feature.properties.hex);
    pickOnMap("flight");
    useTracking.getState().pick?.(tapped, seen.find((r) => r.plane.hex === tapped)?.plane);
  });
  return null;
}

const KEY = "traffic-aloft";
const NONE: never[] = [];

/** Each airplane seen carried on to now, at its height over the ground as
 *  drawn: its mark and tag to the map's source, its drop line to deck.gl. */
function drawAloft(
  geo: Geo,
  map: ReturnType<typeof useGlMap>["map"],
  { seen, hex, ownFt, stretch }: { seen: Report[]; hex: string | null; ownFt: number | null; stretch: HeightStretch },
) {
  const now = Date.now();
  markTraffic(
    seen.map((r) => r.plane),
    ownFt,
  );
  const drawn: Drawn[] = [];
  const features: GeoJSON.Feature<GeoJSON.Point, TrafficMarkProps>[] = [];
  // How long a report is carried on, the engine's (traffic_figures), asked once a tick.
  const carry = carryS();
  for (const { plane, at } of seen) {
    const age = (now - at) / 1000;
    if (age > carry) continue;
    const { lat, lon } = carriedOn(geo, plane, age);
    const groundM = map.queryTerrainElevation([lon, lat]) ?? 0;
    // The ground as drawn, stretched; the airplane stretched with it.
    const altM = standAtM(plane.altitude_ft, groundM, stretch);
    const near = nearOwnHeight(plane, ownFt);
    const tracked = plane.hex === hex;
    const callsign = tracked ? (plane.callsign ?? plane.registration ?? "") : "";
    drawn.push({ hex: plane.hex, lon, lat, groundM, altM, near });
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        hex: plane.hex,
        icon: trafficPicture(near, plane.track_deg != null, tracked),
        track: plane.track_deg ?? 0,
        tracked,
        label: trafficLabel(plane, ownFt),
        callsign,
        ink: near ? CHART.trafficNearText : CHART.casing,
        alt_m: altM,
      },
    });
  }
  const points: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
  map.getSource<GeoJSONSource>(POINTS)?.setData(points);
  drawnWithData(map, POINTS, points);
  putDeckLayers(map, KEY, [
    new LineLayer<Drawn>({
      id: "traffic-aloft-drop",
      data: drawn,
      getSourcePosition: (d) => [d.lon, d.lat, d.altM],
      getTargetPosition: (d) => [d.lon, d.lat, d.groundM],
      getColor: (d) => deckColour(d.near ? TRAFFIC_COLOURS.near : TRAFFIC_COLOURS.far, 0.8),
      getWidth: 1,
      widthUnits: "pixels",
      ...deckSlot("marks"),
    }),
  ]);
}
