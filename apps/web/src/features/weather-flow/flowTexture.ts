import { useQuery } from "@tanstack/react-query";
import { ImageInterpolation, ImageType, getRasterPoints, loadTextureData, type TextureData } from "weatherlayers-gl";
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

/** A picture's value at a point: weatherlayers-gl's own reading of it
 *  (its direction, for the wind, the one it blows from). `file` is the
 *  picture's name, its encoding its field's ("temp-060" is a "temp"). */
export function valueAt(layer: FlowLayer, file: string, texture: TextureData | undefined, point: [number, number]) {
  const spec = layer.fields[file.split("-")[0]!];
  if (!texture || !spec) return null;
  const read = getRasterPoints(
    {
      image: texture,
      image2: null,
      imageSmoothing: 0,
      imageInterpolation: ImageInterpolation.LINEAR,
      imageWeight: 0,
      imageType: spec.vector ? ImageType.VECTOR : ImageType.SCALAR,
      imageUnscale: spec.unscale as [number, number],
      imageMinValue: null,
      imageMaxValue: null,
    },
    layer.bounds as GeoJSON.BBox,
    [point],
  ).features[0]?.properties;
  return read && Number.isFinite(read.value) ? read : null;
}
