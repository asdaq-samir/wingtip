import DrillPage from "./DrillPage";
import HoldingPage from "./HoldingPage";
import LostCommsPage from "./LostCommsPage";

/** The practice drills' pages, by the key their rows open (Practice's
 *  PracticeGroup): the Guide's and Setup's Practice page open the same
 *  ones. */
export function practicePages() {
  return {
    "light-gun": { title: "Light Gun Signals", content: <DrillPage deck="light-gun" /> },
    "vfr-minimums": { title: "VFR Weather Minimums", content: <DrillPage deck="vfr-minimums" /> },
    holding: { title: "Holding Entries", content: <HoldingPage /> },
    "lost-comms": { title: "Lost Communications", content: <LostCommsPage /> },
  };
}
