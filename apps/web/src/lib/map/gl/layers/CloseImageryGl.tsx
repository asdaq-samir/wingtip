import { useEffect } from "react";
import { useGlLayer, useGlMap, useGlPaint } from "../glLayer";
import { imageryFade, imageryFrom } from "../closeZoom";

/** Google's satellite tiles go to their {z} 20 over the United States. */
const IMAGERY_MAX = 20;

/** The imagery's layer, under the chart (`under`, its lowest layer) and
 *  over the land and water, fading in as the chart fades out; dimmed at
 *  night as the chart is (glStyle's chartPaint). */
export function CloseImageryGl({ url, tileMaxZoom, night, under }: { url: string; tileMaxZoom: number; night: boolean; under: string }) {
  const { map } = useGlMap();
  useGlLayer(
    "chart",
    { "close-imagery": { type: "raster", tiles: [url], tileSize: 256, maxzoom: IMAGERY_MAX } },
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
    el.dataset.closeBase = "google";
    return () => {
      delete el.dataset.closeBase;
    };
  }, [map]);
  return null;
}
