import { useQuery } from "@tanstack/react-query";
import { useDrawnStretch } from "./heightStretch";
import { PathLayer, SolidPolygonLayer } from "@deck.gl/layers";
import { LngLat, type Map as MlMap, type SymbolLayerSpecification } from "maplibre-gl";
import { useEffect, useMemo, useState } from "react";
import { AirspaceCardBody } from "../../../../components/map/cards/AirspaceCard";
import { deckSlot, useDeckLayers, useDeckTap } from "../../../../lib/map/gl/deckLayers";
import { EMPTY, useGlData, useGlLayer, useGlMap } from "../../../../lib/map/gl/glLayer";
import { volumeOfTile } from "../../../../lib/map/gl/glOverlays";
import { SUA_INK } from "../../../../lib/map/gl/glStyle";
import { useGlView } from "../../../../lib/map/gl/useGlView";
import { suaTabLayout } from "../../../../lib/map/gl/glSuaLabels";
import { GL_FONT_BOLD, TAP } from "../../../../lib/map/gl/layers/common";
import { usePreferences } from "../../../../lib/preferences";
import { tfrsQuery } from "../../../../lib/queryClient";
import { CHART } from "../../../../lib/tokens";
import { TfrCard } from "../TfrCard";
import { inForce } from "../tfrMarks";
import { DEM } from "./dem";
import type { GroundPoint } from "./airspaceHeights";
import { KINDS, VolumeDrawing, boxOf, classesAt, kindOf, labelsOf, suaOfVolume, volumesQuery, type VolumePiece } from "./airspaceVolumes";
import { shadeOf, shelfLabelLayer, shelfLabelsOf } from "./airspaceShelves";
import { SuaVolumeCard } from "./SuaVolumeCard";

/**
 * The airspace stood up in 3D, as ForeFlight's 3D view draws it: each
 * volume see-through between its own floor and ceiling, in its class's
 * ink (airspaceVolumes' KINDS), with a crisp rim along its top -- and its
 * floor where that is off the ground -- and its name once. Drawn with
 * deck.gl's SolidPolygonLayer and PathLayer (lib/map/gl/deckLayers),
 * interleaved into the map's style under the lines and marks, from each
 * volume whole as the FAA draws it (the planner's /api/airspace/volumes
 * from the cycle's pack, and /api/tfrs): one shape, one top, one name,
 * where the tiles' pieces it was built from before were cut at every
 * tile's edge and stood each on its own ground.
 *
 * Heights (airspaceHeights): deck.gl draws at the heights it is given,
 * metres above the sea, and the 3D ground hides what is under it; only a
 * floor or ceiling above the ground reads the terrain, once its tiles
 * under the volume's whole outline are in, and keeps that ground until
 * they are all in again (VolumeDrawing), so nothing drops or jumps while
 * a pan's tiles load. Each stood up by the Heights' stretch with the
 * ground (piecesOf), the names and shelves' tabs lifted to the stretched
 * tops, their words the true altitudes. Only the volumes in view are asked for, and far out
 * only Class B and the special use areas (KINDS' `from`).
 *
 * Each area's name is a tab of the chart's look at its top (a MapLibre
 * symbol lifted to it, symbol-height-offset), and each Class B, C and D
 * shelf's altitudes as the sectional writes them, "100" over "30", at its
 * top on the edge nearest the camera, placed before the names where they
 * meet (and after the airports' and navaids' marks); each volume is shaded by its floor,
 * the lower the darker, and with a plan the volumes at its altitudes are
 * drawn stronger and the rest fainter (airspaceShelves). The chart's own
 * tabs on the ground, special use and Class B, C and D, are hidden
 * meanwhile. A tap on a volume opens the card its line on the chart does.
 */

const LABELS = "airspace-3d-labels";
const FILLS = "airspace-3d-fills";
const RIMS = "airspace-3d-rims";
const SHELVES = "airspace-3d-shelves";
/** The rims, each shelf's top and its floor off the ground: two pixels
 *  at any distance, solid, so the steps of a Class B read at a glance. */
const RIM_PX = 2;
/** How opaque a rim is, before the plan's fading. */
const RIM_ALPHA = 0.95;
/** The chart's own tabs on the ground, hidden while the volumes carry
 *  theirs at their tops: the special use names and the classes' altitudes. */
const GROUND_TABS = ["sua-labels", "airspace-labels"];

/** The volumes' box round the view, as the camera comes to rest. */
function volumeBox(map: MlMap) {
  const b = map.getBounds(),
    c = map.getCenter().wrap();
  return boxOf({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }, { lat: c.lat, lon: c.lng });
}

/** The ground nearest the viewer on the screen, [lon, lat], as the
 *  camera comes to rest: the middle of the screen's foot (MapLibre's
 *  unproject), where each shelf's label is put on the edge nearest it. */
function eyeOf(map: MlMap): [number, number] {
  const c = map.getCanvas();
  const at = map.unproject([c.clientWidth / 2, c.clientHeight]).wrap();
  return [at.lng, at.lat];
}
function useEye(map: MlMap) {
  const [eye, setEye] = useState(() => eyeOf(map));
  useEffect(() => {
    const rest = () => setEye(eyeOf(map));
    map.on("moveend", rest);
    return () => {
      map.off("moveend", rest);
    };
  }, [map]);
  return eye;
}

/** The terrain under a point as the map has it now (airspaceHeights'
 *  GroundPoint), metres as drawn, stretched. "loading" where a tile on
 *  the screen is drawn from a parent's heights while its own are still to
 *  come: a coarser tile's heights a few hundred metres off, and a volume
 *  stood on them would drop and rise as the tiles come in after a pan.
 *  Off the drawn tiles (an outline running past the screen) a point is
 *  read from loaded heights where there are some, and is otherwise none
 *  (null), never the 0 MapLibre gives for want of them, the sea, and never
 *  "loading" either: a tile off the screen may never load, and a volume
 *  waiting on it would never stand. The fallback zoom is MapLibre's
 *  tileZoom, the map's zoom floored (transform_helper). */
function groundReader(map: MlMap): (at: [number, number]) => GroundPoint {
  const terrain = map.terrain;
  if (!terrain) return () => null;
  const tileZoom = Math.max(0, Math.floor(map.getZoom()));
  return ([lon, lat]) => {
    const at = new LngLat(lon, lat);
    const own = terrain.getDrawnElevationForLngLat(at, true);
    if (own !== undefined) return own;
    if (terrain.getDrawnElevationForLngLat(at) !== undefined) return "loading";
    const { elevation, demState } = terrain.getElevationAndDEMStateForLngLat(at, tileZoom);
    return demState === "loaded" ? elevation : null;
  };
}

/** The terrain's tiles' coming in, a quarter second after the last, for
 *  the volumes above the ground to be read over it again. */
function useGroundTick(map: MlMap) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let timer = 0;
    const came = (e: { sourceId?: string; tile?: unknown }) => {
      if (e.sourceId !== DEM || !e.tile) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setTick((t) => t + 1), 250);
    };
    map.on("sourcedata", came);
    return () => {
      window.clearTimeout(timer);
      map.off("sourcedata", came);
    };
  }, [map]);
  return tick;
}

const LABEL_LAYER: SymbolLayerSpecification = {
  id: LABELS,
  type: "symbol",
  source: LABELS,
  layout: {
    ...suaTabLayout(GL_FONT_BOLD),
    "text-field": ["get", "name"],
    // At the area's top, metres above the sea (MapLibre 6.6's stock
    // symbol elevation), not on the ground under it.
    "symbol-height-offset": ["get", "top_m"],
    "symbol-height-anchor": "absolute",
  },
  paint: { "text-color": CHART.casing },
};

/** `altitudes`: the plan's (airspaceShelves' planAltitudes), the volumes
 *  holding them drawn stronger and the rest fainter; null with no plan. */
export default function AirspaceVolumesGl({ altitudes = null }: { altitudes?: number[] | null }) {
  const { map, openCard } = useGlMap();
  const eye = useEye(map);
  const showAirspace = usePreferences((s) => s.airspace);
  const showTfrs = usePreferences((s) => s.tfrs);
  const { box, level: zoom } = useGlView(volumeBox, "rest");
  const tick = useGroundTick(map);
  const stretch = useDrawnStretch();
  const classes = classesAt(zoom);
  const { data: volumes } = useQuery({ ...volumesQuery(box, classes), enabled: showAirspace });
  const { data: tfrs, dataUpdatedAt: now } = useQuery({ ...tfrsQuery, enabled: showTfrs });

  const features = useMemo(() => {
    const areas = showAirspace ? ((volumes?.features ?? []) as unknown as Parameters<VolumeDrawing["pieces"]>[0]) : [];
    const restrictions = (showTfrs ? (tfrs ?? []) : []).map((t) => ({
      geometry: t.geometry as unknown as { type: string },
      properties: {
        layer: "tfr",
        id: t.notam_id,
        active: inForce(t, now),
        floor_ft: t.floor_ft,
        floor_ref: t.floor_ref,
        ceiling_ft: t.ceiling_ft,
        ceiling_ref: t.ceiling_ref,
      },
    }));
    // Each kind from its own zoom (KINDS), a wider view's answer kept
    // on screen while a closer one comes.
    return [...areas.filter((f) => zoom >= KINDS[kindOf(f.properties)].from), ...restrictions];
  }, [volumes, tfrs, showAirspace, showTfrs, now, zoom]);

  // The drawing held across renders (VolumeDrawing): each volume's last
  // good ground, and the same pieces given again while nothing changed, so
  // deck.gl's data and the labels' sources are not set anew as the
  // terrain's tiles come in after a pan.
  const [drawing] = useState(() => new VolumeDrawing());
  const pieces = useMemo(
    () => drawing.pieces(features, groundReader(map), altitudes, stretch),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick: the terrain came in
    [drawing, features, map, tick, altitudes, stretch],
  );
  const layers = useMemo(
    () => [
      new SolidPolygonLayer<VolumePiece>({
        id: FILLS,
        data: pieces,
        extruded: true,
        // Its base is its polygon's own height, its floor; deck.gl adds this.
        getPolygon: (p) => p.polygon as never,
        getElevation: (p) => p.heightM,
        getFillColor: (p) => shadeOf(KINDS[p.kind].ink, p.floorFt, KINDS[p.kind].opacity, p.holds),
        material: false,
        pickable: true,
        // See-through: each blends over what is behind it, none hides
        // another, and the ground still hides what is under it.
        parameters: { depthWriteEnabled: false },
        ...deckSlot("lines"),
      }),
      new PathLayer<{ path: number[][]; piece: VolumePiece }>({
        id: RIMS,
        data: pieces.flatMap((p) => p.rims.map((path) => ({ path, piece: p }))),
        getPath: (r) => r.path as never,
        getColor: ({ piece: p }) => shadeOf(KINDS[p.kind].ink, p.floorFt, RIM_ALPHA, p.holds),
        getWidth: RIM_PX,
        widthUnits: "pixels",
        ...deckSlot("lines"),
      }),
    ],
    [pieces],
  );
  useDeckLayers("airspace-3d", layers);

  // The shelves' altitudes among the lines' labels, as the chart's own
  // tabs on the ground are: under the marks, so an airport's or a navaid's
  // mark is placed first and never hidden by one. The areas' names under
  // the shelves' tabs (MapLibre places the upper layer's first), so where
  // they meet at a low tilt each shelf keeps its own altitudes.
  useGlLayer("lines", { [SHELVES]: { type: "geojson", data: EMPTY } }, [shelfLabelLayer(SHELVES, SHELVES)]);
  useGlLayer("lines", { [LABELS]: { type: "geojson", data: EMPTY } }, [LABEL_LAYER], SHELVES);
  useGlData(
    LABELS,
    useMemo(() => labelsOf(pieces), [pieces]),
  );
  useGlData(
    SHELVES,
    useMemo(() => drawing.shelves(shelfLabelsOf(pieces, eye)), [drawing, pieces, eye]),
  );
  // The chart's own tabs on the ground, hidden while the volumes carry
  // theirs at their tops.
  useEffect(() => {
    const hide = () => GROUND_TABS.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", "none"));
    hide();
    map.on("styledata", hide);
    return () => {
      map.off("styledata", hide);
      if (map.style) GROUND_TABS.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", "visible"));
    };
  }, [map]);

  // For the browser tests: how many volumes stand.
  useEffect(() => {
    const el = map.getContainer();
    el.dataset.airspace3d = String(pieces.filter((p) => p.properties.layer !== "tfr").length);
    el.dataset.tfr3d = String(pieces.filter((p) => p.properties.layer === "tfr").length);
    return () => {
      delete el.dataset.airspace3d;
      delete el.dataset.tfr3d;
    };
  }, [map, pieces]);

  // A tap on a volume opens the card its line on the chart does: a TFR's
  // before the classes', where one stands inside a shelf.
  useDeckTap([FILLS], 1, TAP.rank.area + 0.5, (picked, event) => {
    const p = picked.properties;
    if (p.layer === "tfr") {
      const tfr = tfrs?.find((t) => t.notam_id === p.id);
      if (tfr) openCard(<TfrCard key={tfr.notam_id} tfr={tfr} active={inForce(tfr, now)} />);
    } else if (p.layer === "special_use") {
      const colour = kindOf(p) === "restricted" ? SUA_INK.restricted : SUA_INK.moa;
      openCard(<SuaVolumeCard key={String(p.name)} area={suaOfVolume(p)} colour={colour} />);
    } else {
      const volume = volumeOfTile(picked, { lat: event.lngLat.lat, lon: event.lngLat.lng });
      openCard(<AirspaceCardBody key={volume.id} volume={volume} close={() => openCard(null)} />);
    }
  });
  return null;
}
