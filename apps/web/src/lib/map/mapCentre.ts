import { useEffect } from "react";
import { create } from "zustand";
import { useGlMap } from "./gl/glLayer";

/**
 * The map's middle at rest, for what is asked of the place the pilot is
 * looking at where there is no position: the search page's Nearest strip
 * (usePlanSearch), which with no position showed only "Show my position"
 * (the UI audit's C9, 2026-11-17), lists the fields nearest it, as Apple
 * Maps' search lists what is near the map without a location. Set as the
 * camera comes to rest (MapCentreGl), on the nearest question's own grid
 * (queryClient's nearestQuery, a twentieth of a degree), so a pan within it
 * asks nothing new; null until the map has one.
 */
export const useMapCentre = create<{ lat: number; lon: number } | null>(() => null);

/** A twentieth of a degree, the nearest question's grid. */
const onGrid = (n: number) => Math.round(n * 20) / 20;

/** Keeps useMapCentre as the map comes to rest; drawn inside the map. */
export function MapCentreGl() {
  const { map } = useGlMap();
  useEffect(() => {
    const keep = () => {
      const { lat, lng } = map.getCenter().wrap();
      const was = useMapCentre.getState();
      const next = { lat: onGrid(lat), lon: onGrid(lng) };
      if (!was || was.lat !== next.lat || was.lon !== next.lon) useMapCentre.setState(next, true);
    };
    keep();
    map.on("moveend", keep);
    return () => {
      map.off("moveend", keep);
    };
  }, [map]);
  return null;
}
