import { useQuery } from "@tanstack/react-query";
import type { FeatureCollection, Geometry } from "geojson";
import type { FillLayerSpecification, LineLayerSpecification } from "maplibre-gl";
import { useEffect, useMemo } from "react";
import { usePreferences } from "../../../../lib/preferences";
import { useMapHover } from "../../../../lib/map/marks/mapHover";
import { CHART } from "../../../../lib/tokens";
import { tfrsQuery } from "../../../../lib/queryClient";
import { TfrCard } from "../TfrCard";
import { TFR_RED, inForce } from "../tfrMarks";
import { useGlData, useGlFadeIn, useGlLayer, useGlMap, useGlTap } from "../../../../lib/map/gl/glLayer";
import { TAP } from "../../../../lib/map/gl/layers/common";

const SOURCE = "tfrs";
// Each TFR's NOTAM number its feature's id (promoteId), for MapLibre's
// feature state to light the one under the mouse.
const SOURCES = {
  [SOURCE]: { type: "geojson" as const, data: { type: "FeatureCollection" as const, features: [] }, promoteId: "id" },
};

/** A TFR is drawn bold, a thing that changes by the day over the chart
 *  that does not: in force a solid red line over a red wash, not yet in
 *  force dashed over a fainter one. */
const FILL: FillLayerSpecification = {
  id: "tfrs-fill",
  type: "fill",
  source: SOURCE,
  filter: ["get", "active"],
  paint: { "fill-color": TFR_RED, "fill-opacity": 0.14 },
};
/** Each wash a layer of its own, its opacity a constant: one that differs
 *  by feature MapLibre will not fade in (useGlFadeIn). */
const FILL_LATER: FillLayerSpecification = {
  id: "tfrs-fill-later",
  type: "fill",
  source: SOURCE,
  filter: ["!", ["get", "active"]],
  paint: { "fill-color": TFR_RED, "fill-opacity": 0.06 },
};
const LAYERS = [FILL, FILL_LATER];
const LINE: LineLayerSpecification = {
  id: "tfrs-line",
  type: "line",
  source: SOURCE,
  filter: ["get", "active"],
  layout: { "line-join": "round" },
  paint: { "line-color": TFR_RED, "line-width": 2.5 },
};
const LINE_LATER: LineLayerSpecification = {
  id: "tfrs-line-later",
  type: "line",
  source: SOURCE,
  filter: ["!", ["get", "active"]],
  paint: { "line-color": TFR_RED, "line-width": 2, "line-dasharray": [3, 2.5] },
};
const ALL = [...LAYERS, LINE, LINE_LATER];

/** The TFR a mouse rests on in the Brief (lib/map/marks/mapHover): its
 *  edge again, wide, in the selection's yellow over its red, drawn where
 *  its feature state says it is hovered. */
const HOVER: LineLayerSpecification = {
  id: "tfr-hover-line",
  type: "line",
  source: SOURCE,
  layout: { "line-join": "round" },
  paint: {
    "line-color": CHART.selected,
    "line-width": 5,
    "line-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.9, 0],
  },
};
const DRAWN = [...ALL, HOVER];

/**
 * The temporary flight restrictions (tfrsQuery), at the settings' TFRs:
 * each area a fill and its edge, all of them in one source rather than a
 * shape each. A tap inside one opens its card.
 */
export function TfrGl() {
  const show = usePreferences((s) => s.tfrs);
  const { data, dataUpdatedAt: now } = useQuery({ ...tfrsQuery, enabled: show });
  useGlLayer("areas", SOURCES, DRAWN);
  // Faded in as the first answer comes, not snapped on over the chart.
  useGlFadeIn(ALL, !!data);
  const features = useMemo<FeatureCollection | null>(
    () =>
      show && data
        ? {
            type: "FeatureCollection",
            features: data.map((tfr) => ({
              type: "Feature",
              properties: { id: tfr.notam_id, active: inForce(tfr, now) },
              geometry: tfr.geometry as unknown as Geometry,
            })),
          }
        : null,
    [show, data, now],
  );
  useGlData(SOURCE, features);
  // The one under the mouse in the Brief, lit by its feature state; none
  // on a touch screen.
  const { map, openCard } = useGlMap();
  const hovered = useMapHover((s) => s.tfr);
  useEffect(() => {
    if (!hovered || !map.getSource(SOURCE)) return;
    const feature = { source: SOURCE, id: hovered };
    map.setFeatureState(feature, { hover: true });
    return () => {
      if (map.style && map.getSource(SOURCE)) map.setFeatureState(feature, { hover: false });
    };
  }, [map, hovered, features]);
  useGlTap(["tfrs-fill", "tfrs-fill-later"], 1, TAP.rank.area, (feature) => {
    const tfr = data?.find((t) => t.notam_id === feature.properties.id);
    if (tfr) openCard(<TfrCard key={tfr.notam_id} tfr={tfr} active={inForce(tfr, now)} />);
  });
  return null;
}
