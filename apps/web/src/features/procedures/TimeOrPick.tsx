import type { ReactNode } from "react";
import { Button } from "../../components/ui/button";
import { useAirplaneChosen } from "../../lib/preferences";
import { requestAirplanePick } from "../../lib/pickAirplane";

/** The arrival's time, or with no airplane picked "Pick an airplane" in its
 *  place, where the time was a bare dash (the owner's screenshot,
 *  2026-11-15): the times are the airplane's speeds', so the dash said
 *  nothing of why. It opens the N-number's picker (lib/pickAirplane). */
export function TimeOrPick({ time }: { time: ReactNode }) {
  const airplane = useAirplaneChosen();
  if (airplane || time !== "—") return typeof time === "string" ? <span className="font-semibold">{time}</span> : time;
  return (
    <Button
      variant="link"
      size="inline"
      onClick={requestAirplanePick}
      data-testid="point-pick-airplane"
      className="relative font-semibold after:absolute after:-inset-y-3 after:inset-x-0 after:content-['']"
    >
      Pick an airplane
    </Button>
  );
}
