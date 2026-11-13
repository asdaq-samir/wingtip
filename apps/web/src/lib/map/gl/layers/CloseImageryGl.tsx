import { useEffect } from "react";
import { useGlLayer, useGlMap, useGlPaint } from "../glLayer";
import { imageryFade, imageryFrom } from "../closeZoom";
import type { CloseTiles } from "../useCloseImagery";

/** The imagery's layer (useCloseImagery's tiles), under the chart
 *  (`under`, its lowest layer) and over the land and water, fading in as
 *  the chart fades out; dimmed at night as the chart is (glStyle's
 *  chartPaint). A stock MapLibre raster source and layer, enlarged by
 *  MapLibre past its tiles' last level; in 3D it lies on the ground as
 *  every raster layer of the chart's slot does (TerrainGl). */
export function CloseImageryGl({
  tiles,
  tileMaxZoom,
  night,
  under,
}: {
  tiles: CloseTiles;
  tileMaxZoom: number;
  night: boolean;
  under: string;
}) {
  const { map } = useGlMap();
  useGlLayer(
    "chart",
    { "close-imagery": { type: "raster", tiles: [tiles.url], tileSize: 256, maxzoom: tiles.maxzoom } },
    [
      {
        id: "close-imagery",
        type: "raster",
        source: "close-imagery",
        minzoom: imageryFrom(tileMaxZoom),
        paint: { "raster-fade-duration": 0, "raster-opacity": imageryFade(tileMaxZoom) },
      },
    ],
    under,
  );
  useGlPaint(["close-imagery"], { "raster-brightness-max": night ? 0.5 : 1 });
  // For the browser tests: the imagery is there to fade into.
  useEffect(() => {
    const el = map.getContainer();
    el.dataset.closeBase = tiles.kind;
    return () => {
      delete el.dataset.closeBase;
    };
  }, [map, tiles.kind]);
  return null;
}
