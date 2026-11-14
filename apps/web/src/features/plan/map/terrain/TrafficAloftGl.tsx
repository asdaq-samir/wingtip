import { LineLayer } from "@deck.gl/layers";
import { useDrawnStretch } from "./heightStretch";
import { useEffect, useMemo, useState } from "react";
import { deckColour, deckSlot, useDeckLayers } from "../../../../lib/map/gl/deckLayers";
import { EMPTY, useGlData, useGlLayer, useGlMap, useGlTap } from "../../../../lib/map/gl/glLayer";
import { TAP } from "../../../../lib/map/gl/layers/common";
import { TRAFFIC_COLOURS } from "../../../../lib/map/marks/icons";
import { useOwnFix } from "../../../../lib/map/position/ownShip";
import { useTracking } from "../../../../lib/map/position/tracking";
import { usePreferences } from "../../../../lib/preferences";
import { CHART } from "../../../../lib/tokens";
import { addTrafficPictures, trafficLayers, trafficPicture, type TrafficMarkProps } from "../layers/trafficMarks";
import { CARRY_S, carriedOn, markTraffic, nearOwnHeight, trafficLabel } from "../traffic";
import { standAtM } from "./trafficAloft";
import { useGeo, type Geo } from "../../../../lib/geo";

/** How often the airplanes are carried on along their tracks, ms: the
 *  2D map's own step close in (TrafficGl's FRAME_MS, doubled). */
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
  const tracking = useTracking((s) => !!s.hex || s.listing);
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

  // Each airplane carried on along its track a step at a time.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), STEP_MS);
    return () => window.clearInterval(timer);
  }, [map]);

  const drawn = useMemo(() => {
    markTraffic(
      seen.map((r) => r.plane),
      ownFt,
    );
    const out: (Drawn & { feature: GeoJSON.Feature<GeoJSON.Point, TrafficMarkProps> })[] = [];
    for (const { plane, at } of seen) {
      const age = (now - at) / 1000;
      if (age > CARRY_S) continue;
      const { lat, lon } = carriedOn(geo, plane, age);
      const groundM = map.queryTerrainElevation([lon, lat]) ?? 0;
      // The ground as drawn, stretched; the airplane stretched with it.
      const altM = standAtM(plane.altitude_ft, groundM, stretch);
      const near = nearOwnHeight(plane, ownFt);
      const tracked = plane.hex === hex;
      const callsign = tracked ? (plane.callsign ?? plane.registration ?? "") : "";
      out.push({
        hex: plane.hex,
        lon,
        lat,
        groundM,
        altM,
        near,
        feature: {
          type: "Feature",
          geometry: { type: "Point", coordinates: [lon, lat] },
          properties: {
            hex: plane.hex,
            icon: trafficPicture(near, plane.track_deg != null, tracked),
            track: plane.track_deg ?? 0,
            tracked,
            dim: false,
            label: trafficLabel(plane, ownFt),
            callsign,
            ink: near ? CHART.trafficNearText : CHART.casing,
            alt_m: altM,
          },
        },
      });
    }
    return out;
  }, [geo, map, seen, ownFt, hex, now, stretch]);

  useGlData(
    POINTS,
    useMemo(() => ({ type: "FeatureCollection", features: drawn.map((d) => d.feature) }), [drawn]),
  );
  const layers = useMemo(
    () => [
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
    ],
    [drawn],
  );
  useDeckLayers("traffic-aloft", layers);

  // A tap on one tracks it, as on the 2D map.
  useGlTap([IDS.marks], TAP.mark, TAP.rank.mark, (feature) => {
    const tapped = String(feature.properties.hex);
    useTracking.getState().pick?.(tapped, seen.find((r) => r.plane.hex === tapped)?.plane);
  });
  return null;
}
