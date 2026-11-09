import QueryState from "../../components/QueryState";
import { ListGroup, ListRow } from "../../components/GroupedList";
import SheetDialog from "../../components/SheetDialog";
import { Button } from "../../components/ui/button";
import { bearing, clockTime, feet, gal, hm, knots, localDay, nm, zuluTime } from "../../lib/format";
import { routeName } from "../../lib/identSchema";
import type { SharedLink, SharedPlan } from "../../lib/sharedFlight";
import { TEXT } from "../../lib/text";
import { useSharedFlightPreview, type SharedFlightPreview } from "./useSharedFlightPreview";

/** When it leaves: the receiver's own day and clock, and Z as a flight
 *  plan has it; "About now" for a plan sent with none. */
function departs(depart: string | null): string {
  if (!depart) return "About now";
  const at = new Date(depart);
  return `${localDay(at)} ${clockTime(at)} (${zuluTime(at)})`;
}

/** The plan's rows: what was sent, as it was sent. */
function PlanRows({ plan, ownAirplane }: { plan: SharedPlan; ownAirplane: string | null }) {
  return (
    <ListGroup title="Plan">
      <ListRow title="Route" value={<span className="font-mono">{routeName(plan.dep, plan.dest, plan.stops)}</span>} />
      <ListRow title="Altitude" value={<span className="tabular-nums">{feet(plan.altitudeFt)}</span>} />
      <ListRow title="Departure" value={<span className="tabular-nums">{departs(plan.depart)}</span>} />
      {/* The type it was planned for, shown; the receiver's own airplane
          flies it (no airplane is assumed for them). */}
      <ListRow
        title="Airplane"
        value={[plan.type, plan.tail].filter(Boolean).join(" · ") || "—"}
        description={ownAirplane ? `Planned with your ${ownAirplane}` : "Pick your airplane for its figures"}
      />
      {plan.rules && <ListRow title="Rules" value={plan.rules.toUpperCase()} />}
    </ListGroup>
  );
}

/** A saved flight's filed nav log: each leg's heading, speed, time and fuel. */
function NavLogRows({ vm }: { vm: SharedFlightPreview }) {
  if (!vm.navLog?.length) return null;
  return (
    <ListGroup
      title="Nav Log"
      footer={
        vm.totals ? `${nm(vm.totals.nm)} · ${vm.totals.minutes != null ? hm(vm.totals.minutes) : "—"} · ${gal(vm.totals.gal)}` : undefined
      }
    >
      {vm.navLog.map((c) => (
        <ListRow
          key={c.sequenceNo}
          title={c.name || c.category}
          description={
            c.legDistanceNm != null ? (
              <span className="tabular-nums">
                {c.magneticHeadingDeg != null ? bearing(c.magneticHeadingDeg) : "—"} · {knots(c.groundspeedKt)} ·{" "}
                {c.eteMin != null ? hm(c.eteMin) : "—"} · {gal(c.fuelGal)}
              </span>
            ) : undefined
          }
          value={<span className="tabular-nums">{feet(c.altitudeFt)}</span>}
        />
      ))}
    </ListGroup>
  );
}

/**
 * A flight another pilot sent, before it is used (design/screens.json's
 * `shared`): the plan, a saved flight's filed nav log, and the two
 * answers. The receiver's own plan stays until Use This Plan.
 */
export default function SharedFlightSheet({ link }: { link: SharedLink }) {
  const vm = useSharedFlightPreview(link);
  return (
    <SheetDialog
      open
      onOpenChange={(open) => !open && vm.notNow()}
      title="Shared Flight"
      testId="shared-flight"
      description={vm.plan ? "A flight sent to you. Your own plan stays until you use this one." : undefined}
      action={vm.plan ? { label: "Use This Plan", onClick: vm.use, testId: "shared-flight-use" } : undefined}
      more={
        vm.plan ? (
          <Button variant="ghost" onClick={vm.notNow} data-testid="shared-flight-not-now">
            Not Now
          </Button>
        ) : undefined
      }
    >
      {vm.gone ? (
        <p className={TEXT.prose} data-testid="shared-flight-gone">
          This flight is no longer shared.
        </p>
      ) : (
        vm.asked && !vm.plan && <QueryState query={vm.asked} fetching="Fetching the flight…" failed="The flight could not be fetched." />
      )}
      {vm.plan && <PlanRows plan={vm.plan} ownAirplane={vm.ownAirplane} />}
      <NavLogRows vm={vm} />
    </SheetDialog>
  );
}
