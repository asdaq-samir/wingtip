import { addTransitionType, startTransition, type ViewTransitionClass } from "react";

/**
 * A page giving way to the next as the platform's own pages do, through
 * React's own View Transitions (React 19.3's <ViewTransition>): the change
 * is made in a transition typed by its direction, and a <ViewTransition>
 * round the page (PAGE_STEP) slides the old page out and the new one in
 * on the sheet's ease-out over motion.page (index.css), forward to the
 * left and back to the right, as a navigation stack's pages go. Only a
 * page step animates: the router's own transitions, which change these
 * pages too, carry no type, and PAGE_STEP is "none" for them. Reduce
 * Motion holds the pages still (index.css).
 */
export function pageStep(forward: boolean, change: () => void): void {
  startTransition(() => {
    addTransitionType(forward ? "page-forward" : "page-back");
    change();
  });
}

/** The classes a page's <ViewTransition update={…}> takes: the slide for
 *  a page step, nothing for any other change. */
export const PAGE_STEP: ViewTransitionClass = { "page-forward": "page-step", "page-back": "page-back", default: "none" };
