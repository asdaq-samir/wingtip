import type { ReactNode } from "react";
import { ListRow } from "../../components/GroupedList";
import { DepartureWindowStrip } from "../departureWindow";
import { NotamsRow } from "../notamRanking";
import type { PanelTab } from "../plan";
import BriefGlance from "./BriefGlance";
import FlightWatch from "./FlightWatch";

/** Preflight's section the NOTAMs' row opens (NotamRankingSection's title). */
const NOTAMS_SECTION = "NOTAMs";

/**
 * The Brief as it opens (BriefCard's overview), at the owner's pick of the
 * Brief audit's option 2 (2026-11-21): the one grouped list (BriefGlance)
 * with the findings first, what the briefing could not check said at their
 * end rather than over them (PanelTabs' `notice` is left to the other
 * pages), the Adverse Conditions, the parts of the flight, the NOTAMs
 * that matter its last row, opening them ranked for the flight on
 * Preflight (features/notamRanking); when to go hour by hour at its foot
 * (features/departureWindow), and the flight watch under it.
 */
export default function BriefOverview({ onOpen }: { onOpen: (tab: PanelTab, section?: string) => void; notice?: ReactNode }) {
  const openNotams = () => onOpen("preflight", NOTAMS_SECTION);
  return (
    <BriefGlance
      onOpen={onOpen}
      notams={
        <NotamsRow
          onOpen={openNotams}
          // Its count comes with its chunk: the row is there from the first frame.
          fallback={<ListRow title="NOTAMs" chevron onClick={openNotams} data-testid="brief-notams-row" />}
        />
      }
      foot={<DepartureWindowStrip />}
      after={<FlightWatch />}
    />
  );
}
