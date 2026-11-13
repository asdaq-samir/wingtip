import { useEffect, useState } from "react";
import type { FillLayerSpecification } from "maplibre-gl";
import { drawSvg, useGlLayer, useGlMap } from "../../lib/map/gl/glLayer";
import { WEATHER } from "../../lib/tokens";

const IMAGE = "flow-hatch";
/** Mercator's edge: MapLibre draws nothing nearer the poles. */
const EDGE_LAT = 85;

/** Thin diagonal lines, one every eight pixels, tiled. */
const HATCH_SVG = `<svg width="8" height="8" viewBox="0 0 8 8"><path d="M-2 2 L2 -2 M0 8 L8 0 M6 10 L10 6" stroke="${WEATHER.flowHatch}" stroke-width="0.8" stroke-opacity="0.7"/></svg>`;

/**
 * Where the flow layer has no data -- the world outside the model's box --
 * hatched with thin diagonal lines, as Apple Weather's precipitation map
 * marks what its data does not reach (the owner's screenshot,
 * 2026-11-11), so an empty sky there is not read as a clear one.
 */
export function FlowHatch({ bounds }: { bounds: number[] }) {
  const { map } = useGlMap();
  const [ready, setReady] = useState(() => map.hasImage(IMAGE));
  useEffect(() => {
    if (ready) return;
    let gone = false;
    void drawSvg(HATCH_SVG).then((drawn) => {
      if (gone || !drawn || !map.style) return;
      if (!map.hasImage(IMAGE)) map.addImage(IMAGE, drawn.image, { pixelRatio: drawn.options.pixelRatio });
      setReady(true);
    });
    return () => {
      gone = true;
    };
  }, [map, ready]);
  return ready ? <Hatch bounds={bounds} /> : null;
}

function Hatch({ bounds }: { bounds: number[] }) {
  const [west = -180, south = -EDGE_LAT, east = 180, north = EDGE_LAT] = bounds.map((v, i) =>
    i % 2 ? Math.max(-EDGE_LAT, Math.min(EDGE_LAT, v)) : Math.max(-180, Math.min(180, v)),
  );
  const world: GeoJSON.Feature = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-180, -EDGE_LAT],
          [180, -EDGE_LAT],
          [180, EDGE_LAT],
          [-180, EDGE_LAT],
          [-180, -EDGE_LAT],
        ],
        [
          [west, south],
          [west, north],
          [east, north],
          [east, south],
          [west, south],
        ],
      ],
    },
  };
  const layer: FillLayerSpecification = { id: IMAGE, type: "fill", source: IMAGE, paint: { "fill-pattern": IMAGE } };
  useGlLayer("areas", { [IMAGE]: { type: "geojson", data: world } }, [layer]);
  return null;
}
