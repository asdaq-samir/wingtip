import { useEffect, useRef } from "react";
import type { ExpressionSpecification, Map as MlMap } from "maplibre-gl";
import { isParked } from "./glLayer";

/** The map's global state that says a map keeps its rings to the fields it
 *  draws (usePlacedFieldRings is on): a map that never sets it (the training
 *  map) draws every ring. Set once a map, so its one lay-out is the mount's. */
export const RINGS_BY_FIELD = "ringsByField";

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

/** How long a map handed to the next tree (isParked) keeps its rings to
 *  its fields for that tree to take up, before they are every ring again. */
const HANDOVER_MS = 1000;
/** The maps keeping their rings to their fields now, by how many do, and
 *  the idents each set placed at its last rest (kept through a handover,
 *  as the states are). */
const keeping = new WeakMap<MlMap, number>();
const placedOn = new WeakMap<MlMap, Set<string>>();

/** Keeps each Class C and D ring's PLACED state to what the map drew at its
 *  last rest: the placed symbols of `layers` (queryRenderedFeatures returns
 *  only the symbols that won their place) and the fields among `own` (ICAO
 *  or FAA idents, the route's and the stops') in `fields`' airports. Only
 *  the idents whose state changes since the last rest are set, from the
 *  placed set alone: a ring with no state is not drawn, so the rings
 *  themselves are never looked through (a querySourceFeatures over every
 *  C and D polygon of the tiles at each rest). The route's idents are read
 *  at each rest, so a route's edit sets no global state; nor does a map
 *  handed to the next tree, which keeps RINGS_BY_FIELD for it: each change
 *  of it lays every overlay tile out again. */
export function usePlacedFieldRings(map: MlMap, rings: string, fields: string, layers: string[], own: string[]) {
  const ownKey = own.join();
  const ownRef = useRef(ownKey);
  const writeRef = useRef<() => void>(() => {});
  useEffect(() => {
    ownRef.current = ownKey;
    writeRef.current();
  }, [ownKey]);
  useEffect(() => {
    const write = () => {
      if (!map.style || !map.getSource(rings) || !layers.every((id) => map.getLayer(id))) return;
      const placed = new Set<string>();
      for (const f of map.queryRenderedFeatures({ layers })) placed.add(String(f.properties.faa_id ?? ""));
      const idents = ownRef.current ? ownRef.current.split(",") : [];
      if (idents.length && map.getSource(fields))
        for (const f of map.querySourceFeatures(fields, { sourceLayer: "airports", filter: ["in", ["get", "ident"], ["literal", idents]] }))
          placed.add(String(f.properties.faa_id ?? ""));
      placed.delete("");
      const state = (ident: string, on: boolean) =>
        map.setFeatureState({ source: rings, sourceLayer: "airspace", id: ident }, { [PLACED]: on });
      const last = placedOn.get(map) ?? new Set<string>();
      for (const ident of placed) if (!last.has(ident)) state(ident, true);
      for (const ident of last) if (!placed.has(ident)) state(ident, false);
      placedOn.set(map, placed);
    };
    writeRef.current = write;
    keeping.set(map, (keeping.get(map) ?? 0) + 1);
    if (map.style) map.setGlobalStateProperty(RINGS_BY_FIELD, true);
    map.on("idle", write);
    write();
    return () => {
      writeRef.current = () => {};
      map.off("idle", write);
      keeping.set(map, (keeping.get(map) ?? 1) - 1);
      const letGo = () => {
        if (!map.style || keeping.get(map)) return;
        placedOn.delete(map);
        map.setGlobalStateProperty(RINGS_BY_FIELD, null);
        if (map.getSource(rings)) map.removeFeatureState({ source: rings, sourceLayer: "airspace" });
      };
      // A map being handed over keeps them a moment for the next tree's own.
      if (isParked(map)) setTimeout(letGo, HANDOVER_MS);
      else letGo();
    };
  }, [map, rings, fields, layers]);
}
