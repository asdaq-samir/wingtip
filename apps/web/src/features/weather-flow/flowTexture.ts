import { useQuery } from "@tanstack/react-query";
import { loadTextureData, type TextureData } from "weatherlayers-gl";
import { callEngine } from "../../lib/engine/engine";
import { pictureUrl, type FlowFrame, type FlowLayer } from "./useWeatherFlow";

/** A frame's picture of a file ("wind-060") as a query: loaded once by
 *  weatherlayers-gl's own loader (its pixels, which the layers and the
 *  bubble read), kept while its version, the run that made it, is the
 *  same. */
export const pictureQuery = (frame: FlowFrame, file: string) => ({
  queryKey: ["weatherFlowPicture", frame.id, file, frame.versions?.[file] ?? null],
  queryFn: () => loadTextureData(pictureUrl(frame, file), { cache: false }),
  staleTime: Infinity,
});

/** The picture of `field` for `frame`, once it has loaded. */
export function useFlowTexture(frame: FlowFrame | null, field: string, enabled = true) {
  return useQuery({
    ...(frame
      ? pictureQuery(frame, field)
      : { queryKey: ["weatherFlowPicture", null], queryFn: () => Promise.reject(new Error("no frame")) }),
    enabled: enabled && !!frame && frame.fields.includes(field),
    meta: { silent: true },
  }).data;
}

/** A picture's value at a point, the engine's reading of it (flow_cell
 *  and flow_sample, the one the phones' FlowGrid make too): between the
 *  four pixel middles round it, the wind from its east and north parts,
 *  its direction the one it blows from. weatherlayers-gl only loads the
 *  picture here: its own reading takes the bounds as the outer pixels'
 *  middles, half a pixel off the weather service's (flow_grid BOUNDS, the
 *  pixels' outer edges), and averages none where a pixel has none in a
 *  way the phones did not. The ceiling's picture is read as the
 *  ceiling, rounded to its 50 ft step, its top no ceiling (`noCeiling`). `file` is the picture's name, its encoding its
 *  field's ("temp-060" is a "temp"). */
export function valueAt(layer: FlowLayer, file: string, texture: TextureData | undefined, point: [number, number]) {
  const field = file.split("-")[0]!;
  const spec = layer.fields[field];
  if (!texture || !spec) return null;
  const { data, width, height } = texture;
  const cell = callEngine("flow_cell", { bounds: layer.bounds, width, height, lat: point[1], lon: point[0] });
  if (!cell) return null;
  // Each pixel's red, green and alpha: RGBA pictures, so four a pixel.
  const channels = data.length / (width * height);
  const pixel = (i: number) => [data[i * channels]!, data[i * channels + 1]!, data[i * channels + 3]!];
  const read = callEngine("flow_sample", {
    pixels: cell.pixels.map(pixel),
    fx: cell.fx,
    fy: cell.fy,
    unscale: spec.unscale,
    vector: spec.vector,
    ceiling: field === "ceiling",
  });
  return read && { value: read.value, direction: read.from_deg ?? undefined, calm: read.calm, noCeiling: read.no_ceiling };
}
