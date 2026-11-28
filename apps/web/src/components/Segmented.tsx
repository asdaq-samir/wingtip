import type { ReactNode } from "react";
import { cn } from "cn";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { TEXT } from "../lib/text";

/** A segment: 28 tall in the track's 32, the words 13 to a finger, the
 *  chosen one raised -- in the dark, iOS's own lighter grey for it, where
 *  a faint tint of the track left the choice hard to see.
 *  Each keeps 44 across everywhere, so a short word's (Top, VFR) is its
 *  own to tap: VFR's 43 lost its area's edge to IFR's. */
const SEGMENT = `min-w-11 rounded-md px-2.5 ${TEXT.note} text-foreground data-pressed:bg-background data-pressed:shadow-card dark:data-pressed:bg-foreground/20 [&_svg:not([class*='size-'])]:size-3.5`;

/** Two to three choices, one of which is picked: shadcn's ToggleGroup as
 *  a segmented control -- the choice raised out of a muted track, as iOS
 *  draws one, every label in the text's colour at 13 points to a
 *  finger (the unchosen ones were grey, 4.35:1 on the track). Always
 *  one of them: a tap on the one already chosen keeps it rather than
 *  clearing the setting. */
export default function Segmented({
  label,
  value,
  onChange,
  options,
  testId,
  className,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; icon?: ReactNode }[];
  testId?: string;
  /** Its width, where it is not its words': `w-full [&>*]:flex-1` spans
   *  the column, the segments sharing it equally. */
  className?: string;
  /** A row's own fields' height, 28 (FPL's first row, beside the altitude
   *  it sets the rules for), the segments 24 in it; the 44-point area the
   *  same pseudo-element round it. Its size held at any text size, as
   *  iOS's bar controls keep theirs and the fields beside it are held
   *  (navlog/pillLook): its words no larger than 14 px, each segment 44 px
   *  across, where at 19.65 px it took 116 of the row's 300. */
  compact?: boolean;
}) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(v) => {
        if (v[0]) onChange(v[0]);
      }}
      aria-label={label}
      size="sm"
      spacing={0.5}
      data-testid={testId}
      // Its 44-point hit area a pseudo-element behind the track (isolate
      // keeps it over what is round it): the track is 32, and a tap just
      // over or under it -- the Personal tab's, under the console's tabs
      // -- landed outside it. The track does not grow.
      className={cn(
        "relative isolate rounded-lg bg-muted p-0.5 after:inset-x-0 after:-z-10",
        compact ? "rounded-full hit-y-2" : "hit-y-1.5",
        className,
      )}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          className={cn(SEGMENT, compact ? "h-6 min-w-[44px] rounded-full px-2 text-[length:min(0.8125rem,14px)]" : "h-7")}
        >
          {o.icon}
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
