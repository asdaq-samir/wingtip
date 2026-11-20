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
 * Directions' headline is, and under it Route Options and the airplane's
 * pills (RouteControls), as "Now · Avoid" is under "Directions". The head
 * keeps the search's height, so a turn of the page moves nothing (the
 * owner, 2026-11-14): the title's line is 20 points and the pills 28, the
 * row's 46 between the grabber's room and its foot, a point over it either
 * way.
 *
 * Three columns, the two rows in the middle: either side a round button's
 * 36 points, so the title stays in the row's middle whether Share is there
 * or not (its slot kept, empty). In a row too narrow for all the pills --
 * a local flight's date and time, a 320-point phone -- the airplane's pill
 * gives way first (navlog's pillLook).
 */
export default function FplBar({ share, strip, options }: { share?: ReactNode; strip?: ReactNode; options?: ReactNode }) {
  return (
    <div className="grid w-full grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-2">
      <div className="flex justify-start">{share}</div>
      <div className="flex min-w-0 flex-col items-center gap-0">
        <h2 className={cn("max-w-full truncate leading-5 font-bold text-foreground", TEXT.row)} data-testid="fpl-title">
          Flight Plan
        </h2>
        {(strip || options) && (
          <div className="flex max-w-full min-w-0 items-center justify-center gap-1.5">
            {options}
            <div className="flex min-w-0 items-center" data-testid="route-strip">
              {strip}
            </div>
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <PageToggle page={1} />
      </div>
    </div>
  );
}
