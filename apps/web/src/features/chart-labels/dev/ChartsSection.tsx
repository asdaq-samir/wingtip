import { ListGroup, ListRow } from "../../../components/GroupedList";
import StatusBadge, { type Tone } from "../../../components/StatusBadge";
import type { Status } from "../../../lib/api/types";
import { grouped } from "../../../lib/format";
import { agoOrDate } from "./devWords";

const CHART_KIND_LABELS: Record<string, string> = {
  sec: "Sectional",
  tac: "TAC",
  ifr_low: "IFR low",
  ifr_high: "IFR high",
  ifr_area: "IFR area",
};

/** How the next chart cycle's staging reads at a glance: done green, a
 *  failure red, the rest neither. */
const NEXT_TONE: Record<string, Tone> = { staged: "up", swapped: "up", failed: "down" };

/** The FAA charts on disk and the tile pyramid rendered from them, the
 *  System tab's Charts page:
 *  the cycles and the render as rows, then a row per chart kind with
 *  its sheets, its tiles and how far its pyramid has got -- and, while
 *  the FAA has moved on to a newer cycle, how far that one has, being
 *  fetched and rendered in the background. Used to be one run-on line
 *  naming every count, which read as nothing at all, and then a grid
 *  of figures over a five-column table. */
export function ChartsSection({
  charts,
  onRefresh,
  refreshing,
}: {
  charts: NonNullable<Status["charts"]>;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const sheets = charts.prepared;
  const kinds = Object.keys(CHART_KIND_LABELS).filter((k) => sheets[k] || charts.pyramid?.[k] || charts.building?.[k]);
  const newer = charts.current_cycle !== charts.cycle;
  type Pyramid = NonNullable<Status["charts"]>["pyramid"][string];
  const progress = (p: Pyramid | undefined) =>
    !p
      ? "—"
      : p.current_pass
        ? `${p.current_pass.done}/${p.current_pass.total} sheets${p.current_pass.current ? `, on ${p.current_pass.current}` : ""}`
        : p.complete
          ? "complete"
          : `missing ${p.missing.length} sheet${p.missing.length === 1 ? "" : "s"}: ${p.missing.slice(0, 3).join(", ")}${p.missing.length > 3 ? "…" : ""}`;
  const workers = `${charts.refresh_workers} worker${charts.refresh_workers === 1 ? "" : "s"}`;
  return (
    <div className="space-y-6">
      <ListGroup footer="The FAA charts on disk and the map tiles rendered from them.">
        <ListRow title="Serving cycle" value={charts.cycle} />
        <ListRow
          title="FAA cycle"
          value={newer ? `${charts.current_cycle} · ${charts.refresh_running ? "rendering" : "not yet"}` : "the same"}
        />
        <ListRow title="Tiles" value={grouped(charts.tiles_cached)} />
        <ListRow title="Next render" value={charts.refresh_window ? `${charts.refresh_window}, ${workers}` : `any time, ${workers}`} />
        <ListRow
          title={charts.refresh_running ? "Fetching and rendering…" : "Render now"}
          description="The FAA's current cycle, now rather than at the next daily check"
          onClick={onRefresh}
          disabled={refreshing || charts.refresh_running}
        />
      </ListGroup>
      {/* The FAA's next cycle, drawn before its date by the charts job's
          `next` run (wingtip.chart_next) and taken by the map at 0901Z
          on it: when, whether the planner starts it, and what the job
          last said. */}
      {charts.next && (
        <ListGroup title="Next cycle">
          <ListRow title={`Cycle ${charts.next.cycle}`} value={`takes effect ${charts.next.effective}`} />
          <ListRow
            title="Staging"
            description={`${charts.next.detail ?? ""}${charts.next.updated_at ? ` · ${agoOrDate(charts.next.updated_at)}` : ""}`}
            value={<StatusBadge tone={NEXT_TONE[charts.next.state] ?? "checking"}>{charts.next.state.replace("_", " ")}</StatusBadge>}
          />
          <ListRow
            title="Starts"
            value={charts.next.auto ? `${charts.next.stage_from}, ${charts.next.lead_days} days ahead` : "off (CHARTS_CYCLE_AUTO=0)"}
          />
          {Object.keys(charts.next.progress ?? {}).length > 0 &&
            kinds.map((k) => <ListRow key={k} title={CHART_KIND_LABELS[k]} description={progress(charts.next?.progress?.[k])} />)}
        </ListGroup>
      )}
      <ListGroup title="Chart kinds">
        {kinds.map((k) => (
          <ListRow
            key={k}
            title={CHART_KIND_LABELS[k]}
            description={`${sheets[k] ?? 0} sheets · ${grouped(charts.pyramid?.[k]?.tiles ?? 0)} tiles · ${progress(charts.pyramid?.[k])}${
              newer ? ` · cycle ${charts.current_cycle}: ${progress(charts.building?.[k])}` : ""
            }`}
          />
        ))}
        {kinds.length === 0 && <ListRow muted title="No chart prepared yet." />}
      </ListGroup>
    </div>
  );
}
