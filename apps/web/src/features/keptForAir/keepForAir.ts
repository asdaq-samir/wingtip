import type { ChartLayer, Course } from "../../lib/api/types";
import { loadAddress } from "../../lib/address";
import { keep } from "../../lib/map/route/keepRoute";
import { queryClient } from "../../lib/queryClient";
import { keepRouteAnswers } from "./keepAnswers";
import { keepOverlayArchive } from "./keepOverlays";

/** The alternate filed, from the address (as Ready to fly reads it). */
function alternateNow(): string | null {
  try {
    return loadAddress(window.location.search).alternate || null;
  } catch {
    return null;
  }
}

/**
 * Keep for the Air, in one tap or with the Map menu's switch on: the route's
 * answers first -- the briefing, NOTAMs, airport cards, plates, the plan and
 * the weather loop (keepRouteAnswers), quick, and what the air most needs
 * -- then its chart tiles (keepRoute), the long part, whose toast says how
 * it goes, and last the map's overlays (keepOverlayArchive), once a cycle.
 * An answer that cannot be had is named missing on Ready to fly's row, and
 * the charts are kept all the same.
 */
export async function keepForAir(course: Course, layer: ChartLayer, alternate: string | null = alternateNow()): Promise<void> {
  await keepRouteAnswers(queryClient, course, alternate).catch(() => undefined);
  await keep(course, layer);
  await keepOverlayArchive(queryClient);
}
