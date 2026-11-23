import { useEffect } from "react";
import { turnSide } from "../marks/routeTurns";
import { useGlMap } from "./glLayer";
import type { Layout } from "./markLayers";

/** A layer of names put beside their points on a side clockwise from up
 *  (the feature's `out`: a route point's name outside its turn, a top of
 *  climb's or descent's square to its course) kept on that side as the
 *  map turns: the side follows the map's bearing, in steps of 15 degrees
 *  (turnSide, or `sides` for a layer placed another way: a route field's
 *  ident, routeMarks' fieldSides). */
export function useTurnedNames(layer: string, sides: (bearing: number) => Layout = turnSide) {
  const { map } = useGlMap();
  useEffect(() => {
    const turn = () => {
      if (!map.getLayer(layer)) return;
      const side = sides(Math.round(map.getBearing() / 15) * 15);
      // Set again only when it changes (a layer put back by a new style
      // comes back with the north-up side).
      for (const [name, value] of Object.entries(side) as [keyof Layout, unknown][]) {
        if (JSON.stringify(map.getLayoutProperty(layer, name)) === JSON.stringify(value)) continue;
        map.setLayoutProperty(layer, name, value as never);
      }
    };
    turn();
    map.on("rotate", turn);
    map.on("idle", turn);
    return () => {
      map.off("rotate", turn);
      map.off("idle", turn);
    };
  }, [map, layer, sides]);
}
