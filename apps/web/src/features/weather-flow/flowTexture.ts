import { useQuery } from "@tanstack/react-query";
import { loadTextureData } from "weatherlayers-gl";
import type { ShownField } from "./flowLook";
import { pictureUrl, type FlowFrame } from "./useWeatherFlow";

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
