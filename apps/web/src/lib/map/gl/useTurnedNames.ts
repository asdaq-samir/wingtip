import { useEffect } from "react";
import { turnSide } from "../marks/routeTurns";
import { useGlMap } from "./glLayer";

/** A layer of names put beside their points on a side clockwise from up
 *  (the feature's `out`: a route point's name outside its turn, a top of
 *  climb's or descent's square to its course) kept on that side as the
 *  map turns: the side follows the map's bearing, in steps of 15 degrees
 *  (turnSide). */
export function useTurnedNames(layer: string) {
  const { map } = useGlMap();
  useEffect(() => {
    const turn = () => {
      if (!map.getLayer(layer)) return;
      const side = turnSide(Math.round(map.getBearing() / 15) * 15);
      // Set again only when it changes (a layer put back by a new style
      // comes back with the north-up side).
      if (JSON.stringify(map.getLayoutProperty(layer, "text-anchor")) === JSON.stringify(side["text-anchor"])) return;
      map.setLayoutProperty(layer, "text-anchor", side["text-anchor"]);
      map.setLayoutProperty(layer, "text-offset", side["text-offset"]);
    };
    turn();
    map.on("rotate", turn);
    map.on("idle", turn);
    return () => {
      map.off("rotate", turn);
      map.off("idle", turn);
    };
  }, [map, layer]);
}
