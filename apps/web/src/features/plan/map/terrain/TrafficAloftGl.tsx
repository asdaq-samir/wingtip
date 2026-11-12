import { LineLayer } from "@deck.gl/layers";
import type { SymbolLayerSpecification } from "maplibre-gl";
import { useEffect, useMemo, useState } from "react";
import { deckColour, deckSlot, useDeckLayers } from "../../../../lib/map/gl/deckLayers";
import { EMPTY, drawSvg, useGlData, useGlLayer, useGlMap, useGlTap } from "../../../../lib/map/gl/glLayer";
import { GL_FONT_BOLD, TAP } from "../../../../lib/map/gl/layers/common";
import { TRAFFIC_COLOURS } from "../../../../lib/map/marks/icons";
import { useOwnFix } from "../../../../lib/map/position/ownShip";
import { useTracking } from "../../../../lib/map/position/tracking";
import { usePreferences } from "../../../../lib/preferences";
import { CHART } from "../../../../lib/tokens";
import { CARRY_S, carriedOn, markTraffic, nearOwnHeight, trafficLabel } from "../traffic";
import { standAtM, trafficPicture } from "./trafficAloft";

const LAYER = "traffic-aloft";
/** How often the airplanes are carried on along their tracks, ms: the
 *  2D map's own step close in (TrafficGl's FRAME_MS, doubled). */
const STEP_MS = 200;

/** The marks' pictures: the 2D map's chevron (icons.ts trafficIcon), or
 *  its dot with no track, in each of its two colours, with its white
 *  casing. */
const PICTURES = (["near", "far"] as const).flatMap((c) =>
  (["arrow", "dot"] as const).map((shape) => {
    const fill = TRAFFIC_COLOURS[c];
    const body =
      shape === "arrow"
        ? `<path d="M11 2 L18 19 L11 14.5 L4 19 Z" fill="${fill}" stroke="${CHART.casing}" stroke-width="2" stroke-linejoin="round"/>`
        : `<circle cx="11" cy="11" r="5" fill="${fill}" stroke="${CHART.casing}" stroke-width="2"/>`;
    return [trafficPicture(c === "near", shape === "arrow"), `<svg width="16" height="16" viewBox="0 0 22 22">${body}</svg>`] as const;
  }),
);

/** Each airplane a symbol lifted to its height (MapLibre 6.6's stock
 *  symbol elevation, `symbol-height-offset` from the sea), turned to its
 *  track on the map, its words -- its height against own ship's in
 *  hundreds as TCAS writes it, the tracked one's call sign -- under it. */
const MARKS: SymbolLayerSpecification = {
  id: LAYER,
  type: "symbol",
  source: LAYER,
  layout: {
    "icon-image": ["get", "icon"],
    "icon-rotate": ["get", "track"],
    "icon-rotation-alignment": "map",
    "icon-size": ["case", ["get", "tracked"], 1.3, 1],
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
    "text-field": ["get", "words"],
    "text-font": GL_FONT_BOLD,
    "text-size": 11,
    "text-anchor": "top",
    "text-offset": [0, 0.9],
    "text-allow-overlap": true,
    "text-ignore-placement": true,
    "symbol-height-offset": ["get", "alt_m"],
    "symbol-height-anchor": "absolute",
  },
  paint: { "text-color": ["get", "ink"], "text-halo-color": CHART.tag, "text-halo-width": 1.5 },
};

/**
 * The traffic in 3D (TerrainGl mounts it while the traffic is drawn): each
 * airplane at its reported height over where it is, the 2D map's own mark
 * and words, with a thin line down to the ground under it (deck.gl's
 * LineLayer), so its height reads against the hills and the runway. The
 * 2D marks on the ground are hidden meanwhile (`data-traffic-aloft`,
 * index.css). A tap on one tracks it, as on the 2D map. The heights are
 * as the feed sends them (trafficAloft: geometric, else pressure set on
 * the nearest altimeter).
 */
export default function TrafficAloftGl() {
  const on = usePreferences((s) => s.traffic);
  const tracking = useTracking((s) => !!s.hex || s.listing);
  return on || tracking ? <Aloft /> : null;
}

interface Drawn {
  hex: string;
  lon: number;
  lat: number;
  groundM: number;
  altM: number;
  near: boolean;
}

function Aloft() {
  const { map } = useGlMap();
  const seen = useTracking((s) => s.seen);
  const hex = useTracking((s) => s.hex);
  const ownFt = useOwnFix()?.altitudeFt ?? null;
  useGlLayer("top", { [LAYER]: { type: "geojson", data: EMPTY } }, [MARKS]);

  // The marks' pictures, drawn once at the screen's density.
  useEffect(() => {
    for (const [id, svg] of PICTURES)
      void drawSvg(svg).then((d) => {
        if (d && map.style && !map.hasImage(id)) map.addImage(id, d.image, { pixelRatio: d.options.pixelRatio });
      });
  }, [map]);

  // Each airplane carried on along its track a step at a time.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), STEP_MS);
    const el = map.getContainer();
    el.dataset.trafficAloft = "";
    return () => {
      window.clearInterval(timer);
      delete el.dataset.trafficAloft;
    };
  }, [map]);

  const drawn = useMemo(() => {
    markTraffic(
      seen.map((r) => r.plane),
      ownFt,
    );
    const out: (Drawn & { feature: GeoJSON.Feature })[] = [];
    for (const { plane, at } of seen) {
      const age = (now - at) / 1000;
      if (age > CARRY_S) continue;
      const { lat, lon } = carriedOn(plane, age);
      const groundM = map.queryTerrainElevation([lon, lat]) ?? 0;
      const altM = standAtM(plane.altitude_ft, groundM);
      const near = nearOwnHeight(plane, ownFt);
      const tracked = plane.hex === hex;
      const label = trafficLabel(plane, ownFt);
      const callsign = tracked ? (plane.callsign ?? plane.registration ?? null) : null;
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
            icon: trafficPicture(near, plane.track_deg != null),
            track: plane.track_deg ?? 0,
            tracked,
            words: [label, callsign].filter(Boolean).join("\n"),
            ink: near ? CHART.trafficNearText : CHART.casing,
            alt_m: altM,
          },
        },
      });
    }
    return out;
  }, [map, seen, ownFt, hex, now]);

  useGlData(
    LAYER,
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
  useEffect(() => {
    map.getContainer().dataset.trafficAloft = String(drawn.length);
  }, [map, drawn]);

  // A tap on one tracks it, as on the 2D map.
  useGlTap([LAYER], TAP.mark, TAP.rank.mark, (feature) => {
    const tapped = String(feature.properties.hex);
    useTracking.getState().pick?.(tapped, seen.find((r) => r.plane.hex === tapped)?.plane);
  });
  return null;
}
