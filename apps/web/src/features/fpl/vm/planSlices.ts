import type { PlanWorkspaceModel } from "./usePlanWorkspace";

/**
 * The slices of the planner's view model (usePlanWorkspace) a part of the
 * view reads, by name. One hook makes the model for the screen (MVVM); each
 * part is handed it whole, as before, and typed with only the concerns it
 * reads -- `vm: PlanSlices<"plan" | "route">` -- so what a part depends on
 * is in its signature, a concern it stops reading leaves it, and a part
 * that reads one more says so. A part that hands the model on to another
 * names that part's slices too.
 */
export type PlanSlices<K extends keyof PlanWorkspaceModel> = Pick<PlanWorkspaceModel, K>;
