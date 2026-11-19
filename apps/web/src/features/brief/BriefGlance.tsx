import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap } from "lucide-react";
import { cn } from "cn";
import { Alert, AlertDescription } from "../../components/ui/alert";
import FindingIcon from "../../components/FindingIcon";
import { ListGroup } from "../../components/GroupedList";
import { Accordion } from "../../components/ui/accordion";
import { dataWarning } from "../../lib/dataCycles";
import { useDataCycles } from "../../lib/map/sources/layerAges";
import { glanceLines, useGlance } from "./glance";
import { pilotQuery, trainingQuery } from "../../lib/queryClient";
import { FINDING_TONE } from "../../lib/findings";
import { TEXT } from "../../lib/text";
import { useAirplaneChosen } from "../../lib/preferences";
import { useVerdict } from "../../lib/verdict";
import type { PanelTab } from "../plan";
import { Line, Rest } from "./GlanceLines";
import { BeforeRow, EnrouteRow, FieldRow } from "./glanceRows";

/** One line when FAA data the plan rests on -- the airports and their
 *  frequencies, the charts, the procedures, the obstacles -- is past its
 *  cycle (the engine's data_cycle, lib/dataCycles): the plan is still
 *  made from it (warn, never limit), and a pilot should know before they
 *  go. Nothing while every edition is in force. */
function DataWarning() {
  const line = dataWarning(useDataCycles());
  if (!line) return null;
  return (
    // The stock Alert, said politely (a status, not an alarm), in the
    // caution's wash.
    <Alert
      role="status"
      className={cn("items-center rounded-xl border-0 bg-caution-wash px-3.5 py-2.5", TEXT.detail)}
      data-testid="brief-data-out-of-date"
    >
      <FindingIcon finding="caution" className="size-5 shrink-0" />
      <AlertDescription className={cn(TEXT.detail, FINDING_TONE.caution)}>{line}</AlertDescription>
    </Alert>
  );
}

/** The student's instructor, where they have one (their training's
 *  accepted link): the flights put to them are what the instructor signs
 *  off from their own phone (InstructorPage). */
function InstructorNote() {
  const { data: pilot } = useQuery(pilotQuery);
  const { data: training } = useQuery({ ...trainingQuery, enabled: !!pilot });
  const link = training?.instructors.find((l) => l.accepted);
  if (!link) return null;
  return (
    <div
      className={cn("flex items-center gap-2.5 rounded-xl bg-primary/10 px-3.5 py-2.5 text-foreground", TEXT.detail)}
      data-testid="brief-instructor"
    >
      <GraduationCap className="size-5 shrink-0 text-tint" aria-hidden />
      <span>Your instructor, {link.name ?? link.email}, sees the flights you put to them and can sign off from their phone.</span>
    </div>
  );
}

/**
 * The Brief as it opens, at the owner's rule (2026-11-03, "a pilot
 * doesn't want to spend too much time in studying the briefs so make it
 * simpler for them to just look and go") and his pick of option A
 * (2026-11-19): one grouped list, as Settings and FPL's timeline are, a
 * hairline between its rows. Whether to go is over it, under the Brief's
 * name (VerdictPill). First the findings a pilot acts on, at most three
 * one-sentence lines (the engine's gonogo_glance_lines), each unfolding
 * to why it matters and the reports behind it, and the rest folded into
 * one row; then a row for each part of the flight -- Before You Go with
 * what is left to do, Depart with its time, En Route with its three
 * figures, Arrive -- and the NOTAMs (`notams`), each opening its page.
 * Stacked, not swiped: a swipe only ever goes back (the owner's rule).
 */
export default function BriefGlance({
  onOpen,
  before,
  notams,
  after,
}: {
  onOpen: (tab: PanelTab, section?: string) => void;
  /** Over the list: what the briefing could not check, and when to go
   *  (BriefOverview). */
  before?: ReactNode;
  /** The list's last row: the NOTAMs that matter (BriefOverview). */
  notams?: ReactNode;
  /** Under the list: the flight watch (BriefOverview). */
  after?: ReactNode;
}) {
  const glance = useGlance((g) => g.glance);
  const items = useVerdict((v) => v.items);
  const lines = items.length ? glanceLines(items, glance) : null;
  // With no airplane the fuel to spare and the weight and balance are not
  // shown at all, not a dash (the owner, 2026-11-09).
  const airplane = useAirplaneChosen();
  return (
    <div className="flex flex-col gap-4 pt-1 pb-4" data-testid="brief-glance">
      {before}
      <Accordion multiple data-testid="brief-list">
        <ListGroup className="w-full">
          {lines?.act.map((line) => (
            <Line key={line.key} line={line} onOpen={onOpen} />
          ))}
          {lines && lines.rest.items.length > 0 && lines.rest.finding !== "ok" && <Rest rest={lines.rest} onOpen={onOpen} />}
          <BeforeRow before={glance?.before} airplane={airplane} onOpen={onOpen} />
          {glance?.depart && <FieldRow tab="depart" label="Depart" field={glance.depart} landing={false} onOpen={onOpen} />}
          <EnrouteRow enroute={glance?.enroute} said={!!lines?.act.some((l) => l.key === "weather")} onOpen={onOpen} />
          {glance?.arrive && <FieldRow tab="arrive" label="Arrive" field={glance.arrive} landing onOpen={onOpen} />}
          {notams}
        </ListGroup>
      </Accordion>
      <DataWarning />
      {after}
      <InstructorNote />
    </div>
  );
}
