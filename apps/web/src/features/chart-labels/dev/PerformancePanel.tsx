import { BrainCircuit } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { ConsolePages } from "../../../components/ConsolePages";
import { ListGroup, ListRow } from "../../../components/GroupedList";
import StatusBadge from "../../../components/StatusBadge";
import { statusQuery } from "../../../lib/queryClient";
import type { Status } from "../../../lib/api/types";
import { agoOrDate, waiting } from "./devWords";
import { ModelComparison } from "./ModelComparison";
import { ModelGroup, Versions } from "./ModelGroups";
import { RoutesGroup, TrainingGroup } from "./RunGroups";
import { useRetrain } from "./useRetrain";

/** The Performance tab, for the developer training the model: the
 *  data it learns from, the model serving and the run that would
 *  replace it, and every algorithm compared -- grouped lists, as iOS's
 *  Settings are, with the versions before the model serving a page of
 *  their own. They were three sections folded under their titles. */
/**
 * How good the models are, the training page's Perf tab (TrainWorkspace),
 * at the developer's ask, where it was a tab of the console: training
 * first (whether the ratings are enough to learn from, the last run and
 * why it failed, Retrain), then every algorithm compared, the model
 * serving and (a page of its own) the versions before it, and the routes
 * collected. The status snapshot asked for again while it is up, as the
 * console's is.
 */
export function PerformancePanel() {
  const { data: status, isError } = useQuery(statusQuery);
  return (
    // A tab stop of its own: while the status is still coming the region
    // scrolls but holds nothing to focus, and a keyboard could not scroll
    // it (WCAG 2.1.1; axe's scrollable-region-focusable).
    // At iOS's 16 from the panel's side, as every sheet's groups are.
    // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- a scroller is what a keyboard needs to reach
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-6" data-testid="perf-panel" tabIndex={0}>
      <PerformanceTab status={status} failed={isError} />
    </div>
  );
}

function PerformanceTab({ status, failed }: { status: Status | undefined; failed: boolean }) {
  const model = status?.model;
  return (
    <ConsolePages
      back="Performance"
      pages={{ versions: { title: "Versions promoted", content: model ? <Versions model={model} /> : null } }}
    >
      {/* Under the head's model and Retrain (PerfHead), one section under
          another, as FPL's tabs are, at the owner's pick of the dev page's
          redesign: the algorithms compared, the model in full and the
          chart model, the routes, and how training runs. */}
      <div className="space-y-6">
        <ModelComparison />
        <ModelGroup status={status} failed={failed} />
        <RoutesGroup status={status} failed={failed} />
        <TrainingGroup />
      </div>
    </ConsolePages>
  );
}

/**
 * Perf's head, in its pill and where it was all the way up (MapPanel's
 * head): the model serving -- what it is, when it was trained -- and
 * Retrain, at the owner's pick of the dev page's redesign; it was a
 * "Performance" headline over the Training group.
 */
export function PerfHead() {
  const { data: status, isError } = useQuery(statusQuery);
  const current = status?.model?.current;
  const retrain = useRetrain();
  const { running, training } = retrain;
  const blocked = training && !training.ready ? training.message : null;
  return (
    <div className="w-full" data-testid="perf-head">
      <ListGroup>
        <ListRow
          title={
            current ? (
              (current.model_type ?? "Unknown model")
            ) : (
              <span role="status" className="text-muted-foreground">
                {status ? "No model has been promoted yet." : waiting(isError)}
              </span>
            )
          }
          description={current ? `Trained ${agoOrDate(current.trained_at)} · ${current.n_features} features` : undefined}
        >
          {current && <StatusBadge tone="up">Serving</StatusBadge>}
        </ListRow>
        <ListRow
          media={<BrainCircuit className="size-5" />}
          title={running ? "Retraining…" : "Retrain the model"}
          description={
            running ? "The new model serves only if it does better" : (blocked ?? "From every rating; it serves only if it does better")
          }
          onClick={retrain.start}
          disabled={!retrain.canStart}
          data-testid="retrain-row"
        />
      </ListGroup>
      {retrain.confirmDialog}
    </div>
  );
}
