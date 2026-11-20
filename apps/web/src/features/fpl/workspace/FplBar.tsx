import type { ReactNode } from "react";
import { cn } from "cn";
import PageToggle from "../../../components/PageToggle";
import { TEXT } from "../../../lib/text";

/**
 * FPL's head under the grabber, as Apple Maps' Directions is (the owner,
 * 2026-11-19: "Flight plan should be the title under the grabber just like
 * Directions of Apple Maps"; "Maybe we can have similar buttons x and
 * share"; "Make two rows between the close and share button"): Share at its
 * start (the route's menu, ShareMenu) and the ✕ at its end, which closes the
 * page to Search where the search's row has its toggle (PageToggle), and
 * between them two rows: "Flight Plan" at the row's 17 in bold, as
 * Directions' headline is, and under it the airplane's pills
 * (RouteControls; Route Options is More's, ShareMenu), as "Now · Avoid" is under "Directions". The head
 * keeps the search's height, so a turn of the page moves nothing (the
 * owner, 2026-11-14): the title's line is 18 points and the pills 28, the
 * search field's 46.
 *
 * Three columns, the two rows in the middle: either side a round button's
 * 44 points, so the title stays in the row's middle whether Share is there
 * or not (its slot kept, empty). In a row too narrow for all the pills --
 * a local flight's date and time, a 320-point phone -- the airplane's pill
 * gives way first (navlog's pillLook).
 */
export default function FplBar({ share, strip }: { share?: ReactNode; strip?: ReactNode }) {
  return (
    <div className="grid w-full grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2">
      <div className="flex justify-start">{share}</div>
      <div className="flex min-w-0 flex-col items-center" data-testid="fpl-head">
        <h2
          // Lifted 4 points off the pills under it, the head's height
          // and its place kept (the owner, 2026-11-20: "move the title up a
          // few px to have some space in between it and the pills").
          className={cn("max-w-full -translate-y-1 truncate font-bold text-foreground", TEXT.row, "leading-[1.125rem]")}
          data-testid="fpl-title"
        >
          Flight Plan
        </h2>
        {strip && (
          <div className="flex h-7 max-w-full min-w-0 items-center justify-center" data-testid="route-strip">
            {strip}
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <PageToggle page={1} />
      </div>
    </div>
  );
}
