import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { AirspaceVolume } from "../../../api/types";
import { usePreferences } from "../../../preferences";
import { AirspaceCardBody } from "../../AirspaceCard";
import { airspaceQuery } from "../../airspaceQuery";
import { addSvgImages, useGlData, useGlLayer, useGlMap, useGlTap } from "../glLayer";
import { AIRSPACE_TAB_PICTURE, volumeOfTile } from "../glOverlays";
import { AIRSPACE_LINE_LAYERS, AIRSPACE_SOURCE, airspaceFeatures, airspaceLayers, airspaceText } from "../glStyle";
import { useGlView } from "../useGlView";
import { useGlProbe } from "../useGlProbe";
import { GL_FONT_BOLD, TAP } from "./common";

const SOURCES = { [AIRSPACE_SOURCE]: { type: "geojson" as const, data: { type: "FeatureCollection" as const, features: [] }, tolerance: 0.5 } };
const LAYERS = airspaceLayers(GL_FONT_BOLD);
const NONE: AirspaceVolume[] = [];

/**
 * The Class B, C and D over the chart, each volume's lines and its
 * altitudes along them in a dark tab -- MapLibre's line layers and
 * line-placed labels, kept off each other by its collision. A tap on a
 * line opens the volume's card. The settings' Airspace turns them off.
 *
 * From the cycle's overlay tiles where the map has them (glOverlays,
 * drawn per tile in its first style): a tap's card is built from the
 * tapped ring's own fields (volumeOfTile). Without them, the planner is
 * asked for the view and a screen round it (airspaceQuery), as before.
 */
export function AirspaceGl() {
  const { overlays } = useGlMap();
  return overlays ? <TileAirspace /> : <InViewAirspace />;
}

/** The overlay tiles' rings: the probes and the taps. */
function TileAirspace() {
  const { openCard } = useGlMap();
  useGlProbe("airspace-lines", AIRSPACE_LINE_LAYERS, f => ({ id: `tile-${f.properties.number}`, cls: f.properties.class }));
  useGlProbe("airspace-edge-labels", ["airspace-labels"], f => ({
    id: `tile-${f.properties.number}`, text: airspaceText(volumeOfTile(f, { lat: 0, lon: 0 })),
  }));
  useGlTap(AIRSPACE_LINE_LAYERS, TAP.line, TAP.rank.line, (feature, event) => {
    const volume = volumeOfTile(feature, { lat: event.lngLat.lat, lon: event.lngLat.lng });
    openCard(<AirspaceCardBody key={volume.id} volume={volume} close={() => openCard(null)} />);
  });
  return null;
}

/** The volumes asked for the view (no overlay tiles), as AirspaceLayer
 *  asks them on the Leaflet map, its cache shared. */
function InViewAirspace() {
  const show = usePreferences(s => s.airspace);
  const { box, level } = useGlView();
  const query = useMemo(() => airspaceQuery(box, level, show), [box, level, show]);
  const { data } = useQuery({ ...query, placeholderData: keepPreviousData });
  const volumes = query.enabled ? data ?? NONE : NONE;
  useGlLayer("lines", SOURCES, LAYERS);
  const { map } = useGlMap();
  // The tab's picture first, then the lines that wear it.
  const [ready, setReady] = useState(false);
  useEffect(() => { void addSvgImages(map, [AIRSPACE_TAB_PICTURE]).then(() => setReady(true)); }, [map]);
  const features = useMemo(() => (ready ? airspaceFeatures(volumes) : null), [ready, volumes]);
  useGlData(AIRSPACE_SOURCE, features);
  // What is drawn, for the specs and the load log (AirspaceLinesCanvas' and
  // AirspaceLabelsCanvas' records were these).
  useGlProbe("airspace-lines", AIRSPACE_LINE_LAYERS, f => ({ id: f.properties.id, cls: f.properties.cls }));
  useGlProbe("airspace-edge-labels", ["airspace-labels"], f => ({ id: f.properties.id, text: f.properties.label }));
  const byId = useMemo(() => new Map(volumes.map(v => [v.id, v])), [volumes]);
  const { openCard } = useGlMap();
  useGlTap(AIRSPACE_LINE_LAYERS, TAP.line, TAP.rank.line, feature => {
    const volume = byId.get(String(feature.properties.id));
    if (volume) openCard(<AirspaceCardBody key={volume.id} volume={volume} close={() => openCard(null)} />);
  });
  return null;
}
