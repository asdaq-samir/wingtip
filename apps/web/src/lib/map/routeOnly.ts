import { create } from "zustand";

/**
 * Whether the map shows the route's points alone (the owner, 2026-11-17,
 * Apple Maps' Directions as the model: "the map shows only the route
 * points which can be tapped to show their info"): set while FPL's route
 * is open to edit (PlanPage). The chart stays; the other airports, the
 * navaids and fixes, the airspace, the weather's marks and loops, the
 * Class B fields, the checkpoints, the traffic and a search's marks are
 * put away (glOverlays' applyOverlayFilters, GlRouteMap); the TFRs stay,
 * a flight's hazard whatever is being edited.
 */
export const useRouteOnly = create<{ on: boolean }>(() => ({ on: false }));
