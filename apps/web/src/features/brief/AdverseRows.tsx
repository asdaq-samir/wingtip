import FindingIcon from "../../components/FindingIcon";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { dataWarning } from "../../lib/dataCycles";
import { FINDING_TONE } from "../../lib/findings";
import { clockTime, zoneName } from "../../lib/format";
import { useDataCycles } from "../../lib/map/sources/layerAges";
import { TEXT } from "../../lib/text";
import type { PanelTab } from "../plan";
import type { Adverse, AdverseRow } from "./adverse";
import { capitalised } from "../../lib/capitals";

/** A clock time with its zone, "14:40 CST", as the Brief's rows say one. */
const time = (iso: string) => `${clockTime(new Date(iso))} ${zoneName(new Date(iso))}`;

/** Where and when the flight meets it, in a line under its name: the
 *  legs it is on (1-based, as the nav log numbers them), then when a TFR
 *  is met, until when an advisory holds, when a pilot report was made. */
function whenWords(row: AdverseRow): string {
  const [first, last] = [row.legs[0], row.legs.at(-1)];
  const legs = first === undefined ? null : first === last ? `Leg ${first + 1}` : `Legs ${first + 1}–${last! + 1}`;
  const at = row.time
    ? row.time_kind === "at"
      ? `in force at ${time(row.time)}`
      : row.time_kind === "until"
        ? `until ${time(row.time)}`
        : `reported ${time(row.time)}`
    : null;
  const said = [legs, at].filter(Boolean).join(" · ");
  return said ? capitalised(said) : "During the flight";
}

/**
 * The Brief's Adverse Conditions, under the findings (the owner's pick, 2026-11-21):
 * the standard briefing's first
 * element (AIM 7-1-5(b)(1)), a row each for the TFR the route goes
 * through, the SIGMETs, the urgent pilot reports and the G-AIRMETs met on
 * the route, at most three in the engine's order (gonogo_adverse_rows),
 * each opening its section. Nothing drawn where there are none: no "none"
 * row (the owner's "nothing empty", 2026-11-16).
 */
export function AdverseGroup({ adverse, onOpen }: { adverse: Adverse | undefined; onOpen: (tab: PanelTab, section?: string) => void }) {
  if (!adverse?.rows.length) return null;
  return (
    <ListGroup title="Adverse Conditions" className="w-full">
      {adverse.rows.map((row, n) => (
        <ListRow
          key={`${row.source}:${n}`}
          media={<FindingIcon finding={row.finding} className="size-5 shrink-0" />}
          title={<span className="line-clamp-2">{row.title}</span>}
          description={whenWords(row)}
          chevron
          onClick={() => onOpen(row.tab, row.section)}
          data-testid={`brief-adverse-${n}`}
          data-finding={row.finding}
        />
      ))}
      {adverse.more > 0 && (
        <ListRow
          title={`${adverse.more} more on the route`}
          chevron
          onClick={() => onOpen("enroute", "Adverse Conditions")}
          data-testid="brief-adverse-more"
        />
      )}
    </ListGroup>
  );
}

/**
 * What a pilot should know is missing, as one caution at the findings'
 * end, before they go: what the briefing
 * could not check (aviationweather.gov not answering) and FAA data the
 * plan rests on past its cycle (the engine's data_cycle, lib/dataCycles).
 * The plan is still made (warn, never limit). Nothing when neither.
 */
export function CautionRow({ unchecked }: { unchecked: string[] | undefined }) {
  const outOfCycle = dataWarning(useDataCycles());
  const gaps = unchecked ?? [];
  if (!gaps.length && !outOfCycle) return null;
  const lead = gaps.length ? `Could not check ${gaps.join(", ")}: verify separately before flight` : outOfCycle!;
  return (
    <ListRow
      media={<FindingIcon finding="caution" className="size-5 shrink-0" />}
      title={<span className={FINDING_TONE.caution}>{lead}</span>}
      description={
        gaps.length && outOfCycle ? (
          <span className={TEXT.detail} data-testid="brief-data-out-of-date">
            {outOfCycle}
          </span>
        ) : undefined
      }
      role="status"
      data-testid={gaps.length ? "briefing-notices" : "brief-data-out-of-date"}
    />
  );
}
