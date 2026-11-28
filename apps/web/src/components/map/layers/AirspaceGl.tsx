import { useEffect } from "react";
import type { GeoJSONSource, LineLayerSpecification, MapSourceDataEvent, Map as MlMap } from "maplibre-gl";
import { AirspaceCardBody } from "../cards/AirspaceCard";
import { SheetCard } from "../../SheetCard";
import { useMarkKey } from "../../../lib/address";
import { MapCard } from "../../../lib/map/cards/MapCard";
import { EMPTY, drawnWithData, useGlLayer, useGlMap, useGlTap } from "../../../lib/map/gl/glLayer";
import { OVERLAY_SOURCE } from "../../../lib/map/gl/glOverlays";
import { volumeOfTile } from "../../../lib/map/gl/glTileFeatures";
import { AIRSPACE_LINE_LAYERS } from "../../../lib/map/gl/glStyle";
import { useGlProbe } from "../../../lib/map/gl/useGlProbe";
import { useLinkedTileFeature } from "../../../lib/map/gl/useLinkedTileFeature";
import { litEdge } from "../../../lib/map/gl/tileEdge";
import { TAP } from "../../../lib/map/gl/layers/common";
import { pickOnMap, useMapPickOwner, useMapRing } from "../../../lib/map/mapPick";
import { CHART } from "../../../lib/tokens";

/** The lit edge's own source: the volume picked, its edge from the tiles'
 *  pieces of it (tileEdge), so a pick sets this small source's data and
 *  lays out none of the overlay tiles again, as a filter on their layer
 *  did at each card's opening and closing (the map audit, round 6, N1). */
const PICKED_SOURCE = "airspace-picked";

/** The volume whose card is open, its edge again, wide, in the selection's
 *  yellow over its own ink, as a TFR picked is lit (the owner, 2026-11-18:
 *  an area picked lights its edge); none lit till one is. */
const PICKED: LineLayerSpecification = {
  id: "airspace-picked",
  type: "line",
  source: PICKED_SOURCE,
  layout: { "line-join": "round" },
  paint: { "line-color": CHART.selected, "line-width": 5, "line-opacity": 0.9 },
};

/** The lit volume's edge on its own source, from the tiles about the
 *  view: again after a move or an overlay tile come in, at the next rest;
 *  empty once none is lit. */
function useLitEdge(map: MlMap, lit: string | null) {
  const number = lit?.startsWith("tile-") ? lit.slice("tile-".length) : null;
  useEffect(() => {
    const show = (edge: GeoJSON.Feature | null) => {
      if (!map.style) return;
      const data = edge ? { type: "FeatureCollection" as const, features: [edge] } : EMPTY;
      map.getSource<GeoJSONSource>(PICKED_SOURCE)?.setData(data);
      drawnWithData(map, PICKED_SOURCE, data);
    };
    if (!number) return show(null);
    let again = false;
    let last: string | null = null;
    const look = () => {
      const found = map.getSource(OVERLAY_SOURCE) ? litEdge(map, OVERLAY_SOURCE, number, last) : { key: null, edge: null };
      if (found === "drawn") return;
      last = found.key;
      show(found.edge);
    };
    const moved = () => {
      again = true;
    };
    const tiled = (e: MapSourceDataEvent) => {
      if (e.tile && e.sourceId === OVERLAY_SOURCE) again = true;
    };
    const rest = () => {
      if (!again) return;
      again = false;
      look();
    };
    look();
    map.on("moveend", moved);
    map.on("sourcedata", tiled);
    map.on("idle", rest);
    return () => {
      map.off("moveend", moved);
      map.off("sourcedata", tiled);
      map.off("idle", rest);
    };
  }, [map, number]);
}

/**
 * The Class B, C and D over the chart, each volume's line with a
 * translucent band along its inside and its altitudes in a dark tab on
 * its ring, one a shelf -- MapLibre's line layers and a symbol layer,
 * kept off each other by its collision; and the special-use areas'
 * lines and hatched bands (design/map-style.json's). A tap on a
 * line opens the volume's card, by its address (`mark`), so a link opens
 * it too. The settings' Airspace turns them off (applyOverlayFilters).
 *
 * The lines and labels are the cycle's overlay tiles' (glOverlays, drawn
 * per tile in the map's style); this adds the probes and the taps, a
 * card built from the ring's own fields in the tiles (volumeOfTile).
 * Nothing until the map has the tiles.
 */
export function AirspaceGl() {
  const { overlays } = useGlMap();
  return overlays ? <TileAirspace /> : null;
}

function TileAirspace() {
  const { map } = useGlMap();
  const [mark, setMark] = useMarkKey();
  const asked = mark?.kind === "airspace" ? mark : null;
  useGlProbe("airspace-lines", AIRSPACE_LINE_LAYERS, (f) => ({ id: `tile-${f.properties.number}`, cls: f.properties.class }));
  useGlProbe("airspace-edge-labels", ["airspace-labels"], (f) => ({
    id: `tile-${f.properties.number}`,
    text: f.properties.tab,
    angle: Number(f.properties.angle ?? 0),
  }));
  useGlTap(AIRSPACE_LINE_LAYERS, TAP.line, TAP.rank.line, (feature, event) => {
    const number = feature.properties.number;
    if (number == null) return;
    // Every other card and ring put away first (lib/map/mapPick).
    pickOnMap("mark");
    void setMark({ kind: "airspace", ident: String(number), lat: event.lngLat.lat, lon: event.lngLat.lng });
  });
  // The volume an address names, from the tiles about where it was tapped.
  const volume = useLinkedTileFeature(map, asked && { key: `${asked.ident}@${asked.lat},${asked.lon}`, ...asked }, () => {
    if (!asked) return null;
    const found = map
      .querySourceFeatures(OVERLAY_SOURCE, { sourceLayer: "airspace" })
      .find((f) => String(f.properties.number) === asked.ident);
    return found ? volumeOfTile(found) : null;
  });
  // Its edge lit while its card is up (AirspaceCardBody's useAreaWhileUp),
  // whichever map opened it.
  useGlLayer("lines", { [PICKED_SOURCE]: { type: "geojson", data: EMPTY } }, [PICKED]);
  const lit = useMapRing((s) => (s.area?.kind === "airspace" ? s.area.id : null));
  useLitEdge(map, lit);
  useGlProbe("airspace-picked", [PICKED.id], (f) => ({ id: `tile-${f.properties.number}` }));
  const close = () => void setMark(null);
  useMapPickOwner("mark", !!asked, close);
  if (!asked || volume === undefined) return null;
  return (
    <SheetCard onClose={close}>
      {volume ? (
        <AirspaceCardBody key={volume.id} volume={volume} at={asked} />
      ) : (
        <MapCard title={`Airspace ${asked.ident}`} subtitle="Not in this cycle's chart data" />
      )}
    </SheetCard>
  );
}
