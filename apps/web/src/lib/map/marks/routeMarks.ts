import type { AirspaceClass } from "../../preferences";
import { AIRPORT_MARK, airportMarkSvg, text } from "./airportMark";
import { divIcon, made } from "./icons";

/**
 * The route's own airports -- its departure, stops and destination -- as
 * ForeFlight marks a route's fields (the owner's screenshot of its
 * selected course, 2026-11-08): the field's mark as every airport on the
 * chart wears it (airportMarkSvg), and its ident beside it in white bold
 * on a dark rounded pill, which reads over the sectional's paper, its
 * cities' yellow and the course's own magenta and green alike, by day,
 * at night and in sunlight. The chart's other fields keep their ident on
 * a white halo (airportMarkIcon): the pill says this one is the route's.
 */
export const routeFieldIcon = made(function routeFieldIcon(ident: string, space: AirspaceClass | null, weather: string) {
  const half = AIRPORT_MARK / 2;
  return divIcon({
    className: "",
    iconSize: [AIRPORT_MARK, AIRPORT_MARK],
    iconAnchor: [half, half],
    html:
      airportMarkSvg(space, weather, null, "absolute inset-0 overflow-visible drop-shadow-sm drop-shadow-black/35") +
      `<span data-route-field="${text(ident)}" class="absolute top-1/2 left-[calc(100%+2px)] -translate-y-1/2 whitespace-nowrap rounded-sm bg-(--chart-tag)/88 px-1.25 py-0.75 text-xs leading-none font-bold tracking-[0.02em] text-white shadow-(--depth-mark) ring-1 ring-white/25">${text(ident)}</span>`,
  });
});
