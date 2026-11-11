import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PanelState } from "../../lib/mapChrome";
import type { Detents } from "./insets";

/** The half sheet's height, in rem, the same everywhere: FPL's route whole
 *  in it -- its box, its chips, the side view with the dry run's play, and
 *  the figures -- at the owner's ask ("Let's make the half card this
 *  tall", their iPhone's screenshot of the sheet 368 points tall). */
const HALF_REM = 23;
/** The most of all the way up the half sheet takes, so the two stay two
 *  sizes on a short screen (a phone on its side, 402 points). */
const HALF_MOST = 0.85;
/** The first row's own band (the one search, SheetParts' barRowPad): 68,
 *  76 under a bottom sheet's grabber; and the route's figures at the foot
 *  (their box's least height, SheetParts): the pill is made of these. No
 *  title row over the search any more, the app's name and mark taken out
 *  for the map's room (the owner, 2026-11-10). */
const BAR_REM = 4.25;
const BAR_ALONE_REM = 4.75;
const FOOT_REM = 3.875;

const rootPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

interface Of {
  foot: HTMLElement | null;
  /** The size laid out: the Drawer's snap point. */
  size: PanelState;
  /** The pill's parts: the first row (none while flying) and the figures. */
  barInPill: boolean;
  /** A bottom sheet's grabber over the first row. */
  grabberOver?: boolean;
  footShown: boolean;
  /** Under the head and the foot at the pill, and at half and all the way. */
  pillChrome: number;
  halfChrome: number;
  /** How tall the sheet can be, px. */
  room: number;
  /** A desktop's side panel: the window's height out at either size. */
  sideOut: boolean;
  /** Over the body at a top sheet's top: the status bar's inset. */
  topInset: number;
}

/**
 * The sheet's three heights -- the pill, half and all the way up -- fixed
 * by what each is made of, as the stock Drawer's snap points: the pill its
 * first row and the figures, half 23 rem, all the way the room there is
 * (the owner, 2026-11-10: the stock sheet as it is, where each height was
 * measured from what the sheet held). The foot's own height, the route's
 * figures, is measured for the body's room at half alone; the head is never
 * measured: it is sticky in the body's one scroller (SheetParts), and what
 * scrolls passes under it by the browser's own layout.
 */
export function useSheetDetents(of: Of) {
  const { foot, size, barInPill, grabberOver = false, footShown, pillChrome, halfChrome, room, sideOut, topInset } = of;
  const [footHeights, setFootHeights] = useState<{ half: number | null; other: number | null }>({ half: null, other: null });
  const rest = useRef(size);
  useLayoutEffect(() => {
    rest.current = size;
  });

  useEffect(() => {
    if (!foot) return;
    const at = size === "half" ? "half" : "other";
    const id = requestAnimationFrame(() => {
      const h = Math.ceil(foot.getBoundingClientRect().height);
      setFootHeights((was) => (was[at] === h ? was : { ...was, [at]: h }));
    });
    return () => cancelAnimationFrame(id);
  }, [foot, size]);
  useEffect(() => {
    if (!foot) return;
    const watch = new ResizeObserver(() => {
      const at = rest.current === "half" ? "half" : "other";
      const h = Math.ceil(foot.getBoundingClientRect().height);
      setFootHeights((was) => (was[at] === h ? was : { ...was, [at]: h }));
    });
    watch.observe(foot);
    return () => watch.disconnect();
  }, [foot, size]);

  const footHalf = footShown ? (footHeights.half ?? footHeights.other ?? 0) : 0;
  const detents = useMemo<Detents>(() => {
    const rem = rootPx();
    const alone = grabberOver ? BAR_ALONE_REM : BAR_REM;
    const bar = barInPill || !footShown ? alone : 0;
    const peek = Math.round((bar + (footShown ? FOOT_REM : 0)) * rem) + pillChrome;
    const full = Math.max(peek, room);
    const half = Math.max(peek, Math.min(Math.round(HALF_REM * rem) + halfChrome, Math.round(full * HALF_MOST)));
    return { peek, half: sideOut ? full : half, full };
  }, [barInPill, grabberOver, footShown, pillChrome, room, halfChrome, sideOut]);

  return {
    detents,
    footHalf,
    // The body's room at half under a card, which has the sheet to itself
    // (no search over it), for a card fitted to it (ProfileCard, PastFlightCard).
    halfBody: Math.max(0, detents.half - halfChrome - footHalf - topInset),
  };
}
