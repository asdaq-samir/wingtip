import { DepartureWindowStrip } from "../../../departureWindow";
import { NotamRankingSection } from "../../../notamRanking";
import { useTabAsk, type PanelTab } from "../navlog/panelTab";
import AskSection from "../ask/AskCard";
import BriefGlance from "./BriefGlance";
import { RiskWords, WeatherWords } from "./BriefWords";
import FlightWatch from "./FlightWatch";

/**
 * The Brief as it opens (BriefCard's overview): the verdict and its
 * lines first, at the owner's word ("Verdict first", 2026-11-08), the
 * assistant's field straight under them -- the Brief is the AI's home --
 * then when to go hour by hour (features/departureWindow), the risk
 * picture in words, the four glance cards (BriefGlance, the
 * owner's D′), then the NOTAMs that matter, ranked for the flight
 * (features/notamRanking), the weather in words and the flight watch. Nothing of the cards moves: the words and the watch are added
 * round them.
 */
export default function BriefOverview({ onOpen }: { onOpen: (tab: PanelTab) => void }) {
  // A words section's title opens its page as a glance card does -- the
  // panel all the way up -- and then its section by title (PanelTabs
  // hears the ask once the page is up).
  const open = (tab: PanelTab, section: string) => {
    onOpen(tab);
    useTabAsk.getState().go(tab, section);
  };
  return (
    <BriefGlance
      onOpen={onOpen}
      before={<AskSection />}
      afterVerdict={(
        <>
          {/* When to go, hour by hour, under the verdict and the
              assistant's field, which stay first. */}
          <DepartureWindowStrip />
          <RiskWords open={open} />
        </>
      )}
      after={(
        <>
          <NotamRankingSection />
          <WeatherWords open={open} />
          <FlightWatch />
        </>
      )}
    />
  );
}
