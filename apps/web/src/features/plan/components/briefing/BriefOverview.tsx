import { DepartureWindowStrip } from "../../../departureWindow";
import { NotamRankingSection } from "../../../notamRanking";
import type { PanelTab } from "../navlog/panelTab";
import BriefGlance from "./BriefGlance";
import FlightWatch from "./FlightWatch";

/**
 * The Brief as it opens (BriefCard's overview): the verdict and its
 * lines first, at the owner's word ("Verdict first", 2026-11-08), then
 * when to go hour by hour (features/departureWindow), the four glance
 * cards (BriefGlance, the owner's D′), then the NOTAMs that matter,
 * ranked for the flight (features/notamRanking), and the flight watch.
 * Nothing of the cards moves: the rest is added round them.
 */
export default function BriefOverview({ onOpen }: { onOpen: (tab: PanelTab) => void }) {
  return (
    <BriefGlance
      onOpen={onOpen}
      afterVerdict={<DepartureWindowStrip />}
      after={
        <>
          <NotamRankingSection />
          <FlightWatch />
        </>
      }
    />
  );
}
