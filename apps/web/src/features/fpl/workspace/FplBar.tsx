import type { ReactNode } from "react";
import { CardHeadMiddle } from "../../../components/CardHead";
import { HeadGrid } from "../../../components/HeadGrid";

/**
 * FPL's head under the grabber, as Apple Maps' Directions is (the owner,
 * 2026-11-19: "Flight plan should be the title under the grabber just like
 * Directions of Apple Maps"; "Maybe we can have similar buttons x and
 * share"; "Make two rows between the close and share button"): Share at its
 * start (the search's button, which goes back to Search with the route kept)
 * and the ✕ at its end, which clears the route (ClearRouteButton: one tap
 * asks first; the owner, 2026-11-20), and between them two rows: "Flight
 * Plan" at a heading's 20 in bold, as Directions' headline is, and under it
 * the airplane's pills (RouteControls; Route Options is More's, ShareMenu),
 * as "Now · Avoid" is under "Directions". The head keeps the search's
 * height, so a turn of the page moves nothing (the owner, 2026-11-14): the
 * title's line is 25 points and the pills 24.
 *
 * Three columns, the two rows in the middle: either side a round button's
 * 44 points, so the title stays in the row's middle whether Search is there
 * or not (its slot kept, empty). In a row too narrow for all the pills --
 * a local flight's date and time, a 320-point phone -- the airplane's pill
 * gives way first (navlog's pillLook).
 */
export default function FplBar({ share, strip, clear }: { share?: ReactNode; strip?: ReactNode; clear?: ReactNode }) {
  return (
    <HeadGrid
      start={share}
      middle={
        <div className="flex min-w-0 max-w-full flex-col items-center" data-testid="fpl-head">
          <CardHeadMiddle
            name="Flight Plan"
            nameSize="heading"
            nameTestId="fpl-title"
            // The heading's 20 on the row's 22 line, so the two rows stay the
            // search field's height and a turn of the page moves nothing
            // (sheet-page-toggle.spec), the g of "Flight" still whole; lifted
            // 4 points (the owner, 2026-11-21: "a bit bigger and move up a bit").
            nameClassName="-translate-y-1 leading-[1.375rem]"
          />
          {strip && (
            <div className="flex h-6 max-w-full min-w-0 items-center justify-center" data-testid="route-strip">
              {strip}
            </div>
          )}
        </div>
      }
      // The ✕ 16 in from the edge, as Search is at the other end (HeadGrid
      // pulls a card's close 4 out to its edge; FPL's head is symmetric).
      end={clear && <span className="mr-1 flex">{clear}</span>}
    />
  );
}
