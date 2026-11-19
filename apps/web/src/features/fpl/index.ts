/**
 * FPL, the pilot's planning workspace as the page's shell mounts it
 * (features/shell): the view (PlanWorkspace), its view model (vm/, one
 * object per concern) and the parts of the sheet that compose the
 * planner's features -- the route box, the nav log, the Brief, the cards
 * over the map. The one search's field and results live here too, as they
 * are drawn from the whole view model.
 */

export { default as PlanWorkspace } from "./PlanWorkspace";
