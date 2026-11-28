import { LineLayer } from "@deck.gl/layers";
import { useDrawnStretch } from "./heightStretch";
import { useEffect, useEffectEvent } from "react";
import { deckColour, deckSlot, putDeckLayers, useDeckLayers } from "../../../lib/map/gl/deckLayers";
import { EMPTY, drawnWithData, useGlLayer, useGlMap, useGlTap } from "../../../lib/map/gl/glLayer";
import { TAP } from "../../../lib/map/gl/layers/common";
import { TRAFFIC_COLOURS } from "../../../lib/map/marks/icons";
import { useOwnFix } from "../../../lib/map/position/ownShip";
import { useTracking, type Report } from "../../../lib/map/position/tracking";
import { usePreferences, type HeightStretch } from "../../../lib/preferences";
import { CHART } from "../../../lib/tokens";
import { addTrafficPictures, trafficLayers, trafficPicture, type TrafficMarkProps } from "../layers/trafficMarks";
import { sendTraffic, trafficFrameMs } from "../layers/trafficSend";
import { appZoomOf } from "../../../lib/map/gl/glStyle";
import { carryS, carriedOn, markTraffic, nearOwnHeight, trafficLabel } from "../../../lib/traffic";
import { standAtM } from "./trafficAloft";
import { useGeo, type Geo } from "../../../lib/geo";
import { pickOnMap } from "../../../lib/map/mapPick";

const POINTS = "traffic-aloft";
const TRENDS = "traffic-aloft-trends";
const IDS = { marks: "traffic-aloft", tags: "traffic-aloft-tags", trends: "traffic-aloft-trend-lines" };
/** The 2D map's own layers (trafficMarks), each mark and tag lifted to
 *  its `alt_m`; the trend source stays empty, as a minute's line ahead is
 *  drawn on the flat map only. */
const SOURCES = {
  [POINTS]: { type: "geojson" as const, data: EMPTY, promoteId: "hex" },
  [TRENDS]: { type: "geojson" as const, data: EMPTY },
};
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
  // hidden, nothing is drawn, and the step ran on for nothing. Back in sight it steps at once to now.
  // Stepped here, not by a state set each step: that drew the component
  // again five times a second for what is only the map's.
  const step = useEffectEvent(() => drawAloft(geo, map, { seen, hex, ownFt, stretch }));
  useEffect(() => {
    step();
  }, [geo, map, seen, ownFt, hex, stretch]);
  useEffect(() => {
    let timer = 0;
    const run = () => {
      window.clearTimeout(timer);
      timer = 0;
      if (document.hidden) return;
      step();
      const { hex: tracked, follow } = useTracking.getState();
      // As often as the flat map steps at this zoom (trafficFrameMs): once
      // a second at the chart's scales, more often close in and while one
      // is followed, so a mark close in never hops a second at a time.
      timer = window.setTimeout(run, trafficFrameMs(appZoomOf(map.getZoom()), !!tracked && follow));
    };
    run();
    document.addEventListener("visibilitychange", run);
    return () => {
      document.removeEventListener("visibilitychange", run);
      window.clearTimeout(timer);
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

/** The drop lines' data deck.gl was last given, by map: the same array
 *  while the same airplanes are drawn, each moved in place and the layer's
 *  positions and colours asked again by `step` (updateTriggers), so a step
 *  recomputes those alone, not every attribute as for new data. */
const dropped = new WeakMap<object, { drawn: Drawn[]; hexes: string; step: number }>();

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
  // Only the airplanes that changed, by hex (trafficSend), the height
  // sent with the place as it changes each step, not as a new look.
  sendTraffic(map, POINTS, features, ["alt_m"]);
  drawnWithData(map, POINTS, { type: "FeatureCollection", features });
  const hexes = drawn.map((d) => d.hex).join();
  let held = dropped.get(map);
  if (held?.hexes === hexes) {
    held.drawn.forEach((d, i) => Object.assign(d, drawn[i]));
    held.step += 1;
  } else dropped.set(map, (held = { drawn, hexes, step: 0 }));
  const step = held.step;
  putDeckLayers(map, KEY, [
    new LineLayer<Drawn>({
      id: "traffic-aloft-drop",
      data: held.drawn,
      updateTriggers: { getSourcePosition: step, getTargetPosition: step, getColor: step },
      getSourcePosition: (d) => [d.lon, d.lat, d.altM],
      getTargetPosition: (d) => [d.lon, d.lat, d.groundM],
      getColor: (d) => deckColour(d.near ? TRAFFIC_COLOURS.near : TRAFFIC_COLOURS.far, 0.8),
      getWidth: 1,
      widthUnits: "pixels",
      ...deckSlot("marks"),
    }),
  ]);
}
