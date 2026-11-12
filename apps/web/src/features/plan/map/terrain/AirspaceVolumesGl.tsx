import { useQuery } from "@tanstack/react-query";
import type { FillExtrusionLayerSpecification, Map as MlMap } from "maplibre-gl";
import { useEffect, useMemo } from "react";
import { AirspaceCardBody } from "../../../../components/map/cards/AirspaceCard";
import { useGlMap, useGlTap, slotId } from "../../../../lib/map/gl/glLayer";
import { volumeOfTile } from "../../../../lib/map/gl/glOverlays";
import { AIRSPACE_INK, OVERLAY_SOURCE, SUA_INK, glZoom } from "../../../../lib/map/gl/glStyle";
import { TAP } from "../../../../lib/map/gl/layers/common";
import { usePreferences } from "../../../../lib/preferences";
import { tfrsQuery } from "../../../../lib/queryClient";
import { TfrCard } from "../TfrCard";
import { TFR_RED, inForce } from "../tfrMarks";
import { extrusionHeights, meanGround, vertexCentroids, type VolumeHeights } from "./airspaceHeights";
import { DRAWN, SUA_MOA, SUA_RESTRICTED, SURFACE_E, heightsOf, suaOfTile, type SourceLayer } from "./tileVolumes";
import { DEM } from "./dem";
import { metresPerPixel, railFeatures, type RailPiece } from "./rails";
import { SuaVolumeCard } from "./SuaVolumeCard";
import { setExtrusionData, useExtrusion } from "./useExtrusion";

/**
 * The airspace stood up in 3D, as ForeFlight's 3D view draws it: each
 * volume see-through between its own floor and ceiling, in its class's
 * ink -- Class B blue, C magenta, D the fainter blue its dashed line is
 * drawn in, a surface Class E faint magenta, the special use areas in
 * SUA_INK, the TFRs red. From the cycle's overlay tiles (the `airspace`
 * layer, the NASR Class Airspace shapefile, and `special_use`, the FAA's
 * special use airspace service as wingtip.sua reads it) and the planner's
 * TFRs (tfrsQuery), the same features the chart's lines are drawn from,
 * so the tiles are not fetched again.
 *
 * Heights (airspaceHeights): MapLibre stands an extrusion on the terrain
 * at its centroid, so an MSL floor or ceiling is given less the ground
 * there, read from the same terrain tiles, and an AGL one as it is. The
 * tiles' features are MapLibre's to cut, so each volume's base and height
 * are its feature state (the tiles carry tippecanoe's --generate-ids),
 * worked out again as the view, the terrain's tiles or the overlay's
 * come in.
 *
 * What is drawn (aviation-check): Class B, C and D as the NASR file gives
 * them, a "to but not including" ceiling (UPPER_DESC TNI) at its figure;
 * Class E only where it is at the surface (LOCAL_TYPE CLASS_E2, a surface
 * area designated for an airport, 14 CFR 71.71(b), and E3/E4, its
 * extensions, from the surface: tileVolumes' SURFACE_E), the rest of
 * Class E being everywhere from 700 or 1,200 ft (71.71(c), (e)) and no
 * volume to see; Class A, from
 * 18,000 ft MSL (14 CFR 71.33), never. Not cluttered: MapLibre draws only
 * the tiles in view, and from far out only Class B and the special use
 * areas, C from the app's zoom 9 and D and E from 10. The labels stay
 * the chart's tabs on the ground: MapLibre has no way to lift a symbol
 * off the terrain (its style spec has no symbol elevation), so floating
 * them at a volume's top would take a marker per volume moved each frame.
 */

/** Each volume's own see-through: a layer's opacity is one for all of it
 *  (MapLibre's fill-extrusion-opacity is not by feature), so a layer a
 *  class. Strong enough to read over the chart, faint enough to see the
 *  ground and the route through two walls. */
const OPACITY = { B: 0.22, C: 0.2, D: 0.14, E: 0.08, restricted: 0.16, moa: 0.13, tfr: 0.3, tfrLater: 0.12, rail: 0.85 } as const;

/** The base and height a feature's state holds (VolumeStates); a volume
 *  not yet worked out is drawn nowhere (both 0). */
const STATE_HEIGHTS = {
  "fill-extrusion-base": ["coalesce", ["feature-state", "base"], 0] as never,
  "fill-extrusion-height": ["coalesce", ["feature-state", "height"], 0] as never,
  // Each face one shade, walls and top told apart by the light: crisp
  // edges, where the gradient would fade the walls into the ground.
  "fill-extrusion-vertical-gradient": false,
};

function tileLayer(id: string, sourceLayer: SourceLayer, filter: unknown, kind: Kind): FillExtrusionLayerSpecification {
  return {
    id,
    type: "fill-extrusion",
    source: OVERLAY_SOURCE,
    "source-layer": sourceLayer,
    minzoom: glZoom(KINDS[kind].from),
    filter: filter as never,
    paint: { "fill-extrusion-color": KINDS[kind].ink, "fill-extrusion-opacity": OPACITY[kind], ...STATE_HEIGHTS },
  };
}

const CLASS_LAYERS = ["B", "C", "D"].map((c) => `airspace-3d-${c}`);
const SUA_3D = ["sua-3d-restricted", "sua-3d-moa"];
/** Each kind's ink and the app's zoom it is drawn from: far out only
 *  Class B and the special use areas; C from 9; D and surface E from 10. */
const KINDS = {
  E: { ink: AIRSPACE_INK.E.colour, from: 10 },
  moa: { ink: SUA_INK.moa, from: 7 },
  restricted: { ink: SUA_INK.restricted, from: 7 },
  D: { ink: AIRSPACE_INK.D.colour, from: 10 },
  C: { ink: AIRSPACE_INK.C.colour, from: 9 },
  B: { ink: AIRSPACE_INK.B.colour, from: 7 },
} as const;
type Kind = keyof typeof KINDS;
const kindOf = (layer: SourceLayer, p: Record<string, unknown>): Kind =>
  layer === "special_use" ? (SUA_RESTRICTED.includes(String(p.type)) ? "restricted" : "moa") : (String(p.class) as Kind);
const TILE_LAYERS: FillExtrusionLayerSpecification[] = [
  tileLayer(
    "airspace-3d-E",
    "airspace",
    [
      "all",
      ["==", ["get", "class"], "E"],
      ["in", ["get", "local_type"], ["literal", SURFACE_E]],
      ["==", ["coalesce", ["get", "floor_ft"], 0], 0],
    ],
    "E",
  ),
  tileLayer("sua-3d-moa", "special_use", ["in", ["get", "type"], ["literal", SUA_MOA]], "moa"),
  tileLayer("sua-3d-restricted", "special_use", ["in", ["get", "type"], ["literal", SUA_RESTRICTED]], "restricted"),
  tileLayer("airspace-3d-D", "airspace", ["==", ["get", "class"], "D"], "D"),
  tileLayer("airspace-3d-C", "airspace", ["==", ["get", "class"], "C"], "C"),
  tileLayer("airspace-3d-B", "airspace", ["==", ["get", "class"], "B"], "B"),
];

const groundAt = (map: MlMap) => (at: [number, number]) => map.queryTerrainElevation(at);

/** A feature's polygons' rings, a multipolygon's all. */
const ringsOf = (g: { type: string; coordinates?: unknown }): number[][][] =>
  g.type === "Polygon" ? (g.coordinates as number[][][]) : g.type === "MultiPolygon" ? (g.coordinates as number[][][][]).flat() : [];

/** Each drawn tile volume's base and height into its feature state, from
 *  the pieces of it the loaded tiles hold; the count lifted, and the
 *  pieces drawn at this zoom for their rails. */
function liftTileVolumes(map: MlMap, held: Map<string, string>): { lifted: number; rails: RailPiece[] } {
  const rails: RailPiece[] = [];
  if (!map.getSource(OVERLAY_SOURCE) || !map.getTerrain()) return { lifted: 0, rails };
  const ground = groundAt(map);
  const zoom = map.getZoom();
  let lifted = 0;
  for (const sourceLayer of ["airspace", "special_use"] as const) {
    const pieces = new Map<string | number, { props: Record<string, unknown>; centroids: [number, number][] }>();
    for (const f of map.querySourceFeatures(OVERLAY_SOURCE, { sourceLayer })) {
      if (f.id == null || !DRAWN[sourceLayer](f.properties)) continue;
      const kept = pieces.get(f.id) ?? { props: f.properties, centroids: [] as [number, number][] };
      kept.centroids.push(...vertexCentroids(f.geometry));
      pieces.set(f.id, kept);
      const kind = KINDS[kindOf(sourceLayer, f.properties)];
      if (zoom >= glZoom(kind.from))
        rails.push({ rings: ringsOf(f.geometry), heights: heightsOf(sourceLayer, f.properties), ink: kind.ink });
    }
    for (const [id, { props, centroids }] of pieces) {
      const g = meanGround(centroids, ground);
      if (g == null) continue;
      const h = extrusionHeights(heightsOf(sourceLayer, props), g) ?? { base: 0, height: 0 };
      if (h.height > 0) lifted++;
      // Set again only where it moved a metre: each set redraws.
      const key = `${sourceLayer}:${id}`;
      const value = `${Math.round(h.base)},${Math.round(h.height)}`;
      if (held.get(key) === value) continue;
      held.set(key, value);
      map.setFeatureState({ source: OVERLAY_SOURCE, sourceLayer, id }, h);
    }
  }
  return { lifted, rails };
}

/** How wide and deep a rail is: two and a half pixels at the view's middle. */
const RAIL_PX = 2.5;

/** The TFRs as extrusions, each lifted over the ground at its centroid. */
function tfrFeatures(
  map: MlMap,
  tfrs: { id: string; geometry: { type: string; coordinates?: unknown }; heights: VolumeHeights }[],
): GeoJSON.FeatureCollection {
  const ground = groundAt(map);
  const features: GeoJSON.Feature[] = [];
  for (const t of tfrs) {
    const g = meanGround(vertexCentroids(t.geometry), ground);
    const h = g == null ? null : extrusionHeights(t.heights, g);
    if (h) features.push({ type: "Feature", geometry: t.geometry as GeoJSON.Geometry, properties: { id: t.id, ...h } });
  }
  return { type: "FeatureCollection", features };
}

const TFR_PAINT = {
  "fill-extrusion-base": ["get", "base"] as never,
  "fill-extrusion-height": ["get", "height"] as never,
  "fill-extrusion-vertical-gradient": false,
};

export default function AirspaceVolumesGl() {
  const { map, overlays, openCard } = useGlMap();
  const showAirspace = usePreferences((s) => s.airspace);
  const showTfrs = usePreferences((s) => s.tfrs);

  // The tile volumes, under the route and the marks.
  useEffect(() => {
    if (!overlays || !map.getSource(OVERLAY_SOURCE)) return;
    for (const layer of TILE_LAYERS) if (!map.getLayer(layer.id)) map.addLayer(layer, slotId("marks"));
    return () => {
      if (!map.style) return;
      for (const layer of TILE_LAYERS) if (map.getLayer(layer.id)) map.removeLayer(layer.id);
    };
  }, [map, overlays]);
  useEffect(() => {
    if (!overlays) return;
    for (const layer of TILE_LAYERS)
      if (map.getLayer(layer.id)) map.setLayoutProperty(layer.id, "visibility", showAirspace ? "visible" : "none");
  }, [map, overlays, showAirspace]);

  useExtrusion(map, "tfr-3d", {
    type: "fill-extrusion",
    paint: { "fill-extrusion-color": TFR_RED, "fill-extrusion-opacity": OPACITY.tfr, ...TFR_PAINT },
  });
  useExtrusion(map, "tfr-3d-later", {
    type: "fill-extrusion",
    paint: { "fill-extrusion-color": TFR_RED, "fill-extrusion-opacity": OPACITY.tfrLater, ...TFR_PAINT },
  });
  // The edges, over the volumes: one layer, each rail in its volume's ink.
  useExtrusion(map, "airspace-3d-rails", {
    type: "fill-extrusion",
    paint: { "fill-extrusion-color": ["get", "ink"] as never, "fill-extrusion-opacity": OPACITY.rail, ...TFR_PAINT },
  });
  const { data: tfrs, dataUpdatedAt: now } = useQuery({ ...tfrsQuery, enabled: showTfrs });
  const tfrVolumes = useMemo(() => {
    const all = (showTfrs ? (tfrs ?? []) : []).map((t) => ({
      id: t.notam_id,
      geometry: t.geometry as unknown as { type: string; coordinates?: unknown },
      active: inForce(t, now),
      heights: { floorFt: t.floor_ft ?? null, floorRef: t.floor_ref, ceilingFt: t.ceiling_ft ?? null, ceilingRef: t.ceiling_ref },
    }));
    return { active: all.filter((t) => t.active), later: all.filter((t) => !t.active) };
  }, [tfrs, showTfrs, now]);

  // Lifted now, and again as the view moves and the terrain's and the
  // overlay's tiles come in, a quarter second after the last.
  useEffect(() => {
    const held = new Map<string, string>();
    const el = map.getContainer();
    let timer = 0;
    const lift = () => {
      const tiles = liftTileVolumes(map, held);
      el.dataset.airspace3d = String(tiles.lifted);
      const tfrRails = [...tfrVolumes.active, ...tfrVolumes.later].map((t) => ({
        rings: ringsOf(t.geometry),
        heights: t.heights,
        ink: TFR_RED,
      }));
      const widthM = RAIL_PX * metresPerPixel(map.getCenter().lat, map.getZoom());
      setExtrusionData(map, "airspace-3d-rails", railFeatures([...(showAirspace ? tiles.rails : []), ...tfrRails], widthM, groundAt(map)));
      const active = tfrFeatures(map, tfrVolumes.active),
        later = tfrFeatures(map, tfrVolumes.later);
      setExtrusionData(map, "tfr-3d", active);
      setExtrusionData(map, "tfr-3d-later", later);
      el.dataset.tfr3d = String(active.features.length + later.features.length);
    };
    const soon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(lift, 250);
    };
    const came = (e: { sourceId?: string; tile?: unknown }) => {
      if ((e.sourceId === DEM || e.sourceId === OVERLAY_SOURCE) && e.tile) soon();
    };
    lift();
    map.on("sourcedata", came);
    map.on("moveend", soon);
    return () => {
      window.clearTimeout(timer);
      map.off("sourcedata", came);
      map.off("moveend", soon);
      delete el.dataset.airspace3d;
      delete el.dataset.tfr3d;
    };
  }, [map, overlays, tfrVolumes, showAirspace]);

  // A tap on a volume opens the card its line on the chart does: a TFR's
  // before the classes', where one stands inside a shelf.
  useGlTap(["tfr-3d", "tfr-3d-later"], 1, TAP.rank.area - 0.5, (feature) => {
    const tfr = tfrs?.find((t) => t.notam_id === feature.properties.id);
    if (tfr) openCard(<TfrCard key={tfr.notam_id} tfr={tfr} active={inForce(tfr, now)} />);
  });
  useGlTap(CLASS_LAYERS, 1, TAP.rank.area + 0.5, (feature, event) => {
    const volume = volumeOfTile(feature, { lat: event.lngLat.lat, lon: event.lngLat.lng });
    openCard(<AirspaceCardBody key={volume.id} volume={volume} close={() => openCard(null)} />);
  });
  useGlTap(SUA_3D, 1, TAP.rank.area + 0.6, (feature) => {
    const area = suaOfTile(feature.properties);
    const colour = SUA_RESTRICTED.includes(String(feature.properties.type)) ? SUA_INK.restricted : SUA_INK.moa;
    openCard(<SuaVolumeCard key={`${area.name}-${String(feature.id)}`} area={area} colour={colour} />);
  });
  return null;
}
