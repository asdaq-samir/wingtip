import type { ReactNode } from "react";
import { cn } from "cn";
import { feet } from "../lib/format";
import { TEXT } from "../lib/text";

/** The key's line sample: a short bar in a colour class (`bg-tint`). */
function LegendSwatch({ colour, children }: { colour: string; children: ReactNode }) {
  return (
    <span>
      <span className={cn("mr-1 inline-block h-0.5 w-4 align-middle", colour)} />
      {children}
    </span>
  );
}

/** The line over an altitude drawing (the approach's debrief, the flight's):
 *  its top altitude at the left, at the right a key of what each line is. */
export function AltitudeLegend({ high, keys }: { high: number; keys: readonly { colour: string; label: string }[] }) {
  return (
    <div className={cn("flex justify-between text-muted-foreground tabular-nums", TEXT.note)}>
      <span>{feet(high)}</span>
      <span className="flex gap-3">
        {keys.map((k) => (
          <LegendSwatch key={k.label} colour={k.colour}>
            {k.label}
          </LegendSwatch>
        ))}
      </span>
    </div>
  );
}
