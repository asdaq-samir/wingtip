import { useQuery } from "@tanstack/react-query";
import { ImageInterpolation, ImageType, getRasterPoints, loadTextureData, type TextureData } from "weatherlayers-gl";
import type { ShownField } from "./flowLook";
import { pictureUrl, type FlowFrame, type FlowLayer } from "./useWeatherFlow";

/** A frame's picture of a field as a query: loaded once by weatherlayers-gl's
 *  own loader (its pixels, which the layers and the bubble read), kept
 *  while the frame's runs are the same. */
export const pictureQuery = (frame: FlowFrame, field: ShownField | "wind") => ({
  queryKey: ["weatherFlowPicture", frame.id, field, frame.gfs_run, frame.hrrr_run],
  queryFn: () => loadTextureData(pictureUrl(frame, field), { cache: false }),
  staleTime: Infinity,
});

/** The picture of `field` for `frame`, once it has loaded. */
export function useFlowTexture(frame: FlowFrame | null, field: ShownField | "wind", enabled = true) {
  return useQuery({
    ...(frame
      ? pictureQuery(frame, field)
      : { queryKey: ["weatherFlowPicture", null], queryFn: () => Promise.reject(new Error("no frame")) }),
    enabled: enabled && !!frame && frame.fields.includes(field),
    meta: { silent: true },
  }).data;
}

/** A picture's value at a point: weatherlayers-gl's own reading of it
 *  (its direction, for the wind, the one it blows from). */
export function valueAt(layer: FlowLayer, field: ShownField | "wind", texture: TextureData | undefined, point: [number, number]) {
  const spec = layer.fields[field];
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
