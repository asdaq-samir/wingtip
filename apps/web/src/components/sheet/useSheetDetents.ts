import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { raisedFor, useSheetCards } from "../../lib/sheetCards";
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
/** The least body worth showing at half, rem: one row of a list (44
 *  points). Less is no body: the half ends at the head and the foot. */
const HALF_BODY_LEAST_REM = 2.75;
/** The first row's own band (the one search), 4.25 rem: the pill's height
 *  before it has been measured. */
const BAR_REM = 4.25;

const rootPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

interface Of {
  head: HTMLElement | null;
  foot: HTMLElement | null;
  /** The size laid out, and whether the sheet is on its way to one. */
  size: PanelState;
  moving: boolean;
  /** The pill is laid out (the size the pill's, and there is one). */
  atPill: boolean;
  footShown: boolean;
  /** What the pill is made of, which sets its height: one kept for each. */
  pillKey: string;
  /** Under the head and the foot at the pill, and at half and all the way. */
  pillChrome: number;
  halfChrome: number;
  /** How tall the sheet can be, px. */
  room: number;
  /** A desktop's side panel: the window's height out at either size. */
  sideOut: boolean;
}

/**
 * The sheet's three heights -- the pill, half and all the way up -- from
 * what it holds, measured at rest: the head's band, the figures at its
 * foot (smaller at half), and the pill as the pill. All the way up only
 * as far as a short card raised half way needs (a fix's card was a line
 * and an empty sheet up to the status bar). On a phone these are the
 * stock Drawer's snap points.
 */
export function useSheetDetents(of: Of) {
  const { head, foot, size, moving, atPill, footShown, pillKey, pillChrome, halfChrome, room, sideOut } = of;
  const [headHeight, setHeadHeight] = useState(0);
  const [footHeights, setFootHeights] = useState<{ half: number | null; other: number | null }>({ half: null, other: null });
  const [pills, setPills] = useState<Record<string, number>>({});
  const rest = useRef({ moving, size, atPill });
  useLayoutEffect(() => {
    rest.current = { moving, size, atPill };
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
  // The pill measured only as the pill at rest: measured while the sheet
  // was laid out for half, its head was once taken for the pill's.
  useEffect(() => {
    if (!atPill || moving || !head) return;
    const measure = () => {
      if (!rest.current.atPill || rest.current.moving) return;
      const h = Math.ceil(head.offsetHeight + (footShown && foot ? foot.offsetHeight : 0) + pillChrome);
      if (h > pillChrome) setPills((was) => (was[pillKey] === h ? was : { ...was, [pillKey]: h }));
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(head);
    if (footShown && foot) watch.observe(foot);
    return () => watch.disconnect();
  }, [atPill, moving, head, foot, footShown, pillChrome, pillKey]);

  // The top card's content's own height, where it is a card raised half
  // way: the sheet then goes no higher than it needs.
  const raised = useSheetCards((s) => raisedFor(s.stack));
  const host = useSheetCards((s) => s.host);
  const topCard = useSheetCards((s) => s.stack.at(-1)?.id ?? null);
  const [fit, setFit] = useState<{ id: string; px: number } | null>(null);
  useEffect(() => {
    if (!host || !topCard || raised !== "half") return;
    const card = [...host.querySelectorAll<HTMLElement>("[data-sheet-card]")].at(-1);
    if (!card) return;
    const seen = new ResizeObserver(() => {
      const last = card.lastElementChild as HTMLElement | null;
      if (last)
        setFit({ id: topCard, px: Math.ceil(last.offsetTop + last.offsetHeight + parseFloat(getComputedStyle(card).paddingBottom)) });
    });
    for (const part of card.children) seen.observe(part);
    return () => seen.disconnect();
  }, [host, topCard, raised]);
  const cardFit = raised === "half" && fit && fit.id === topCard ? fit.px : null;

  const footHalf = footShown ? (footHeights.half ?? footHeights.other ?? 0) : 0;
  const footFull = footShown ? (footHeights.other ?? footHeights.half ?? 0) : 0;
  const detents = useMemo<Detents>(() => {
    const rem = rootPx();
    const peek = pills[pillKey] ?? Math.round(BAR_REM * rem) + pillChrome;
    const whole = Math.max(peek, room);
    const asked = Math.max(peek, Math.min(Math.round(HALF_REM * rem) + halfChrome, Math.round(whole * HALF_MOST)));
    const body = asked - headHeight - halfChrome - footHalf;
    const half = body > 0 && body < HALF_BODY_LEAST_REM * rem ? Math.max(peek, asked - body) : asked;
    const full = cardFit === null ? whole : Math.max(Math.min(half, whole), Math.min(whole, headHeight + halfChrome + cardFit));
    return { peek, half: sideOut ? full : Math.min(half, full), full };
  }, [pills, pillKey, pillChrome, room, halfChrome, headHeight, footHalf, cardFit, sideOut]);

  return {
    detents,
    headHeight,
    footHalf,
    footFull,
    halfBody: Math.max(0, detents.half - headHeight - halfChrome - footHalf),
    fullBody: Math.max(0, detents.full - headHeight - halfChrome - footFull),
  };
}
