import { useMapCentre } from "../../../lib/map/mapCentre";

/**
 * The map's middle at rest (lib/map/mapCentre), read only while the
 * search's own page is in sight with no position to ask from: its Nearest
 * strip is the one thing that asks round it. Read always, each pan of more
 * than a twentieth of a degree drew the whole planner's view model again
 * (usePlanWorkspace, which the compiler leaves alone), its engine calls and
 * every tab with it, with the search page put away and nothing changed.
 */
export function useSearchCentre(wanted: boolean): { lat: number; lon: number } | null {
  return useMapCentre((centre) => (wanted ? centre : null));
}
