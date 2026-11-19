import type { usePlan } from "./usePlan";

/** The plan as usePlan answers it, which the workspace's hooks read from. */
export type PlanAnswer = ReturnType<typeof usePlan>;

/** The route's course, with each stop's time on the ground where the
 *  workspace has put it in (usePlanWorkspace's `course`). */
export type PlanCourse = NonNullable<PlanAnswer["course"]> & { ground: Record<string, number> };
