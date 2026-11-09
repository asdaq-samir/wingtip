import { ConsolePages, PageRow } from "../../components/ConsolePages";
import { ListGroup } from "../../components/GroupedList";
import { practicePages } from "./practicePages";

/** A row a drill, each with the rule it drills. */
export function PracticeGroup({ title }: { title?: string }) {
  return (
    <ListGroup title={title}>
      <PageRow page="light-gun" title="Light gun signals" description="14 CFR 91.125" />
      <PageRow page="vfr-minimums" title="VFR weather minimums" description="14 CFR 91.155" />
      <PageRow page="holding" title="Holding entries" description="AIM 5-3-8: the entry, drawn, and the wind" />
      <PageRow page="lost-comms" title="Lost communications" description="14 CFR 91.185: route, altitude, and when to leave" />
    </ListGroup>
  );
}

/**
 * Setup's Practice: the drills a row away from Setup's list (2 taps from
 * the map, where they were 3 under the Guide's tips; docs/navigation.md),
 * at the owner's "pilots don't have time to find where things are".
 */
export default function PracticePage() {
  return (
    <ConsolePages back="Practice" pages={practicePages()}>
      <div data-testid="practice-page">
        <PracticeGroup />
      </div>
    </ConsolePages>
  );
}
