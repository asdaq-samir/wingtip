import { createContext, type ReactNode } from "react";

/** What FPL draws right after the Routes' chips where they are in the
 *  route's list (ProceduresRoute, the box's and the line's layouts): the
 *  Brief's findings (FplFindings), so nothing comes between the figures
 *  and the chips (the owner, 2026-11-16: "We should not have anything
 *  between the strip and routes"). A context, not a prop, so the list's
 *  memo (PlanWorkspace's routeList) is not made again for it. */
export const AfterRouteLine = createContext<ReactNode>(null);
