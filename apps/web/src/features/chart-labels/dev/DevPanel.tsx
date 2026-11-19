import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StepRow } from "../../../components/ConsolePages";
import { ListGroup } from "../../../components/GroupedList";
import { statusQuery } from "../../../lib/queryClient";
import type { loadPilotPanel } from "../../pilot";
import RatingGuide from "../components/RatingGuide";
import { SystemTab } from "./SystemTab";

// The Performance tab's parts, which the training workspace takes from this
// chunk with the console itself.
export { PerformancePanel, PerfHead } from "./PerformancePanel";

/**
 * The developer's Setup, the training page's last tab: the pilot's own
 * Setup (PilotPanel) -- the switches, the account with its mode, the
 * pilot's things -- with the developer's Status and Guide as its rows, at
 * the owner's pick of the dev page's redesign; it was a console of tabs
 * of its own (Guide, Status, Account). Guide: the three steps that change
 * the model (load a route, rate its points, retrain), then the rating
 * scale. Status: a page each for which services answer, how fresh the
 * FAA and weather data is, the charts, the planner's recent errors, the
 * web app's speed over time, and the doors into the rest of the stack --
 * all from one `/api/status` snapshot, refreshed while open. How good the
 * models are is the page's own Perf tab (PerformancePanel).
 */
/** The pilot console's component, which the dev console is drawn in:
 *  handed in by the training workspace with its chunk already loaded
 *  (pilot's loadPilotPanel), so the console never waits on it. */
export type PilotPanelPart = Awaited<ReturnType<typeof loadPilotPanel>>["PilotPanel"];

export function DevPanel({ pilotPanel: PilotPanel }: { pilotPanel: PilotPanelPart }) {
  const queryClient = useQueryClient();
  const { data: status, isFetching, isError: statusFailed } = useQuery(statusQuery);
  // Everything Status shows, asked for again now rather than at the next
  // 30-second tick: the snapshot, the model comparison, the two health
  // probes it runs itself and which services the sidecar can start.
  const refreshAll = () =>
    void queryClient.invalidateQueries({ predicate: (q) => ["status", "modelComparison", "devServices"].includes(String(q.queryKey[0])) });
  return (
    <PilotPanel
      dev={{
        guide: <TrainingTab />,
        status: <SystemTab status={status} failed={statusFailed} onRefresh={refreshAll} refreshing={isFetching} />,
      }}
    />
  );
}

/** The one action that changes the model, laid out as the three steps
 *  it takes, as numbered rows: load a route, whose chart the reader
 *  reads for its points, rate them in the Model Training panel (what
 *  the chart model learns from), then retrain -- from More beside the
 *  route, or the Performance tab. Then the rating scale and the keys
 *  (RatingGuide). No inputs here: the route at the top of the panel is
 *  what loads a route. It offered to collect one first, from
 *  OpenStreetMap, before the chart was read instead. This planner cannot
 *  train in-process (no scikit-learn of its own, on purpose), so the
 *  retrain is a container of its own (`python -m wingtip.pipeline run`)
 *  the planner starts; where it cannot, the Performance tab says how to
 *  run it by hand instead. */
function TrainingTab() {
  return (
    <div className="space-y-6">
      <ListGroup title="Train the model">
        <StepRow n={1} title="Load a route" description="At the top of the panel; the chart reader finds its points along it." />
        <StepRow
          n={2}
          title="Rate its points"
          description="In the Model Training panel, every one in flight order; a 0 for one that is no feature at all."
        />
        <StepRow
          n={3}
          title="Retrain"
          description="From More beside the route, or Performance; the new model serves only if it does better."
        />
      </ListGroup>
      <RatingGuide />
    </div>
  );
}
