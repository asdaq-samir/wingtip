import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { AirspaceVolume } from "../../../api/types";
import { usePreferences } from "../../../preferences";
import { AirspaceCardBody, airspaceQuery } from "../../AirspaceCard";
import { addSvgImages, useGlData, useGlLayer, useGlMap, useGlTap } from "../glLayer";
import { AIRSPACE_LINE_LAYERS, AIRSPACE_SOURCE, AIRSPACE_TAB, airspaceFeatures, airspaceLayers } from "../glStyle";
import { useGlView } from "../useGlView";
import { useGlProbe } from "../useGlProbe";
import { GL_FONT_BOLD, TAP } from "./common";

const SOURCES = { [AIRSPACE_SOURCE]: { type: "geojson" as const, data: { type: "FeatureCollection" as const, features: [] }, tolerance: 0.5 } };
const LAYERS = airspaceLayers(GL_FONT_BOLD);
/** The dark tab an airspace's altitudes sit in, as ForeFlight's: a
 *  rounded box its corners kept as drawn, stretched to the text. */
const TAB: [string, () => string, { inset: number }] = [
  AIRSPACE_TAB,
  () => `<svg width="12" height="12" viewBox="0 0 12 12"><rect x="0.5" y="0.5" width="11" height="11" rx="3" fill="#1c2330" fill-opacity="0.9" stroke="#fff" stroke-width="1"/></svg>`,
  { inset: 4 },
];
const NONE: AirspaceVolume[] = [];

/**
 * The Class B, C and D over the chart, as AirspaceLayer draws them on the
 * Leaflet map: the same question to the planner for the view and a
 * screen round it (airspaceQuery, its cache shared), each volume's lines
 * and its altitudes along them -- here MapLibre's line layers and
 * line-placed labels, kept off each other by its collision, where
 * AirspaceLinesCanvas and AirspaceLabelsCanvas drew them by hand. A tap
 * on a line opens the volume's card. The settings' Airspace turns them
 * off. The GeoJSON source is the seam for the vector tiles
 * (claude/vector-tiles): the same layers on a vector source.
 */
export function AirspaceGl() {
  const show = usePreferences(s => s.airspace);
  const { box, level } = useGlView();
  const query = useMemo(() => airspaceQuery(box, level, show), [box, level, show]);
  const { data } = useQuery({ ...query, placeholderData: keepPreviousData });
  const volumes = query.enabled ? data ?? NONE : NONE;
  useGlLayer("lines", SOURCES, LAYERS);
  const { map } = useGlMap();
  // The tab's picture first, then the lines that wear it.
  const [ready, setReady] = useState(false);
  useEffect(() => { void addSvgImages(map, [TAB]).then(() => setReady(true)); }, [map]);
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
