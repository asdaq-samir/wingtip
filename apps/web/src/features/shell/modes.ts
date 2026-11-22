import { lazy } from "react";
import { PlanWorkspace } from "../fpl";
import { loadTrainWorkspace } from "../chart-labels";

/** The training workspace on its own chunk. It carries the developer's console -- charts, tables, the model
 *  registry -- and a pilot loading the planner has no use for any of it; eagerly imported here it was about half
 *  of the page's JavaScript, parsed on every visit. React's own `lazy`, resolved while MapPage's `Suspense`
 *  shows the empty shell. */
const TrainWorkspace = lazy(loadTrainWorkspace);

export type Mode = "pilot" | "dev";

/** What differs between the pages: the words, the workspace, and the
 *  route to start on when the address names none (the planner asks the
 *  server for a collected one instead). */
export const MODES = {
  pilot: {
    title: "Plan a route — Wingtip Maps",
    panel: "Flight Planning",
    console: "Pilot",
    Workspace: PlanWorkspace,
    route: ["", ""] as const,
  },
  dev: {
    title: "Dev — Wingtip Maps",
    panel: "Model Training",
    console: "Developer",
    Workspace: TrainWorkspace,
    route: ["C81", "KDLH"] as const,
  },
};
