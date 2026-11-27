import { useEffect } from "react";
import type { ExpressionSpecification, Map as MlMap } from "maplibre-gl";

/** The map's global state that says a map keeps its rings to the fields it
 *  draws (usePlacedFieldRings is on): a map that never sets it (the training
 *  map) draws every ring. Set once a map, so its one lay-out is the mount's. */
const RINGS_BY_FIELD = "ringsByField";

/** Each ring's feature state (the overlay source's `airspace` ids are their
 *  `ident`, glOverlays): whether its primary field is drawn now. */
const PLACED = "placed";

/** A Class C's or D's ring's opacity, drawn only where its primary field is
 *  drawn (the airspace's `ident`, NASR's IDENT, the field's ARPT_ID), so no
 *  ring stands bare where its field gave way to a bigger one (the owner's
 *  iPhone recording, 2026-11-23: dozens of unnamed magenta rings at zoom 5
 *  and 6). An opacity by feature state, not a filter by the map's global
 *  state: a filter's change laid every overlay tile out again at each rest
 *  of the map, the airspace, airports, fixes and runways with it (the map
 *  speed audit, 2026-11-27); a state's change repaints only. Not times the
 *  Dimmer: the rings are dimmed by their colour (glStyle), as an opacity by
 *  feature times its global state relaid the tiles at each of its steps. */
export function ringOfPlacedField(opacity: number): ExpressionSpecification {
  return [
    "case",
    ["!", ["boolean", ["global-state", RINGS_BY_FIELD], false]],
    opacity,
    ["boolean", ["feature-state", PLACED], false],
    opacity,
    0,
  ];
}

/** Keeps each Class C and D ring's PLACED state to what the map drew at its
 *  last rest: the placed symbols of `layers` (queryRenderedFeatures returns
 *  only the symbols that won their place) and the fields among `own` (ICAO
 *  or FAA idents, the route's and the stops') in `fields`' airports. Only
 *  the rings whose state changes are set. */
export function usePlacedFieldRings(map: MlMap, rings: string, fields: string, layers: string[], own: string[]) {
  const ownKey = own.join();
  useEffect(() => {
    const last = new Map<string, boolean>();
    const write = () => {
      if (!map.style || !map.getSource(rings) || !layers.every((id) => map.getLayer(id))) return;
      const placed = new Set<string>();
      for (const f of map.queryRenderedFeatures({ layers })) placed.add(String(f.properties.faa_id ?? ""));
      const idents = ownKey ? ownKey.split(",") : [];
      if (idents.length && map.getSource(fields))
        for (const f of map.querySourceFeatures(fields, { sourceLayer: "airports", filter: ["in", ["get", "ident"], ["literal", idents]] }))
          placed.add(String(f.properties.faa_id ?? ""));
      const ringed = map.querySourceFeatures(rings, { sourceLayer: "airspace", filter: ["in", ["get", "class"], ["literal", ["C", "D"]]] });
      for (const ident of new Set(ringed.map((f) => String(f.properties.ident ?? "")))) {
        const on = placed.has(ident);
        if (!ident || last.get(ident) === on) continue;
        last.set(ident, on);
        map.setFeatureState({ source: rings, sourceLayer: "airspace", id: ident }, { [PLACED]: on });
      }
    };
    if (map.style) map.setGlobalStateProperty(RINGS_BY_FIELD, true);
    map.on("idle", write);
    write();
    return () => {
      map.off("idle", write);
      if (!map.style) return;
      map.setGlobalStateProperty(RINGS_BY_FIELD, null);
      if (map.getSource(rings)) map.removeFeatureState({ source: rings, sourceLayer: "airspace" });
    };
  }, [map, rings, fields, layers, ownKey]);
}
