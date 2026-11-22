import { ListGroup, ListRow } from "../../components/GroupedList";
import SheetDialog from "../../components/SheetDialog";
import { Button } from "../../components/ui/button";
import { Progress } from "../../components/ui/progress";
import { aboutMb } from "../keptForAir";
import { useKeptStatesCount, useStatePlates } from "./useStatePlates";
import type { KeptState } from "./statePlates";

/** When a cycle ends, as the FAA's schedule says it: "24 Dec 0901Z". */
function endsAt(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const day = at.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
  const time = `${String(at.getUTCHours()).padStart(2, "0")}${String(at.getUTCMinutes()).padStart(2, "0")}Z`;
  return `${day} ${time}`;
}

/**
 * Settings → Plates: the FAA's plates kept a state at a time for flying
 * with no signal, as the phones' Downloads keep the charts' regions. Each
 * state with its size before it is fetched, the d-TPP cycle they are of
 * and when it ends, those kept with how far each has come, and Delete;
 * a kept state is fetched again by itself at the next cycle's 0901Z
 * (useStatePlatesFresh). The state is useStatePlates'.
 */
export function PlatesPage() {
  const vm = useStatePlates();
  const ends = endsAt(vm.nextAt);
  return (
    <div className="flex flex-col gap-5" data-testid="plates-page">
      {vm.kept.length > 0 && (
        <ListGroup title="On This Device">
          {vm.kept.map((k) => (
            <KeptRow
              key={k.id}
              kept={k}
              running={vm.running.includes(k.id)}
              updating={vm.running.includes(k.id) && vm.cycle != null && vm.cycle !== k.cycle ? vm.cycle : null}
              problem={vm.problems[k.id] || null}
              onRetry={() => vm.retry(k)}
              onDelete={() => vm.remove(k)}
            />
          ))}
        </ListGroup>
      )}
      <ListGroup
        title="States"
        footer={vm.cycle ? `Cycle ${vm.cycle}${ends ? `, until ${ends}` : ""}. A kept state updates itself then.` : undefined}
      >
        {!vm.canKeep && <ListRow muted title="Plates can be kept only over a secure connection (https)." />}
        {vm.failed && <ListRow muted title="The FAA's list of plates couldn't be fetched. Try again later." />}
        {vm.loading && <ListRow muted title="Fetching…" />}
        {vm.states.map((s) => (
          <ListRow
            key={s.id}
            title={s.name}
            value={vm.isKept(s.id) ? "Kept" : aboutMb(s.bytes)}
            onClick={() => vm.ask(s)}
            disabled={!vm.canKeep || vm.isKept(s.id) || vm.running.includes(s.id)}
            data-testid={`plates-state-${s.id}`}
          />
        ))}
      </ListGroup>
      <SheetDialog
        open={vm.asking != null}
        onOpenChange={(open) => !open && vm.ask(null)}
        alert
        centered
        title={vm.asking ? `Download ${vm.asking.name}'s plates?` : ""}
        description={
          vm.asking
            ? `${vm.asking.charts.toLocaleString("en-US")} charts at ${vm.asking.fields} fields, ${aboutMb(vm.asking.bytes)}, cycle ${vm.cycle}. They download while the app is open.`
            : undefined
        }
        action={{ label: "Download", onClick: () => vm.asking && vm.keep(vm.asking.id), testId: "plates-download" }}
      />
    </div>
  );
}

function KeptRow({
  kept,
  running,
  updating,
  problem,
  onRetry,
  onDelete,
}: {
  kept: KeptState;
  running: boolean;
  updating: string | null;
  problem: string | null;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const coming = kept.done < kept.charts;
  const line = updating
    ? `Cycle ${kept.cycle} · updating to ${updating}…`
    : coming
      ? `Cycle ${kept.cycle} · ${kept.done.toLocaleString("en-US")} of ${kept.charts.toLocaleString("en-US")} charts${running ? "" : ", stopped"}`
      : `Cycle ${kept.cycle} · ${kept.charts.toLocaleString("en-US")} charts${kept.failed ? `, ${kept.failed} not fetched` : ""}`;
  return (
    <ListRow
      title={kept.name}
      value={aboutMb(kept.bytes)}
      description={
        <span className="flex flex-col gap-1.5">
          <span>{line}</span>
          {coming && !updating && <Progress value={(kept.done / Math.max(1, kept.charts)) * 100} aria-label={`${kept.name}'s plates`} />}
          {problem && <span className="text-caution-ink">{problem}</span>}
          <span className="flex gap-2">
            {(problem || (!running && (coming || kept.failed > 0))) && (
              <Button variant="link" size="sm" onClick={onRetry}>
                Try Again
              </Button>
            )}
            <Button variant="link" size="sm" className="text-destructive-ink" onClick={onDelete} data-testid={`plates-delete-${kept.id}`}>
              Delete
            </Button>
          </span>
        </span>
      }
    />
  );
}

/** Settings' Plates row's value: the states kept, or none. */
export function PlatesRowValue() {
  const count = useKeptStatesCount();
  return count ? `${count} ${count === 1 ? "state" : "states"}` : null;
}
