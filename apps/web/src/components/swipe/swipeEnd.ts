/** Where a row swiped to the left comes to rest when the finger lets go. */
export type SwipeRest = "closed" | "open" | "remove";

/** Past this share of the row's width a swipe is a full swipe: let go
 *  there, the row is removed with no tap on its button, as iOS Mail's and
 *  Reminders' rows are. React Aria's iOS List View example sets its line
 *  at 80%; on an iPhone's 402 points that is 320 points of travel, more
 *  than a thumb's sweep across the row, so here it is at 60%. */
export const FULL_SWIPE = 0.6;

/** A flick this fast to the left (points a second, Motion's PanInfo
 *  velocity) opens the row however short it was, as iOS's does. */
const FLICK = 500;

/**
 * The rest a swipe ends at, from how far the row went (`offset`, negative
 * to the left), how fast it was going, the row's width and its button's
 * (`reveal`): past the full-swipe line, removed; past half the button, or
 * flicked to the left, open on its button; else closed again. A flick to
 * the right closes it from anywhere short of the full-swipe line.
 */
export function swipeEnd(offset: number, velocity: number, width: number, reveal: number): SwipeRest {
  if (width > 0 && -offset > width * FULL_SWIPE) return "remove";
  if (velocity > FLICK) return "closed";
  if (velocity < -FLICK || -offset > reveal / 2) return "open";
  return "closed";
}
