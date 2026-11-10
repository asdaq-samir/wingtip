import { TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { Button } from "../../components/ui/button";
import { LINK } from "../../components/airplane/link";
import { duration } from "../../lib/format";
import { TEXT } from "../../lib/text";
import { enduranceRows } from "./endurance";

/**
 * How long the airplane can stay up on its own figures, under them on its
 * profile, as the phones' profiles have it: to dry tanks, then the time
 * left after the VFR day, VFR night and IFR reserves, each reserve's fuel
 * under it. Every figure is the engine's endurance rule. Tanks that hold
 * less than a reserve say so in the caution ink, never hidden or refused
 * (warn, never limit). Without the airplane's own usable fuel or cruise
 * burn nothing is assumed: it asks for the one missing, a tap going to
 * that figure above to type it in place.
 */
export function EnduranceSection({ tail, usableGal, burnGph }: { tail: string; usableGal: number | null; burnGph: number | null }) {
  const rows = enduranceRows(usableGal, burnGph);
  if (!rows) {
    const missing = usableGal == null ? "usable_fuel_gal" : "fuel_burn_gph";
    const ask = usableGal == null ? `How much usable fuel does ${tail} carry?` : `How much fuel does ${tail} burn an hour at cruise?`;
    return (
      <ListGroup title="Endurance">
        <ListRow
          title={ask}
          data-testid="endurance-ask"
          description={
            <Button
              type="button"
              variant="link"
              size="sm"
              className={LINK}
              onClick={() => document.querySelector<HTMLInputElement>(`[data-figure="${missing}"] input`)?.focus()}
            >
              Enter It
            </Button>
          }
        />
      </ListGroup>
    );
  }
  return (
    <ListGroup title="Endurance">
      {rows.map((r) => (
        <ListRow
          key={r.reserve}
          title={r.label}
          data-testid={`endurance-${r.reserve}`}
          description={
            r.reserve === "none" ? undefined : (
              <span className={cn(r.answer.below_reserve && "text-caution-ink")}>
                {r.answer.below_reserve && <TriangleAlert className="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" />}
                {r.answer.below_reserve ? "Less than the reserve: " : ""}
                {duration(r.answer.reserve_min)} kept back
                {r.answer.reserve_gal != null ? `, ${Math.round(r.answer.reserve_gal * 10) / 10} gal` : ""} ({r.rule})
              </span>
            )
          }
          value={
            <span className={cn("font-semibold tabular-nums", TEXT.row, r.answer.below_reserve ? "text-caution-ink" : "text-foreground")}>
              {duration(r.reserve === "none" ? r.answer.minutes! : (r.answer.after_reserve_min ?? 0))}
            </span>
          }
        />
      ))}
    </ListGroup>
  );
}
