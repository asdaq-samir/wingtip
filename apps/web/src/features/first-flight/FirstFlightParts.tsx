import { useState } from "react";
import { useFirstFlight } from "./useFirstFlight";
import WelcomeSheet from "./WelcomeSheet";
import FplTip from "./FplTip";
import type { FirstFlightProps } from "./FirstFlight";

/**
 * The first flight's walkthrough itself (useFirstFlight), its welcome
 * sheet and the FPL toggle's tip: a chunk of its own, loaded only on a
 * device that has one of them still to show (FirstFlight), so the many
 * loads that have seen both carry none of it (scripts/first-load.mjs;
 * round 7's N14).
 */
export default function FirstFlightParts(props: FirstFlightProps) {
  const { welcome, go, tip, closeTip } = useFirstFlight(props);
  // Kept once drawn, so the sheet closes with its own motion.
  const [drawn, setDrawn] = useState(welcome);
  if (welcome && !drawn) setDrawn(true);
  return (
    <>
      {drawn && <WelcomeSheet open={welcome} onGo={go} />}
      {tip && <FplTip onClose={closeTip} />}
    </>
  );
}
