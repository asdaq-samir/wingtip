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
/** The first row's own band (the one search, SheetParts' barRowPad): 68
 *  under the title, 76 alone under a bottom sheet's grabber; and the
 *  route's figures at the foot (their box's least height, SheetParts):
 *  the pill is made of these. */
const BAR_REM = 4.25;
const BAR_ALONE_REM = 4.75;
const FOOT_REM = 3.875;
/** The title row over the search (SheetParts): the app's name and the
 *  account button, in the pill too, as Apple Maps' on the web -- 46 tall
 *  and ten under the grabber, so with the 46-point field under it the pill
 *  is 124, Apple Maps' own (the sheet audit's F-P2, 2026-11-10). */
const TITLE_REM = 3.5;

const rootPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

interface Of {
  head: HTMLElement | null;
  foot: HTMLElement | null;
  /** The size laid out, and whether the sheet is on its way to one. */
  size: PanelState;
  moving: boolean;
  /** The pill's parts: the first row (none while flying) and the figures. */
  barInPill: boolean;
  /** The title row over the first row, in the pill too. */
  titleInPill?: boolean;
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
}

/**
 * The sheet's three heights -- the pill, half and all the way up -- fixed
 * by what each is made of, as the stock Drawer's snap points: the pill its
 * first row and the figures, half 23 rem, all the way the room there is
 * (the owner, 2026-11-10: the stock sheet as it is, where each height was
 * measured from what the sheet held). The head's and the foot's own
 * heights are measured for the body's layout alone.
 */
export function useSheetDetents(of: Of) {
  const {
    head,
    foot,
    size,
    moving,
    barInPill,
    titleInPill = false,
    grabberOver = false,
    footShown,
    pillChrome,
    halfChrome,
    room,
    sideOut,
  } = of;
  const [headHeight, setHeadHeight] = useState(0);
  const [footHeights, setFootHeights] = useState<{ half: number | null; other: number | null }>({ half: null, other: null });
  const rest = useRef({ moving, size });
  useLayoutEffect(() => {
    rest.current = { moving, size };
  });

  useEffect(() => {
    if (!head) return;
    const watch = new ResizeObserver(() => {
      if (!rest.current.moving) setHeadHeight(head.offsetHeight);
    });
    watch.observe(head);
    return () => watch.disconnect();
  }, [head]);
  useEffect(() => {
    if (!foot) return;
    const watch = new ResizeObserver(() => {
      if (rest.current.moving) return;
      const at = rest.current.size === "half" ? "half" : "other";
      const h = Math.ceil(foot.getBoundingClientRect().height);
      setFootHeights((was) => (was[at] === h ? was : { ...was, [at]: h }));
    });
    watch.observe(foot);
    return () => watch.disconnect();
  }, [foot, size]);

  const footHalf = footShown ? (footHeights.half ?? footHeights.other ?? 0) : 0;
  const footFull = footShown ? (footHeights.other ?? footHeights.half ?? 0) : 0;
  const detents = useMemo<Detents>(() => {
    const rem = rootPx();
    const alone = grabberOver ? BAR_ALONE_REM : BAR_REM;
    const bar = barInPill || !footShown ? (titleInPill ? BAR_REM + TITLE_REM : alone) : 0;
    const peek = Math.round((bar + (footShown ? FOOT_REM : 0)) * rem) + pillChrome;
    const full = Math.max(peek, room);
    const half = Math.max(peek, Math.min(Math.round(HALF_REM * rem) + halfChrome, Math.round(full * HALF_MOST)));
    return { peek, half: sideOut ? full : half, full };
  }, [barInPill, titleInPill, grabberOver, footShown, pillChrome, room, halfChrome, sideOut]);

  return {
    detents,
    headHeight,
    footHalf,
    footFull,
    halfBody: Math.max(0, detents.half - headHeight - halfChrome - footHalf),
    fullBody: Math.max(0, detents.full - headHeight - halfChrome - footFull),
  };
}
