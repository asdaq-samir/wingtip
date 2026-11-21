import { useMemo } from "react";
import type { SymbolLayerSpecification } from "maplibre-gl";
import { labelText } from "../../lib/map/gl/layers/common";
import { useGlSymbols, type GlSymbol } from "../../lib/map/gl/useGlSymbols";
import { framed } from "../../lib/map/marks/markPictures";
import { useOwnShipNear } from "../../lib/map/position/ownShip";
import { usePreferences } from "../../lib/preferences";
import { CHART, MAP_LABEL } from "../../lib/tokens";
import { useFlowTexture, valueAt } from "./flowTexture";
import type { FlowFrame, FlowLayer } from "./useWeatherFlow";

const SOURCE = "flow-pins";

/** A small white pill stretched to its figure (FlowBubble's FlowPill, as
 *  the map draws it), with the marks' shadow. */
const PILL = framed("flow-pin", () => `<rect width="28" height="28" rx="14" fill="${CHART.casing}"/>`, 28, 28, {
  inset: 13,
  content: [10, 6, 18, 22],
});

/** Its words this far above the point, ems: the pill's foot 14 points over
 *  it, where the HTML pin sat, clear of own ship's arrow. */
const LIFT_EM = -(14 + 6) / MAP_LABEL.kind.flowPin.size;

const LAYERS: SymbolLayerSpecification[] = [
  {
    id: "flow-pins",
    type: "symbol",
    source: SOURCE,
    layout: {
      "icon-image": ["get", "icon"],
      "icon-text-fit": "both",
      "text-field": ["get", "text"],
      ...labelText("flowPin"),
      "text-anchor": "bottom",
      "text-offset": [0, LIFT_EM],
      "text-allow-overlap": true,
      "icon-allow-overlap": true,
    },
    paint: { "text-color": CHART.fixInk },
  },
];

/**
 * The temperature at the pilot's own position and at each of their
 * favourite airports, a small white pill each, as Apple Weather's
 * temperature map marks My Location and the saved places (the owner's
 * screenshot, 2026-11-12). Read from the picture the layer already has
 * (valueAt, as the bubble reads it), so no more is fetched; own ship's
 * position as the page has it near (useOwnShipNear, a hundredth of a
 * degree), so a moving fix does not draw them again each second. A
 * symbol layer of the map's (CLAUDE.md: no HTML marker but own ship's),
 * where each was a DOM marker moved at every frame of a pan.
 */
export function FlowPins({ layer, frame, file = "temp" }: { layer: FlowLayer; frame: FlowFrame | null; file?: string }) {
  const own = useOwnShipNear();
  const favorites = usePreferences((s) => s.favoriteAirports);
  const texture = useFlowTexture(frame, file);
  const pins = useMemo<GlSymbol[]>(() => {
    const at: { key: string; lon: number; lat: number }[] = [];
    if (own) at.push({ key: "own", lon: own.lon, lat: own.lat });
    for (const f of favorites) if (f.lat !== undefined && f.lon !== undefined) at.push({ key: f.ident, lon: f.lon, lat: f.lat });
    return at.map((p) => {
      const value = valueAt(layer, file, texture, [p.lon, p.lat])?.value ?? null;
      // Degrees C, the legend's unit, rounded; a dash where the model has none.
      return { ...p, picture: PILL, text: value === null ? "–" : String(Math.round(value)) };
    });
  }, [own, favorites, layer, file, texture]);
  useGlSymbols(SOURCE, LAYERS, pins);
  return null;
}
