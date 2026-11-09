import type { FillExtrusionLayerSpecification, GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { useEffect, useState } from "react";
import { EMPTY, slotId } from "../../../../lib/map/gl/glLayer";

/** A layer of fill-extrusions with a GeoJSON source of its own, `id` both,
 *  added under the map's marks while mounted. */
export function useExtrusion(map: MlMap, id: string, layer: Omit<FillExtrusionLayerSpecification, "id" | "source">) {
  // Read once, as useGlLayer's are.
  const [spec] = useState(layer);
  useEffect(() => {
    map.addSource(id, { type: "geojson", data: EMPTY });
    map.addLayer({ ...spec, id, source: id } as FillExtrusionLayerSpecification, slotId("marks"));
    return () => {
      if (!map.style) return;
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    };
  }, [map, id, spec]);
}

export function setExtrusionData(map: MlMap, id: string, data: GeoJSON.GeoJSON) {
  map.getSource<GeoJSONSource>(id)?.setData(data);
}
