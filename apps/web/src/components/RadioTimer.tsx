import { cn } from "cn";
import { Button } from "./ui/button";
import { stopwatch } from "../lib/format";
import { TEXT } from "../lib/text";
import { useClock } from "../lib/useMinuteClock";

const CHIP = "rounded-full text-tint";

/** The timer a pilot started by voice, counting in the pill until stopped. */
export function Timer({ from, onStop }: { from: number; onStop: () => void }) {
  const now = useClock(1000);
  return (
    <div className="flex items-center gap-2 pt-1 pr-2">
      <span className={cn("font-semibold tabular-nums", TEXT.detail)} data-testid="radio-timer-time">
        Timer {stopwatch(Math.floor(Math.max(0, now - from) / 1000))}
      </span>
      <Button size="sm" variant="secondary" className={CHIP} onClick={onStop} data-testid="radio-timer-stop">
        Stop
      </Button>
    </div>
  );
}
