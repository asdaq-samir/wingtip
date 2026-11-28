import { ListGroup, ListRow } from "../../../components/GroupedList";
import StatusBadge, { type Tone } from "../../../components/StatusBadge";
import { Progress } from "../../../components/ui/progress";
import { useAddressKey } from "../../../lib/address";
import type { Status } from "../../../lib/api/types";
import { agoOrDate, waiting } from "./devWords";
import { useRetrain } from "./useRetrain";

/** How a training run went, in the one status badge. */
function RunBadge({ state, running }: { state: string | null | undefined; running: boolean }) {
  const [tone, text]: [Tone, string] = running
    ? ["running", "Training…"]
    : state === "success"
      ? ["up", "Succeeded"]
      : state === "failed"
        ? ["down", "Failed"]
        : ["checking", state ?? "Unknown"];
  return <StatusBadge tone={tone}>{text}</StatusBadge>;
}

/**
 * Every collected route, with how far its rating has got. Rows, as
 * Settings' are, where it was a line of grey, dark and outlined chips
 * over a card a route. What the ratings come to for training is the
 * Training group's (TrainingGroup); a Data group of counts went, the
 * readiness saying what they meant.
 */
export function RoutesGroup({ status, failed }: { status: Status | undefined; failed: boolean }) {
  const corridors = status?.corridors ?? [];
  const onMap = useOnMap(corridors);
  return (
    <ListGroup title="Routes" footer="A route's row brings it onto the map to rate.">
      {corridors.length === 0 && <ListRow muted title={<>{status ? "No route has been collected yet." : waiting(failed)}</>} />}
      {corridors.map((c) => {
        const route = new URLSearchParams({ dep: c.departure_ident, dest: c.destination_ident }).toString();
        const name = `${c.departure_ident} → ${c.destination_ident}`;
        const pct = c.candidates ? Math.round((c.labels.total / c.candidates) * 100) : null;
        const here = c === onMap;
        return (
          // The route's row brings it onto the map to rate, unless it is
          // there already; at the end, how far its rating has got. The
          // whole row is the link, as an iOS list's row is: the name
          // alone, 19 tall, had its 44 taken by the row's own lines.
          <ListRow
            key={`${c.departure_ident}-${c.destination_ident}`}
            to={here ? undefined : `/dev?${route}`}
            title={<span className="font-mono">{name}</span>}
            description={`${here ? "On the map · " : ""}${c.labels.total} of ${c.candidates ?? "—"} rated${pct !== null ? ` (${pct}%)` : ""} · ${
              c.labels.added
            } added by hand · ${c.notes} notes · collected ${agoOrDate(c.features_built_at)}`}
          >
            <Progress
              value={pct ?? 0}
              className="h-1.5 w-12"
              aria-label={`${c.departure_ident} to ${c.destination_ident}: ${c.labels.total} of ${c.candidates ?? "an unknown number of"} candidates rated`}
            />
          </ListRow>
        );
      })}
    </ListGroup>
  );
}

/** The collected route on the map behind the console, if it is one:
 *  the Routes section marks its row and says how far its rating has
 *  got. */
function useOnMap(corridors: Status["corridors"]) {
  const onMapKey = `${useAddressKey("dep")[0] ?? ""}-${useAddressKey("dest")[0] ?? ""}`.toUpperCase();
  return corridors.find((c) => `${c.departure_ident}-${c.destination_ident}`.toUpperCase() === onMapKey);
}

/** What a stage of the run is called on the page. */
const STAGE_NAMES: Record<string, string> = {
  landmarks_ready: "Landmark ratings",
  collect: "Collect landmarks",
  feature_engineer: "Landmark features",
  retrain: "Train the landmark model",
  evaluate: "Weigh it against the one serving",
  promote: "Promote it",
  chart_retrain: "Train the chart model",
  chart_evaluate: "Weigh it against the one serving",
  chart_promote: "Promote it",
};

const STAGE_STATES: Record<string, string> = {
  pending: "Waiting",
  running: "Running",
  success: "Done",
  skipped: "Skipped",
  failed: "Failed",
};

/**
 * The training run that would replace the models: how its last run went
 * as a badge beside the heading, then a row a stage -- the one under way,
 * and what each came to or why it was skipped -- from the file the run
 * writes as it goes. Where the planner cannot start one, why and the
 * command to run it by hand. Retrain itself is the head's (PerfHead).
 */
export function TrainingGroup() {
  const { pipeline, lastRun, running } = useRetrain();
  const stages = lastRun?.stages ?? [];
  return (
    <ListGroup
      title="Training"
      badge={(lastRun || running) && <RunBadge state={lastRun?.state} running={running} />}
      footer={
        !pipeline?.startable ? (
          <>
            {pipeline?.detail ?? "The planner cannot start a run from here."} Retrain by hand with{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">docker compose up retrain</code>.
          </>
        ) : undefined
      }
    >
      {!lastRun && <ListRow muted title={running ? "Starting the run…" : "No run yet"} />}
      {lastRun?.error && <ListRow title={<span className="text-destructive-ink">{lastRun.error}</span>} />}
      {stages.map((s) => (
        <ListRow
          key={s.name}
          title={STAGE_NAMES[s.name] ?? s.name}
          description={s.detail ?? undefined}
          value={STAGE_STATES[s.state] ?? s.state}
        />
      ))}
    </ListGroup>
  );
}
