import { useEffect, useState } from "react";
import { cn } from "cn";
import { Button } from "./ui/button";
import { stopwatch } from "../lib/diversion";
import { TEXT } from "../lib/text";

const CHIP = "rounded-full text-tint";

/** The timer a pilot started by voice, counting in the pill until stopped. */
export function Timer({ from, onStop }: { from: number; onStop: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);
  return (
    <div className="flex items-center gap-2 pt-1 pr-2">
      <span className={cn("font-semibold tabular-nums", TEXT.detail)} data-testid="radio-timer-time">
        Timer {stopwatch(Math.max(0, now - from))}
      </span>
      <Button size="sm" variant="secondary" className={CHIP} onClick={onStop} data-testid="radio-timer-stop">
        Stop
      </Button>
    </div>
  );
}
