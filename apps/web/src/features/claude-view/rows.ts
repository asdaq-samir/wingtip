import type { TimelinePoint } from "../procedures/lazy";
import type { ViewPoint } from "./flightView";

const ROLE = { departure: "Departure", stop: "Stop", destination: "Destination" } as const;

/** A point of the live view as FPL's timeline marks one (TimelineMark):
 *  an airport by its fuel stop or not, a waypoint grey; the view has no
 *  field's weather, so no flight category's colour. */
export function markOf(point: ViewPoint, index: number): TimelinePoint {
  return {
    ident: point.ident,
    role: ROLE[point.role],
    index,
    seen: 0,
    visit: undefined,
    time: null,
    category: null,
    problem: null,
    caution: null,
    legCaution: null,
    checking: false,
    fuelStop: point.fuel_stop,
    field: point.field,
  };
}
