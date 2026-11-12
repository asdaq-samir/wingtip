import { useQuery } from "@tanstack/react-query";
import { PathLayer, SolidPolygonLayer } from "@deck.gl/layers";
import type { Map as MlMap, SymbolLayerSpecification } from "maplibre-gl";
import { useEffect, useMemo, useState } from "react";
import { AirspaceCardBody } from "../../../../components/map/cards/AirspaceCard";
import { deckColour, deckSlot, useDeckLayers, useDeckTap } from "../../../../lib/map/gl/deckLayers";
import { EMPTY, useGlData, useGlLayer, useGlMap } from "../../../../lib/map/gl/glLayer";
import { volumeOfTile } from "../../../../lib/map/gl/glOverlays";
import { SUA_INK, appZoomOf } from "../../../../lib/map/gl/glStyle";
import { suaTabLayout } from "../../../../lib/map/gl/glSuaLabels";
import { GL_FONT_BOLD, TAP } from "../../../../lib/map/gl/layers/common";
import { usePreferences } from "../../../../lib/preferences";
import { tfrsQuery } from "../../../../lib/queryClient";
import { CHART } from "../../../../lib/tokens";
import { TfrCard } from "../TfrCard";
import { inForce } from "../tfrMarks";
import { DEM } from "./dem";
import { KINDS, boxOf, classesAt, kindOf, labelsOf, piecesOf, suaOfVolume, volumesQuery, type VolumePiece } from "./airspaceVolumes";
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
 * floor or ceiling above the ground reads the terrain, once a volume, as
 * its tiles come in. Only the volumes in view are asked for, and far out
 * only Class B and the special use areas (KINDS' `from`).
 *
 * Each area's name is a tab of the chart's look at its top (a MapLibre
 * symbol lifted to it, symbol-height-offset): the chart's own special use
 * tabs, placed along each boundary on the ground, are hidden meanwhile.
 * The Class B, C and D keep their altitudes' tabs on the ground, one a
 * shelf. A tap on a volume opens the card its line on the chart does.
 */

const LABELS = "airspace-3d-labels";
const FILLS = "airspace-3d-fills";
const RIMS = "airspace-3d-rims";
/** The rims: a hairline and a half at any distance. */
const RIM_PX = 1.5;

/** The view's box and the app's zoom, as the camera comes to rest. */
function useView(map: MlMap) {
  const read = () => {
    const b = map.getBounds(),
      c = map.getCenter().wrap();
    return {
      box: boxOf({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }, { lat: c.lat, lon: c.lng }),
      zoom: Math.floor(appZoomOf(map.getZoom())),
    };
  };
  const [view, setView] = useState(read);
  useEffect(() => {
    const moved = () => {
      const next = read();
      setView((was) => (JSON.stringify(was) === JSON.stringify(next) ? was : next));
    };
    map.on("moveend", moved);
    return () => {
      map.off("moveend", moved);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read is the map's
  }, [map]);
  return view;
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

export default function AirspaceVolumesGl() {
  const { map, openCard } = useGlMap();
  const showAirspace = usePreferences((s) => s.airspace);
  const showTfrs = usePreferences((s) => s.tfrs);
  const { box, zoom } = useView(map);
  const tick = useGroundTick(map);
  const classes = classesAt(zoom);
  const { data: volumes } = useQuery({ ...volumesQuery(box, classes), enabled: showAirspace });
  const { data: tfrs, dataUpdatedAt: now } = useQuery({ ...tfrsQuery, enabled: showTfrs });

  const features = useMemo(() => {
    const areas = showAirspace ? ((volumes?.features ?? []) as unknown as Parameters<typeof piecesOf>[0]) : [];
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

  const pieces = useMemo(
    () => piecesOf(features, (at) => map.queryTerrainElevation(at)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick: the terrain came in
    [features, map, tick],
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
        getFillColor: (p) => deckColour(KINDS[p.kind].ink, KINDS[p.kind].opacity),
        material: false,
        pickable: true,
        // See-through: each blends over what is behind it, none hides
        // another, and the ground still hides what is under it.
        parameters: { depthWriteEnabled: false },
        ...deckSlot("lines"),
      }),
      new PathLayer<{ path: number[][]; kind: VolumePiece["kind"] }>({
        id: RIMS,
        data: pieces.flatMap((p) => p.rims.map((path) => ({ path, kind: p.kind }))),
        getPath: (r) => r.path as never,
        getColor: (r) => deckColour(KINDS[r.kind].ink, 0.85),
        getWidth: RIM_PX,
        widthUnits: "pixels",
        ...deckSlot("lines"),
      }),
    ],
    [pieces],
  );
  useDeckLayers("airspace-3d", layers);

  useGlLayer("marks", { [LABELS]: { type: "geojson", data: EMPTY } }, [LABEL_LAYER]);
  useGlData(
    LABELS,
    useMemo(() => labelsOf(features, pieces), [features, pieces]),
  );
  // The chart's own tabs, placed along each boundary on the ground,
  // hidden while the volumes are named at their tops.
  useEffect(() => {
    const shown = () => map.getLayer("sua-labels") && map.setLayoutProperty("sua-labels", "visibility", "none");
    shown();
    map.on("styledata", shown);
    return () => {
      map.off("styledata", shown);
      if (map.style && map.getLayer("sua-labels")) map.setLayoutProperty("sua-labels", "visibility", "visible");
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
