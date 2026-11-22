import type { keepForAir as KeepForAir } from "./keepForAir";

/** Keep for the Air: the route's answers kept with its charts, and what is
 *  on board for Ready to fly, the feature's entries. */
export { useKeptForAir } from "./useKeptForAir";
export { forgetKeptRecord, keptRecordStore } from "./keptRecord";
export { aboutMb, flightPlatesLine, useFlightPlates } from "./keepPlates";

/** The keep itself (keepForAir) on a chunk of its own, with the answers it
 *  asks for (the briefing, NOTAMs and their ranking, plates, the side view
 *  and radar): run only once the pilot keeps a route, or has Keep for the
 *  Air on, so off the first load. */
export const keepForAir = (...args: Parameters<typeof KeepForAir>): Promise<void> =>
  import("./keepForAir").then((m) => m.keepForAir(...args));
