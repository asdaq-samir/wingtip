import type { RasterLayerSpecification } from "maplibre-gl";
import { useEffect } from "react";
import type { LoopFrame } from "../../lib/api/types";
import { useGlLayer, useGlMap, useGlPaint } from "../../lib/map/gl/glLayer";
import { glZoom } from "../../lib/map/gl/glStyle";
import { PRELOAD_CAP_MS } from "./loopFrames";
import { useWeatherLoop } from "./useWeatherLoop";

/** How strongly each picture is drawn over the chart: the satellite's
 *  cloud under, the radar's echoes over, the chart read through both. */
const RADAR_OPACITY = 0.6;
const SATELLITE_OPACITY = 0.45;

/** The most detailed tiles each source has: IEM's mosaic is about a
 *  kilometre, nowCOAST's infrared two; nearer in, the last is enlarged. */
const RADAR_MAX = 10;
const SATELLITE_MAX = 9;

const RADAR_CREDIT = "Radar: NWS NEXRAD via Iowa Environmental Mesonet";
const SATELLITE_CREDIT = "Satellite: NOAA GOES via nowCOAST";

const sourceIds = (f: LoopFrame) =>
  [f.satellite_tiles && `wx-loop-sat-${f.valid}`, f.radar_tiles && `wx-loop-radar-${f.valid}`].filter((id): id is string => !!id);

/**
 * The radar and satellite loop over the chart (useWeatherLoop): every
 * frame a raster layer of its own, all added at once so each one's tiles
 * load ahead, the one shown at its opacity and the rest clear -- a swap
 * of opacities between loaded layers, which does not flicker as changing
 * one layer's tiles would. Tells the loop when the frames in view have
 * loaded, or when PRELOAD_CAP_MS has passed with some still coming.
 * The tiles straight from IEM and nowCOAST (wingtip.weather_loop).
 */
export function WeatherLoopGl() {
  const { map } = useGlMap();
  const { frames, showing, setReady } = useWeatherLoop();
  const ids = frames.flatMap(sourceIds).join(",");

  useEffect(() => {
    const wanted = ids ? ids.split(",") : [];
    if (!wanted.length) return;
    const loaded = () => wanted.every((id) => !map.getSource(id) || map.isSourceLoaded(id));
    const check = () => {
      if (loaded()) setReady(true);
    };
    const cap = setTimeout(() => setReady(true), PRELOAD_CAP_MS);
    map.on("sourcedata", check);
    map.on("idle", check);
    return () => {
      clearTimeout(cap);
      map.off("sourcedata", check);
      map.off("idle", check);
    };
  }, [map, ids, setReady]);

  return (
    <>
      {frames.map((f, i) => (
        <FrameGl key={f.valid} frame={f} shown={i === showing} />
      ))}
    </>
  );
}

/** One radar mosaic at a moment, as the loop draws its frames: a
 *  replay's weather as it was (the Studio's), its tiles IEM's for that
 *  time (wingtip.weather_loop's RADAR_TILES). */
export function RadarFrameGl({ url }: { url: string }) {
  return <Tiles id="wx-then-radar" url={url} max={RADAR_MAX} credit={RADAR_CREDIT} opacity={RADAR_OPACITY} />;
}

/** One frame's layers: the satellite's under the radar's. */
function FrameGl({ frame, shown }: { frame: LoopFrame; shown: boolean }) {
  return (
    <>
      {frame.satellite_tiles && (
        <Tiles
          id={`wx-loop-sat-${frame.valid}`}
          url={frame.satellite_tiles}
          max={SATELLITE_MAX}
          credit={SATELLITE_CREDIT}
          opacity={shown ? SATELLITE_OPACITY : 0}
        />
      )}
      {frame.radar_tiles && (
        <Tiles
          id={`wx-loop-radar-${frame.valid}`}
          url={frame.radar_tiles}
          max={RADAR_MAX}
          credit={RADAR_CREDIT}
          opacity={shown ? RADAR_OPACITY : 0}
        />
      )}
    </>
  );
}

/** A raster of one frame, shown or clear, its opacity switched at once
 *  (no transition, no tile fade) so the loop steps cleanly. */
function Tiles({ id, url, max, credit, opacity }: { id: string; url: string; max: number; credit: string; opacity: number }) {
  const source = { [id]: { type: "raster" as const, tiles: [url], tileSize: 256, maxzoom: max, attribution: credit } };
  const layer: RasterLayerSpecification = {
    id,
    type: "raster",
    source: id,
    minzoom: glZoom(3),
    paint: { "raster-opacity": opacity, "raster-opacity-transition": { duration: 0, delay: 0 }, "raster-fade-duration": 0 },
  };
  useGlLayer("areas", source, [layer]);
  useGlPaint([id], { "raster-opacity": opacity });
  return null;
}
