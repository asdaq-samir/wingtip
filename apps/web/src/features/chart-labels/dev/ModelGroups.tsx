import { cn } from "cn";
import { ListGroup, ListRow } from "../../../components/GroupedList";
import { PageRow } from "../../../components/ConsolePages";
import StatusBadge from "../../../components/StatusBadge";
import type { Status } from "../../../lib/api/types";
import { agoOrDate, mae, waiting } from "./devWords";

/** A date and a time, for the registry's versions. */
const WHEN = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * The promoted landmark model: what it is, how it scored, and the
 * versions promoted before it (a page of their own), with how each
 * moved the error. Then the chart model (wingtip.chartmodel), which scores
 * the chart reader's points on the training page, against the palette's
 * constants it is to replace on the ratings it held out: the
 * checkpoints move onto the chart once it beats them.
 */
export function ModelGroup({ status, failed }: { status: Status | undefined; failed: boolean }) {
  const model = status?.model;
  const current = model?.current;
  return (
    <>
      {current ? (
        // Its name and when it was trained are the head's (PerfHead).
        <ListGroup title="Model">
          <ListRow title="CV MAE" value={current.cv_mae == null ? "—" : mae(current.cv_mae)} />
          <ListRow title="Held-out MAE" value={current.held_out_mae == null ? "—" : mae(current.held_out_mae)} />
          <ListRow title="Ratings it trained on" value={current.n_labeled ?? "—"} />
          {model && model.versions.length > 0 ? (
            <PageRow page="versions" title="Versions promoted" value={model.versions.length} />
          ) : (
            <ListRow title="Versions promoted" value={0} />
          )}
        </ListGroup>
      ) : (
        <ListGroup title="Model">
          <ListRow
            title={
              <span role="status" className="text-muted-foreground">
                {status ? "No model has been promoted yet." : waiting(failed)}
              </span>
            }
          />
        </ListGroup>
      )}
      {status && <ChartModelGroup chart={model?.chart ?? null} />}
    </>
  );
}

function ChartModelGroup({ chart }: { chart: NonNullable<Status["model"]>["chart"] }) {
  if (!chart) {
    return (
      <ListGroup title="Chart model" footer="It scores the chart reader's points from your ratings, a 0 for one that is no feature at all.">
        <ListRow
          title={
            <span role="status" className="text-muted-foreground">
              None yet: Retrain trains one.
            </span>
          }
        />
      </ListGroup>
    );
  }
  const beats = chart.held_out_mae != null && chart.palette_held_out_mae != null && chart.held_out_mae < chart.palette_held_out_mae;
  return (
    <ListGroup
      title="Chart model"
      badge={<StatusBadge tone={beats ? "up" : "checking"}>{beats ? "Beats the palette" : "Palette still better"}</StatusBadge>}
      footer={`Error on the ${chart.n_test ?? "—"} ratings it held out, lower is better. It scores the training page's points; the checkpoints move onto the chart once it beats the palette's constants.`}
    >
      <ListRow
        title={chart.model_type ?? "Unknown model"}
        description={`Trained ${agoOrDate(chart.trained_at)} · ${chart.n_labeled ?? "—"} ratings`}
      />
      <ListRow title="Held-out MAE" value={chart.held_out_mae == null ? "—" : mae(chart.held_out_mae)} />
      <ListRow title="Palette constants" value={chart.palette_held_out_mae == null ? "—" : mae(chart.palette_held_out_mae)} />
      <ListRow title="Predicting the mean" value={chart.dummy_held_out_mae == null ? "—" : mae(chart.dummy_held_out_mae)} />
    </ListGroup>
  );
}

/** The versions promoted before the model serving, newest first, with
 *  how each moved the error: a page of its own (ConsolePages), opened
 *  from the Model group's count. */
export function Versions({ model }: { model: NonNullable<Status["model"]> }) {
  return (
    <ListGroup title="Newest first">
      {model.versions.map((v, i, all) => {
        const older = all[i + 1];
        const delta = v.cv_mae != null && older?.cv_mae != null ? v.cv_mae - older.cv_mae : null;
        return (
          // When it was trained, to the minute, rather than the
          // registry's id (20260915T213500Z), which says the same
          // thing less readably; and under it how this version
          // moved the error against the one before it, in words.
          <ListRow
            key={v.name}
            title={<span className="tabular-nums">{v.trained_at ? WHEN.format(new Date(v.trained_at)) : v.name}</span>}
            description={
              <>
                {v.model_type ?? "—"}
                {delta !== null && (
                  <>
                    {" "}
                    ·{" "}
                    <span className={cn(delta < -0.00005 ? "text-go-ink" : delta > 0.00005 && "text-destructive-ink")}>
                      {Math.abs(delta) <= 0.00005 ? "no change" : `${mae(Math.abs(delta))} ${delta < 0 ? "lower" : "higher"}`}
                    </span>
                  </>
                )}
              </>
            }
            value={v.cv_mae == null ? "—" : mae(v.cv_mae)}
          />
        );
      })}
    </ListGroup>
  );
}
