import { useEffect } from "react";
import type { ExpressionSpecification, Map as MlMap } from "maplibre-gl";

/** The map's global state holding the NASR idents (the tiles' `faa_id`) of
 *  the fields drawn on the map now: the tile airports MapLibre placed and
 *  the route's own fields and stops, which wear their own marks. */
export const PLACED_FIELDS = "placedFields";

/** A Class C's or D's ring drawn only where its primary field is drawn (the
 *  airspace's `ident`, NASR's IDENT, the field's ARPT_ID), so no ring
 *  stands bare where its field gave way to a bigger one (the owner's iPhone
 *  recording, 2026-11-23: dozens of unnamed magenta rings at zoom 5 and 6).
 *  A map that sets no list (the training map) draws every ring. */
export const RING_OF_PLACED_FIELD: ExpressionSpecification = [
  "any",
  ["!", ["to-boolean", ["global-state", PLACED_FIELDS]]],
  ["in", ["get", "ident"], ["coalesce", ["global-state", PLACED_FIELDS], ["literal", []]]],
];

/** Keeps PLACED_FIELDS to what the map drew at its last rest: the placed
 *  symbols of `layers` (queryRenderedFeatures returns only the symbols
 *  that won their place) and the source's fields among `own` (ICAO or FAA
 *  idents, the route's and the stops') in `source`'s airports. */
export function usePlacedFieldRings(map: MlMap, source: string, layers: string[], own: string[]) {
  const ownKey = own.join();
  useEffect(() => {
    let last = "";
    const write = () => {
      if (!map.style || !layers.every((id) => map.getLayer(id))) return;
      const placed = new Set<string>();
      for (const f of map.queryRenderedFeatures({ layers })) placed.add(String(f.properties.faa_id ?? ""));
      const idents = ownKey ? ownKey.split(",") : [];
      if (idents.length)
        for (const f of map.querySourceFeatures(source, { sourceLayer: "airports", filter: ["in", ["get", "ident"], ["literal", idents]] }))
          placed.add(String(f.properties.faa_id ?? ""));
      placed.delete("");
      const list = [...placed].sort();
      const key = list.join();
      if (key === last) return;
      last = key;
      map.setGlobalStateProperty(PLACED_FIELDS, list);
    };
    map.on("idle", write);
    write();
    return () => {
      map.off("idle", write);
      if (map.style) map.setGlobalStateProperty(PLACED_FIELDS, null);
    };
  }, [map, source, layers, ownKey]);
}
