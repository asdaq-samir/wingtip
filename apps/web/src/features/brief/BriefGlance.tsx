import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap } from "lucide-react";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { Accordion } from "../../components/ui/accordion";
import { dataWarning } from "../../lib/dataCycles";
import { useDataCycles } from "../../lib/map/sources/layerAges";
import { glanceLines, useGlance } from "./glance";
import { pilotQuery } from "../../lib/queryClient";
import { trainingQuery } from "../../lib/queryClientRecords";
import { useAirplaneChosen } from "../../lib/preferences";
import { useVerdict } from "../../lib/verdict";
import type { PanelTab } from "../plan";
import { AdverseGroup, CautionRow } from "./AdverseRows";
import { Line, Rest } from "./GlanceLines";
import { BeforeRow, EnrouteRow, FieldRow } from "./glanceRows";

/** The student's instructor, where they have one (their training's
 *  accepted link): the flights put to them are what the instructor signs
 *  off from their own phone (InstructorPage). */
function InstructorNote() {
  const { data: pilot } = useQuery(pilotQuery);
  const { data: training } = useQuery({ ...trainingQuery, enabled: !!pilot });
  const link = training?.instructors.find((l) => l.accepted);
  if (!link) return null;
  // A plain row of a grouped list, as the Brief's other rows are, where it
  // was a tinted box that read as something to tap (the owner, 2026-11-25:
  // "a simple briefing with pages").
  return (
    <ListGroup className="w-full">
      <ListRow
        media={<GraduationCap className="size-5 text-muted-foreground" aria-hidden />}
        title={`Your Instructor, ${link.name ?? link.email}`}
        description="Sees the flights you send them and can sign them off from their phone."
        data-testid="brief-instructor"
      />
    </ListGroup>
  );
}

/**
 * The Brief as it opens, at the owner's rule (2026-11-03, "a pilot
 * doesn't want to spend too much time in studying the briefs so make it
 * simpler for them to just look and go"), his pick of option A
 * (2026-11-19) and of the Brief audit's option 2 (2026-11-21). Whether to
 * go is over it, under the Brief's name (VerdictPill). Straight under it
 * the findings a pilot acts on, at most three one-sentence lines (the
 * engine's gonogo_glance_lines), each unfolding to why it matters and the
 * reports behind it, the rest folded into one row, and what could not be
 * checked one caution at their end (CautionRow). Then the Adverse
 * Conditions on the route, as a briefer gives them first (AIM
 * 7-1-5(b)(1); AdverseGroup), only where there are any. Then a row for
 * each part of the flight -- Before You Go with what is left to do, Depart
 * with its time, En Route with its three figures, Arrive -- and the
 * NOTAMs (`notams`), each opening its page; and at the foot when to go
 * (`foot`), the "when" after the "whether". Grouped lists, as Settings and
 * FPL's timeline are, a hairline between rows. Stacked, not swiped: a
 * swipe only ever goes back (the owner's rule).
 */
export default function BriefGlance({
  onOpen,
  notams,
  foot,
  after,
}: {
  onOpen: (tab: PanelTab, section?: string) => void;
  /** The flight's last row: the NOTAMs that matter (BriefOverview). */
  notams?: ReactNode;
  /** Under the list: when to go hour by hour (BriefOverview). */
  foot?: ReactNode;
  /** Under that: the flight watch (BriefOverview). */
  after?: ReactNode;
}) {
  const glance = useGlance((g) => g.glance);
  const items = useVerdict((v) => v.items);
  const lines = items.length ? glanceLines(items, glance) : null;
  // With no airplane the fuel to spare and the weight and balance are not
  // shown at all, not a dash (the owner, 2026-11-09).
  const airplane = useAirplaneChosen();
  const rest = !!lines && lines.rest.items.length > 0 && lines.rest.finding !== "ok";
  // The findings' group drawn only where it has a row: a line, the rest,
  // or what could not be checked (CautionRow draws nothing without).
  const cycles = useDataCycles();
  const unchecked = !!glance?.unchecked.length || !!dataWarning(cycles);
  const findings = !!lines?.act.length || !!glance?.outside || !!glance?.adiz || rest || unchecked;
  return (
    <div className="flex flex-col gap-4 pt-1 pb-4" data-testid="brief-glance">
      <Accordion multiple data-testid="brief-list" className="flex flex-col gap-4">
        {findings && (
          <ListGroup className="w-full">
            {lines?.act.map((line) => (
              <Line key={line.key} line={line} onOpen={onOpen} />
            ))}
            {/* A route outside the United States, said once among the
                findings: its figures are by US rules (decision 0053). */}
            {glance?.outside && (
              <Line
                line={{ ...glance.outside, key: "jurisdiction", finding: "caution", tab: "enroute", section: null, raw: [] }}
                onOpen={onOpen}
              />
            )}
            {/* An Air Defense Identification Zone on the way, said once:
                what 14 CFR part 99 asks of the flight there. */}
            {glance?.adiz && (
              <Line line={{ ...glance.adiz, key: "adiz", finding: "caution", tab: "enroute", section: null, raw: [] }} onOpen={onOpen} />
            )}
            {rest && <Rest rest={lines!.rest} onOpen={onOpen} />}
            <CautionRow unchecked={glance?.unchecked} />
          </ListGroup>
        )}
        <AdverseGroup adverse={glance?.adverse} onOpen={onOpen} />
        <ListGroup className="w-full" title={glance?.adverse.rows.length ? "The Flight" : undefined}>
          <BeforeRow before={glance?.before} airplane={airplane} onOpen={onOpen} />
          {glance?.depart && <FieldRow tab="depart" label="Depart" field={glance.depart} landing={false} onOpen={onOpen} />}
          <EnrouteRow enroute={glance?.enroute} said={!!lines?.act.some((l) => l.key === "weather")} onOpen={onOpen} />
          {glance?.arrive && <FieldRow tab="arrive" label="Arrive" field={glance.arrive} landing onOpen={onOpen} />}
          {notams}
        </ListGroup>
      </Accordion>
      {foot}
      {after}
      <InstructorNote />
    </div>
  );
}
