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
 * The Brief as it opens (BriefCard's overview), at the owner's pick of
 * option A (2026-11-19): what the briefing could not check and when to go
 * hour by hour (features/departureWindow) over the one grouped list
 * (BriefGlance), the NOTAMs that matter its last row, opening them ranked
 * for the flight on Preflight (features/notamRanking), and the flight
 * watch under it.
 */
export default function BriefOverview({ onOpen, notice }: { onOpen: (tab: PanelTab, section?: string) => void; notice?: ReactNode }) {
  const openNotams = () => onOpen("preflight", NOTAMS_SECTION);
  return (
    <BriefGlance
      onOpen={onOpen}
      before={
        <>
          {notice}
          <DepartureWindowStrip />
        </>
      }
      notams={
        <NotamsRow
          onOpen={openNotams}
          // Its count comes with its chunk: the row is there from the first frame.
          fallback={<ListRow title="NOTAMs" chevron onClick={openNotams} data-testid="brief-notams-row" />}
        />
      }
      after={<FlightWatch />}
    />
  );
}
