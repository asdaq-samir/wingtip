import { MOTION } from "../../lib/tokens";
import { onSettle, slidOf, type Settle } from "./sheetFollow";

/** The figures' own ease through a settle (followSettle), by its id. */
const FOLLOW = "pin-follow";

/**
 * The row held at the foot (usePinAtFoot's, PIN_AT_FOOT) followed through
 * each settle of its sheet by an animation of its own, worked out as the
 * settle starts: riding down with the plan until it meets the foot and
 * then still there, or waiting on the foot as the sheet comes up until its
 * own place reaches it -- the path its CSS gives under a finger, kink and
 * all.
 *
 * A transition on its transform eased straight from where it was to where
 * it rests, a fixed share of the sheet's speed the whole way: on a drop to
 * the pill the figures slid over the route above them and then arrived,
 * the mirroring the motion lesson rules out (the gestures audit of
 * 2026-11-23, H3; 278b67c62's "figures carried ~15 pt low on release, then
 * crept back"). The path is two straight pieces in the sheet's place, so
 * an animation on the sheet's own curve and time, with a key frame where
 * the pieces meet, is that path at every frame: the curve is applied to
 * the animation's progress, and the frames are sampled at the eased
 * progress, as the sheet's own transition is. A transform animation, so
 * it runs beside the sheet's on the compositor, never a frame behind a
 * busy page as a row moved by script was.
 *
 * Where it rests is read off its own CSS once the new offset is in; where
 * it was, off the same CSS with the offset and movement it had. Its height
 * is the same at both ends: through the settle the figures grow by a
 * scale (usePinAtFoot's --pin-s), not by their laid-out size, which is set
 * once the sheet rests, the room measured again with it. Neither piece fits (a drag
 * that ends going the other way, the figures put away), it eases straight,
 * as before. A finger on the sheet stops it: under a finger the CSS is
 * exact. Answers its removal.
 */
export function followSettle(row: HTMLElement): () => void {
  const stop = () => {
    for (const a of row.getAnimations()) if (a.id === FOLLOW) a.cancel();
  };
  const off = onSettle({
    popup: () => row.closest<HTMLElement>(".group\\/sheet"),
    swiped: stop,
    settle: (s) => {
      if (!s.eased || typeof row.animate !== "function" || !row.isConnected) return stop();
      ride(row, s);
    },
  });
  return () => {
    off();
    stop();
  };
}

function ride(row: HTMLElement, s: Settle) {
  const style = row.style;
  const going = row.getAnimations().filter((a) => a.id === FOLLOW);
  // Where it is drawn now: mid-ease, the ease's own place, read before the
  // ease is let go.
  let from = going.length ? slidOf(row) : Number.NaN;
  for (const a of going) a.cancel();
  // Its height, the same at both ends, and its rest, read together before
  // anything is written (no style written and read back here: trying the
  // end size on the row forced two layouts as the settle began, in the
  // let-go's own frame; the animation audit of 2026-11-23, M2), so the
  // let-go works the style out twice at most, not four times (the r5-ui
  // audit's L3).
  const h = row.offsetHeight;
  const to = slidOf(row);
  // Else its CSS with what it was told before this change, the one style
  // written and read back.
  if (Number.isNaN(from)) {
    const swipe = style.getPropertyValue("--sheet-swipe");
    style.setProperty("--sheet-offset", s.was.offset);
    style.setProperty("--sheet-swipe", s.was.swipe);
    from = slidOf(row);
    style.removeProperty("--sheet-offset");
    style.setProperty("--sheet-swipe", swipe);
  }
  const frames = path({ sheetFrom: s.from, sheetTo: s.to, from, to, h0: h, h1: h });
  if (frames.length < 2 || frames.every((f) => Math.abs(f.y - from) < 0.5)) return;
  row.animate(
    frames.map((f) => ({ offset: f.u, transform: `translateY(${f.y}px)` })),
    { id: FOLLOW, duration: MOTION.drawer * 1000, easing: `cubic-bezier(${MOTION.drawerEase.join(",")})` },
  );
}

/**
 * The row's transform at the settle's progress `u` (0 to 1, the eased
 * progress), as key frames: its foot rides the sheet and stops where it
 * rests (down), or waits where it was until the sheet's place for it comes
 * (up), each a straight piece in the sheet's place, with a frame where they
 * meet. `from` and `to` are its transforms at either end, `h0` and `h1` its
 * heights, `sheetFrom` and `sheetTo` the sheet's slide. Exported for its
 * test.
 */
export function path(a: { sheetFrom: number; sheetTo: number; from: number; to: number; h0: number; h1: number }) {
  const span = a.sheetTo - a.sheetFrom;
  // Its foot on the screen at either end (less its place in the page, the same at both).
  const start = a.sheetFrom + a.from + a.h0;
  const rest = a.sheetTo + a.to + a.h1;
  const at = (u: number, foot: number) => ({ u, y: foot - (a.sheetFrom + span * u) - (a.h0 + (a.h1 - a.h0) * u) });
  let kink: number | null = null;
  if (span > 0 && rest >= start && rest - start <= span) kink = (rest - start) / span;
  else if (span < 0 && start >= rest && start - rest <= -span) kink = 1 - (start - rest) / -span;
  const frames = [{ u: 0, y: a.from }];
  if (kink !== null && kink > 0.001 && kink < 0.999) frames.push(at(kink, span > 0 ? rest : start));
  frames.push({ u: 1, y: a.to });
  return frames;
}
