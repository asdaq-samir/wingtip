import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "cn";
import { useIsMobile } from "../hooks/use-mobile";
import { useIsDesktop } from "../hooks/use-desktop";
import { backOne } from "../hooks/use-shortcuts";
import { useNavEdge } from "../hooks/use-nav-edge";
import { useKeyboardInset, useSafeArea, useWindowHeight } from "../hooks/use-viewport";
import {
  GLASS,
  MATERIAL,
  BarOverPicture,
  PanelSize,
  PILL_RADIUS,
  SHEET_MARGIN,
  TabBarMinimized,
  useTabsShown,
  type MapInsets,
  type PanelState,
} from "../lib/mapChrome";
import { useOpenCards } from "../lib/openCards";
import { PillPicture } from "./PillPicture";
import { SheetCardHost } from "./SheetCard";
import { raisedFor, useSheetCards } from "../lib/sheetCards";
import TabKept from "./TabKept";
import { FLOAT_PX, type Detents } from "./sheet/engine";
import { useSheetMotion, type SheetParts } from "./sheet/useSheetMotion";

interface Props {
  /** The panel's name -- "Flight Planning", "Model Training" -- for its
   *  grabber and a screen reader. */
  label: string;
  /** The row over everything, always in sight: the route and the
   *  workspace's actions. */
  top: ReactNode;
  /** A top row kept while out of sight (the planner's route box): under
   *  another tab's head, a card alone or the pill it stays built, hidden,
   *  and is `top` again as it was left, as iOS keeps a tab's screen. */
  kept?: ReactNode;
  /** The row under it, in sight at rest too: the airplane and the
   *  departure time, the rating's progress. */
  controls?: ReactNode;
  /** What the panel holds at rest with no tab bar: a capsule's own row
   *  (the training route with a way to its options). With a bar the pill
   *  is the bar alone. */
  compact?: ReactNode;
  /** The body: the nav log and the briefing, the training list. */
  children: ReactNode;
  /** The planner's tab bar (TabBar), or the strip's ribbon: the sheet's
   *  first row, and at rest the pill itself. */
  bar?: ReactNode;
  /** What the panel is showing: a tab of the planner, a card open alone
   *  over it, or the console's layer (the Setup tab). */
  layer?: "tab" | "card" | "console";
  /** A card from another tab's world open over this one: on a phone the
   *  bar minimized to the card's kind with Back to the tab. */
  cardOver?: boolean;
  /** Pinned at the sheet's foot at every size: the route's figures, or
   *  the strip's one field -- in the pill its one row. */
  foot?: ReactNode;
  /** The body down to the sheet's own edge, over the home indicator's
   *  inset (PlaceCard). The inset's height is `--half-foot` to it. */
  toEdge?: boolean;
  /** The airplane flying the route (useFlyingMode): the tab bar, the top
   *  row and the controls put away, the pill its foot alone. */
  flying?: boolean;
  state: PanelState;
  onStateChange: (state: PanelState) => void;
  onInsetsChange: (insets: MapInsets) => void;
}

/** The half sheet's height, in rem, the same on every tab: FPL's route
 *  whole in it -- its box, its chips, the side view with the dry run's
 *  play, and the figures -- at the owner's ask ("Let's make the half card
 *  this tall", their iPhone's screenshot of the sheet 368 points tall). */
const HALF_REM = 23;
/** The most of all the way up the half sheet takes, so the two stay two
 *  sizes on a short screen (a phone on its side, 402 points). */
const HALF_MOST = 0.85;
/** The least body worth showing at half, rem: one row of a list (44
 *  points). Less is no body: the half ends at the head and the foot. */
const HALF_BODY_LEAST_REM = 2.75;
/** The grabber's row at the far edge of a card or a sheet from the top. */
const GRABBER = 16;
/** The first row's room under the grabber: ten points, the grabber's bar
 *  in it four from the edge (iOS's is five on a sheet, two on Maps' pill:
 *  one place at every size here). */
const ROW_PAD = "pt-2.5";
/** The sizes in order, for which way the panel last moved. */
const RANK: Record<PanelState, number> = { peek: 0, half: 1, full: 2 };

/** The root's font size, read once and again after a resize, a turn of
 *  the phone, or the page coming back to the front (a text size set in
 *  iOS's Settings reaches a page with no resize). */
let rootFont: number | null = null;
if (typeof window !== "undefined") {
  const forget = () => {
    rootFont = null;
  };
  window.addEventListener("resize", forget);
  window.addEventListener("pageshow", forget);
  document.addEventListener("visibilitychange", forget);
}
const rootPx = () => (rootFont ??= parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);

/** Under the head, the body and the foot a shade darker than the glass
 *  over them, the grey of notes and the blue of tappable words a step
 *  darker on it for WCAG's 4.5:1 (--tint-shade, index.css). */
const SHEET_BELOW =
  "[--muted-foreground:oklch(0.5_0_0)] [--tint:var(--tint-shade)] dark:[--muted-foreground:oklch(0.708_0_0)] print:bg-transparent";

/**
 * The page's one panel over the map, the way Maps on an iPhone has one:
 * the route and the workspace's actions always in sight, the airplane
 * and the departure time under them, and the workspace's own content
 * under those. A sheet on the navigation bar's edge with three detents
 * -- the pill (its first row), half the screen, all of it -- and a
 * grabber on its free edge: drag it, or the sheet anywhere a list is not
 * scrolling, and it lets go to a detent; tap the grabber and it cycles;
 * Escape lowers it. The screen's width on a phone; from `md` up 24 rem
 * wide at the left.
 *
 * Our own sheet again after a try of the stock one (Base UI's Drawer,
 * 100 KB on the first load), at the owner's ask (2026-11-04: "I just want
 * a simple top/bottom fixed sheet that moves smoothly to three
 * positions"): a bottom sheet or a top sheet by the pilot's Layout
 * (useNavEdge), held on its edge by its own style and laid out once at
 * its full height, so nothing about it is laid out again as it moves. It
 * is placed by one number, its height `h`, written straight to the style
 * (place): slid off its edge by full - h, a frame at a time under a
 * finger (useSheetDrag) and as one CSS transition in a settle, started in
 * the same frame the finger lets go -- never waiting for React, which
 * hears of the new size afterwards in a transition. What must stay in
 * sight at its free edge is moved back by the same number on those few
 * elements alone (pin): a bottom sheet's figures, the body cut off over
 * them, and a top sheet's head. The map's buttons ride its top by a
 * translate of their own (ride), the map follows once it has set off
 * (sheetturn, lib/map/sheetSlide's glide) and stays still under a finger,
 * and the page hears the room it leaves once it has landed
 * (onInsetsChange) -- all of that motion sheet/useSheetMotion's, the
 * measures and the drawing this file's. The rules each of today's bugs broke, kept: its edge
 * never leaves the screen's, nothing it does waits on a render, nothing
 * under it inherits a value that changes per frame, and the pill is
 * measured only as the pill at rest.
 */
export default function MapPanel({
  label,
  top,
  kept,
  controls,
  compact,
  children,
  state: pageState,
  onStateChange: tellPage,
  onInsetsChange: tellInsets,
  toEdge: edgeAsked = false,
  bar,
  layer = "tab",
  cardOver: overAsked = false,
  foot,
  flying = false,
}: Props) {
  const cardInPill = layer === "card";
  const cardOver = layer !== "console" && overAsked;
  // A card opened over whatever is here (SheetCard): the body's room its,
  // the head's row, the controls and the foot out of sight under it.
  const raised = useSheetCards((s) => raisedFor(s.stack));
  const cardsUp = raised !== null;
  // The top card's content's own height, where it is a card raised half
  // way: the sheet then goes no higher than it needs (the detents' full).
  const sheetHost = useSheetCards((s) => s.host);
  const topCard = useSheetCards((s) => s.stack.at(-1)?.id ?? null);
  const [measuredFit, setMeasuredFit] = useState<{ id: string; px: number } | null>(null);
  useEffect(() => {
    if (!sheetHost || !topCard || raised !== "half") return;
    const card = [...sheetHost.querySelectorAll<HTMLElement>("[data-sheet-card]")].at(-1);
    if (!card) return;
    const seen = new ResizeObserver(() => {
      const last = card.lastElementChild as HTMLElement | null;
      if (last)
        setMeasuredFit({
          id: topCard,
          px: Math.ceil(last.offsetTop + last.offsetHeight + parseFloat(getComputedStyle(card).paddingBottom)),
        });
    });
    for (const part of card.children) seen.observe(part);
    return () => seen.disconnect();
  }, [sheetHost, topCard, raised]);
  const cardFit = raised === "half" && measuredFit && measuredFit.id === topCard ? measuredFit.px : null;
  const toEdge = layer !== "console" && edgeAsked && !cardsUp;
  const onPhone = useIsMobile();
  const desktop = useIsDesktop();
  const edge = useNavEdge();
  const safe = useSafeArea();
  const windowHeight = useWindowHeight();
  // With the keyboard up, what it covers is not there: the sheet sits on
  // the keyboard, a field typed into in it in sight.
  const keyboard = useKeyboardInset();
  const fromBottom = edge === "bottom";
  const hasPill = !!bar || !!compact;
  // How tall it can be: eight points short of the far edge's inset.
  const floating = !onPhone && !fromBottom;
  const room = windowHeight - keyboard - Math.round(fromBottom ? safe.top : safe.bottom) - SHEET_MARGIN - (floating ? FLOAT_PX : 0);
  // A bottom sheet runs on to the screen's edge, under the home indicator
  // (or eight points where there is none), so its content sits clear of it.
  const edgeInset = fromBottom && !keyboard ? Math.max(Math.round(safe.bottom), SHEET_MARGIN) : 0;

  // The size the sheet shows: the page's, or the one it was sent to here
  // (a drag let go, the grabber, a tab's tap), told to the page once it
  // has landed -- told at once, the page drew the whole workspace again
  // for the new size as the sheet set off (140 ms at 4x).
  // The size the sheet shows: the page's, or the one it was sent to here
  // (a drag let go, the grabber, a tab's tap), told to the page once it
  // has landed (useSheetMotion).
  const [size, setSize] = useState(pageState);
  const sizeRef = useRef(size);
  // On its way: under a finger or easing to a size. What the workspace
  // draws for a sheet on the move, and the measures held till it rests.
  const [moving, setMoving] = useState(false);
  const movingRef = useRef(moving);
  const atPill = size === "peek" && hasPill;

  // Measured at rest: the head's band, the foot, and what the pill shows.
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  // The same node for the writes made outside render (place, the settle):
  // a state's value is not to be changed, a ref's may be.
  const panelRef = useRef<HTMLElement | null>(null);
  const setPanelNode = useCallback((node: HTMLElement | null) => {
    panelRef.current = node;
    setPanel(node);
  }, []);
  const [headBand, setHeadBandState] = useState<HTMLDivElement | null>(null);
  const [footNode, setFootNodeState] = useState<HTMLDivElement | null>(null);
  // The parts held in sight at the free edge (pin), written to directly.
  const parts = useRef<SheetParts>({ head: null, body: null, inner: null, foot: null });
  const setHeadBand = useCallback((node: HTMLDivElement | null) => {
    parts.current.head = node;
    setHeadBandState(node);
  }, []);
  const setFootNode = useCallback((node: HTMLDivElement | null) => {
    parts.current.foot = node;
    setFootNodeState(node);
  }, []);
  const setBodyNode = useCallback((node: HTMLDivElement | null) => {
    parts.current.body = node;
  }, []);
  const setInnerNode = useCallback((node: HTMLDivElement | null) => {
    parts.current.inner = node;
  }, []);
  const [headHeight, setHeadHeight] = useState(0);
  // The figures' height at half and at the other two sizes, each measured
  // at its own: smaller at half, where they are set small and the box
  // fits them, than at the pill and all the way up (the owner,
  // 2026-11-05); either the other's till it has been seen.
  const [footHeights, setFootHeights] = useState<{ half: number | null; other: number | null }>({ half: null, other: null });
  const halfLook = useRef<{ className: string; paddingBottom: string } | null>(null);
  const halfSeen = useRef(false);
  const [pillHeight, setPillHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!headBand) return;
    const watch = new ResizeObserver(() => {
      if (!movingRef.current) setHeadHeight(headBand.offsetHeight);
    });
    watch.observe(headBand);
    return () => watch.disconnect();
  }, [headBand]);
  useEffect(() => {
    if (!footNode) return;
    // Half's box measured before the sheet first comes to half, so the
    // list there is laid out for it at once, not for the larger box and
    // then again as the sheet rests: the box given half's look for the one
    // read and its own put back in the same task, so it is never drawn so.
    const measureHalf = (el: HTMLElement) => {
      const look = halfLook.current;
      if (!look) return null;
      const kept = { className: el.className, style: el.getAttribute("style") };
      el.className = look.className;
      el.style.transition = "none";
      el.style.setProperty("--sheet-progress", "0");
      el.style.paddingBottom = look.paddingBottom;
      // Rounded up, not to the nearest: a strip 61.5 tall read as 61 left
      // half's list running a point and a half under it.
      const h = Math.ceil(el.getBoundingClientRect().height);
      el.className = kept.className;
      if (kept.style === null) el.removeAttribute("style");
      else el.setAttribute("style", kept.style);
      return h;
    };
    const watch = new ResizeObserver(() => {
      const el = parts.current.foot;
      if (movingRef.current || !el) return;
      const at = sizeRef.current === "half" ? "half" : "other";
      const h = Math.ceil(el.getBoundingClientRect().height);
      const half = at === "other" && !halfSeen.current ? measureHalf(el) : null;
      if (half !== null) halfSeen.current = true;
      setFootHeights((was) => {
        const next = { ...was, [at]: h, ...(half !== null && was.half === null ? { half } : {}) };
        return next.half === was.half && next.other === was.other ? was : next;
      });
    });
    watch.observe(footNode);
    return () => watch.disconnect();
  }, [footNode]);

  // The figures pinned at the sheet's foot: in sight at every size but
  // under a card.
  const footShown = !!foot && !cardsUp;
  // The bar: the sheet's first row -- and the pill itself, unless the pill
  // is the figures (the tabs layout with a route) or the strip's field.
  const barShown = !!bar && !(onPhone && keyboard) && !flying;
  const pictureCard = useOpenCards((s) => s.picture);
  const tabsShown = useTabsShown((s) => s.shown);
  // A card from another tab over this one on a phone: the tab bar
  // minimized to the card's kind, as iOS's navigation bar is; a card from
  // a control or the chart (SheetCard) the same, its name on the bar.
  const minimized = cardOver || (onPhone && cardsUp);
  const barNamed = !!bar && barShown && minimized && cardsUp;
  useEffect(() => {
    useSheetCards.setState({ barNamed });
    return () => useSheetCards.setState({ barNamed: false });
  }, [barNamed]);
  // An airport's or an airplane's card draws its own head over its
  // picture out of the pill (PhotoHead): the minimized bar left out over
  // it, the grabber laid over the picture.
  const ownHead = pictureCard && layer === "card" && !cardsUp && !atPill && !tabsShown;
  const barHere = barShown && !ownHead && !(atPill && footShown);
  // In the pill, the card's name over its head's picture (PillPicture).
  const pill = useOpenCards((s) => s.pill);
  const pillPictured = !!pill && (pictureCard || !!pill.colour) && atPill && minimized && barHere && !tabsShown;
  // The head's row: in the pill only without a tab bar (whose pill is the
  // bar or the figures); out of it wherever there is a top row or no bar.
  const headerShown = !flying && !cardsUp && (atPill ? !bar : top != null || !barShown);
  const headContent = atPill ? compact : top;
  const keptHere = kept != null && headerShown && headContent === kept;

  // The pill's height, measured as the pill at rest: its head (the bar or
  // its own row), the figures where they are its row, and the grabber's
  // or the home indicator's room.
  const halfChrome = fromBottom ? edgeInset : GRABBER;
  // The pill ends at its row's foot, the line under a card's name or the
  // tabs' own band, as Maps' collapsed sheet does: the eight points kept
  // clear of an edge with no home indicator showed as a sliver of sheet
  // under that line in Safari, over its toolbar (the owner, 2026-11-08:
  // "taking it down up to the separator"). A home indicator's inset stays.
  const pillChrome = fromBottom ? (keyboard ? 0 : Math.round(safe.bottom)) : GRABBER;
  // Whether the sheet is laid out as the pill at rest this commit, set as
  // the commit is made: the observer below can fire after a commit that
  // laid the sheet out for half, before this effect's cleanup has run,
  // and took the half's head for the pill's -- a 236-point pill the sheet
  // settled to and then jumped from (the drag probe, 2026-11-04).
  const pillLaid = useRef(false);
  useLayoutEffect(() => {
    pillLaid.current = atPill && !moving;
  }, [atPill, moving]);
  // What the pill is made of, which sets its height: the figures, or the
  // tab bar, or a card's name -- one height kept for each as it is
  // measured (pillHeights), so a sheet coming down on another tab or
  // with a card lands at that pill's own height. It landed at the last
  // one measured, FPL's figures' 62, and then hopped to the tabs' 68 (or
  // a card's name's 65) as the pill was measured at rest: a second move,
  // the settle 615-681 ms where it is 260-280 (the FPL audit's B1).
  const pillKey = [footShown, layer, cardOver, cardsUp, !!bar && barShown, top != null, pictureCard, !!pill, flying].join("|");
  // The tabs alone, the bar's own fixed 4.25 rem band (below): known
  // before it is first measured.
  const tabsAlone = !!bar && barShown && !footShown && !cardsUp && !cardOver && !flying;
  const [pillHeights, setPillHeights] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!atPill || moving || !headBand) return;
    const measure = () => {
      if (!pillLaid.current || movingRef.current) return;
      const h = Math.ceil(headBand.offsetHeight + (footShown && footNode ? footNode.offsetHeight : 0) + pillChrome);
      setPillHeight(h);
      setPillHeights((was) => (was[pillKey] === h ? was : { ...was, [pillKey]: h }));
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(headBand);
    if (footShown && footNode) watch.observe(footNode);
    return () => watch.disconnect();
  }, [atPill, moving, headBand, footNode, footShown, pillChrome, pillKey]);

  const footHalf = footHeights.half ?? footHeights.other ?? 0;
  const footFull = footHeights.other ?? footHeights.half ?? 0;
  // Where it comes to rest: the pill, half and all the way up, in px.
  const detents = useMemo<Detents>(() => {
    const tabsPill = Math.round(4.25 * rootPx()) + pillChrome;
    const peek = pillHeights[pillKey] ?? (tabsAlone ? tabsPill : (pillHeight ?? tabsPill));
    const whole = Math.max(peek, room);
    const askedHalf = Math.max(peek, Math.min(Math.round(HALF_REM * rootPx()) + halfChrome, Math.round(whole * HALF_MOST)));
    const body = askedHalf - headHeight - halfChrome - footHalf;
    const half = body > 0 && body < HALF_BODY_LEAST_REM * rootPx() ? Math.max(peek, askedHalf - body) : askedHalf;
    // All the way up only as far as a short card on top needs (cardFit):
    // a fix's card was a line and an empty sheet up to the status bar.
    const full = cardFit === null ? whole : Math.max(Math.min(half, whole), Math.min(whole, headHeight + halfChrome + cardFit));
    // On a desktop the panel out is a side panel, the window's height at
    // either size, as a desktop web app's sidebar is: a half-height card
    // left two thirds of the column empty map (the UI audit, 2026-11-09).
    return { peek, half: desktop ? full : Math.min(half, full), full };
  }, [pillHeight, pillHeights, pillKey, tabsAlone, pillChrome, room, halfChrome, headHeight, footHalf, cardFit, desktop]);
  const halfBody = Math.max(0, detents.half - headHeight - halfChrome - footHalf);
  const fullBody = Math.max(0, detents.full - headHeight - halfChrome - footFull);

  // Its motion (useSheetMotion): placed by its height, eased to a size in
  // a settle, dragged a frame at a time, and the room it leaves told.
  // Landed, the head and the figures measured at rest at the size it came
  // to: half's own, or the other two's.
  const landed = useCallback(
    (target: PanelState) => {
      if (headBand) setHeadHeight(headBand.offsetHeight);
      if (footNode) {
        const at = target === "half" ? "half" : "other";
        const h = footNode.offsetHeight;
        setFootHeights((was) => (was[at] === h ? was : { ...was, [at]: h }));
      }
    },
    [headBand, footNode],
  );
  const { ask, startDrag, swallow, dragBody } = useSheetMotion({
    size,
    setSize,
    sizeRef,
    moving,
    setMoving,
    movingRef,
    detents,
    pageState,
    tellPage,
    tellInsets,
    onPhone,
    wide: desktop,
    fromBottom,
    floating,
    footShown,
    safeTop: safe.top,
    panel,
    panelRef,
    partsRef: parts,
    pillHeight,
    atPill,
    landed,
  });
  const setBody = useCallback(
    (node: HTMLDivElement | null) => {
      setBodyNode(node);
      dragBody(node);
    },
    [setBodyNode, dragBody],
  );

  // Escape lowers it, pressed anywhere in it -- but not in a menu or a
  // list it opened, which closes first.
  const expanded = size !== "peek";
  useEffect(() => {
    if (!panel || !expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // On a desktop the side panel stays out: Escape goes back one level
      // by its close, as a web app's Escape does (useShortcuts' backOne);
      // only with nothing to go back from does it lower the panel.
      event.preventDefault();
      if (desktop && backOne(panel.ownerDocument)) return;
      ask("peek", true);
    };
    panel.addEventListener("keydown", onKey);
    return () => panel.removeEventListener("keydown", onKey);
  }, [panel, expanded, ask, desktop]);

  // Half way the body is laid out at its full height and cut off at the
  // sheet's edge, as Apple Maps' is: what is under that edge is reached
  // by pulling the sheet up, not by scrolling (the owner, 2026-11-05). A
  // row reached by the keyboard or VoiceOver under the edge would be
  // focused out of sight, so focus there brings the sheet all the way up;
  // so does a row the page asks to show (a "sheetreveal" event from it,
  // as the Stops' row of a pin tapped on the map).
  // Measured against where the sheet is going (sizeRef, set as a settle
  // starts), not where it is this frame: a pin's tap sends it up from the
  // pill and asks for its row in the same moment. A bottom sheet's content
  // goes with it, so the row is measured from its top; a top sheet's
  // content stays put (pin) and its edge is the height from the screen's top.
  // Half's figures are pinned over the body at its foot: a row behind them
  // is out of sight too.
  const halfEdge = detents.half - (footShown ? footHalf : 0);
  useEffect(() => {
    if (!panel) return;
    const reveal = (event: Event) => {
      if (sizeRef.current !== "half") return;
      if (!(event.target instanceof Element) || !event.target.closest("[data-panel-body]")) return;
      const row = event.target.getBoundingClientRect().bottom;
      const below = fromBottom ? row - panel.getBoundingClientRect().top : row;
      if (below > halfEdge + 1) ask("full", true);
    };
    panel.addEventListener("focusin", reveal);
    panel.addEventListener("sheetreveal", reveal);
    return () => {
      panel.removeEventListener("focusin", reveal);
      panel.removeEventListener("sheetreveal", reveal);
    };
  }, [panel, fromBottom, ask, halfEdge]);

  // Scrolled up, a page's content runs on under the head and is seen
  // through it (--head-room, the under-head utility); while there is
  // content under the head, the head is frosted over it (data-under).
  const under = !atPill;
  useEffect(() => {
    if (!headBand || !panel || !under) return;
    const frost = (scroller: Element | undefined) => {
      if (scroller && scroller.scrollTop > 0) headBand.setAttribute("data-under", scroller.hasAttribute("data-local-head") ? "local" : "");
      else headBand.removeAttribute("data-under");
    };
    const onScroll = (event: Event) => {
      const at = event.target;
      if (at instanceof HTMLElement && at.classList.contains("under-head") && panel.contains(at)) frost(at);
    };
    const frame = requestAnimationFrame(() =>
      frost([...panel.querySelectorAll<HTMLElement>(".under-head")].find((el) => el.checkVisibility?.() ?? el.offsetParent !== null)),
    );
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", onScroll, { capture: true });
      headBand.removeAttribute("data-under");
    };
  }, [headBand, panel, under, label, cardOver, layer, cardsUp]);

  // A card opened comes up half way at the least, all the way for a
  // search; the last put away, the panel goes back to where it was.
  const raisedFrom = useRef<PanelState | null>(null);
  const heldAt = useRef<PanelState | null>(null);
  useEffect(() => {
    if (raised) heldAt.current = size;
  });
  useEffect(() => {
    const now = sizeRef.current;
    if (raised) {
      raisedFrom.current ??= now;
      if (RANK[now] < RANK[raised]) ask(raised);
    } else if (raisedFrom.current !== null) {
      const back = raisedFrom.current;
      raisedFrom.current = null;
      if (back !== now && now === heldAt.current) ask(back);
    }
  }, [raised, ask]);

  // The panel's size on <body> as well, for the stylesheet's rules about
  // what else is over the map (index.css). Each set on its own.
  useLayoutEffect(() => {
    document.body.dataset.mapPanel = size;
    return () => {
      delete document.body.dataset.mapPanel;
    };
  }, [size]);
  useLayoutEffect(() => {
    document.body.toggleAttribute("data-map-sheet", onPhone);
    return () => document.body.removeAttribute("data-map-sheet");
  }, [onPhone]);

  const panelSize = useMemo(() => ({ size, to: ask, card: cardInPill }), [size, ask, cardInPill]);
  // A tap on the grabber cycles the three heights, small to big and back:
  // from half it goes on the way the panel last moved. The arrow keys
  // step it, for a keyboard and VoiceOver.
  const [was, setWas] = useState(size);
  const [rising, setRising] = useState(true);
  if (size !== was) {
    setWas(size);
    setRising(RANK[size] > RANK[was]);
  }
  const cycle = () => ask(size === "peek" || size === "full" ? "half" : rising ? "full" : "peek", true);
  const arrows = (event: ReactKeyboardEvent) => {
    if (event.key === "ArrowUp" && size !== "full") ask(size === "peek" ? "half" : "full", true);
    else if (event.key === "ArrowDown" && size !== "peek") ask(size === "full" ? "half" : "peek", true);
    else return;
    event.preventDefault();
  };

  // Where the panel's top-right button sits, one place in every panel
  // (--corner-line, --corner-inset).
  const headPad = fromBottom ? "0.25rem" : "max(0.5rem, env(safe-area-inset-top))";
  const bodyPad = fromBottom ? "0px" : "env(safe-area-inset-top)";
  const vars = {
    "--corner-line": "calc((2.5625rem - 36px) / 2)",
    "--corner-inset": `calc(${headPad} - ${bodyPad} + (2.5625rem - 36px) / 2)`,
  } as CSSProperties;

  // iOS's grabber: 36 by 5 in a button a little wider, over the first
  // row's own room at the sheet's free edge: the top of a bottom sheet,
  // the foot of a top sheet; tapped it cycles the heights, and it is what
  // a keyboard and VoiceOver use. Its hit area stops at the first row,
  // whose tabs have their own 44 points.
  const grabber = (
    <button
      type="button"
      aria-label={label}
      aria-expanded={expanded}
      data-testid="sidebar-trigger-button"
      onClick={cycle}
      onKeyDown={arrows}
      onPointerDown={(event) => {
        event.stopPropagation();
        startDrag(event);
      }}
      className={cn(
        "absolute inset-x-0 z-30 mx-auto flex w-24 touch-none justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset print:hidden",
        "after:inset-x-0! after:top-0! after:bottom-0!",
        fromBottom ? "top-0 h-2.5 items-start pt-1" : "bottom-0 h-4 items-end pb-[5px]",
      )}
    >
      <span
        className={cn(
          "h-[5px] w-9 rounded-full",
          ownHead || pillPictured ? "bg-white/75 shadow-[0_0_3px_rgba(0,0,0,.5)]" : "bg-muted-foreground/40",
        )}
        aria-hidden="true"
      />
    </button>
  );
  const restingPill = atPill && !moving;
  // The figures' box at a size: its classes and style, for the box as it
  // is drawn and for half's measured before the sheet is first there.
  const footLook = (at: PanelState) => {
    const pillHere = at === "peek" && hasPill;
    return {
      className: cn(
        // One box at the pill and all the way up, the figures centred in
        // it at their large size: the row's 44 and its padding, the line
        // over it clear in the pill. At half the figures small and the box
        // only as tall as they are, for the list over it (the owner,
        // 2026-11-05: "The calculations strip at the bottom should shrink
        // to fit the small text while in medium detent"). What gives way
        // in the pill (data-pill-hides) is put away there.
        // A top sheet's grabber over its last 16 points (bottom-0 h-4): room
        // for it under the figures at half, which it sat on at their small
        // size there; the pill's and full's are centred in a taller box.
        "flex shrink-0 flex-col justify-center border-t print:hidden",
        fromBottom || at !== "half" ? "pb-1" : "pb-4",
        at === "half" ? "min-h-0" : "min-h-[3.875rem]",
        ROW_PAD,
        cardInPill ? "px-0" : "px-4",
        !footShown && "hidden",
        // In the pill the finger is the sheet's (touch-none), as on the
        // tabs: the browser's own scroll took it and cancelled the drag.
        pillHere ? "touch-none border-transparent [&_[data-pill-hides]]:hidden [&>*]:flex-none" : cn("border-border/60", SHEET_BELOW),
      ),
      style: {
        "--sheet-progress": at === "half" && !desktop ? "0" : "1",
        ...(toEdge && fromBottom && !pillHere ? { paddingBottom: Math.max(10, edgeInset) } : {}),
      } as CSSProperties,
    };
  };
  // Half's look for the box, for its measure before the sheet is first
  // there (the foot's observer, above).
  useLayoutEffect(() => {
    const look = footLook("half");
    halfLook.current = { className: look.className, paddingBottom: "paddingBottom" in look.style ? `${look.style.paddingBottom}px` : "" };
  });

  return (
    <section
      ref={setPanelNode}
      data-slot="map-panel"
      data-panel={size}
      {...(onPhone ? { "data-sheet": "" } : {})}
      aria-label={label}
      onClickCapture={swallow}
      data-capsule={restingPill || undefined}
      // Its three heights, for a probe or a test to read.
      data-detents={`${detents.peek},${detents.half},${detents.full}`}
      style={
        {
          ...vars,
          // Held on its edge, on the keyboard while it is up; laid out
          // once at its full height and slid (place).
          ...(fromBottom ? { bottom: keyboard } : { top: floating ? FLOAT_PX : 0 }),
          height: detents.full,
          borderRadius: floating
            ? PILL_RADIUS
            : fromBottom
              ? `${PILL_RADIUS}px ${PILL_RADIUS}px 0 0`
              : `0 0 ${PILL_RADIUS}px ${PILL_RADIUS}px`,
        } as CSSProperties
      }
      className={cn(
        // Clipped rather than hidden: a hidden overflow can still be
        // scrolled by a script, and a row brought into view in the
        // body scrolled the whole panel, its head up out of sight.
        "fixed z-40 flex flex-col overflow-clip text-foreground outline-none will-change-transform print:static",
        // Liquid Glass at every size, as Maps' is: the chart through
        // it, blurred, the same pane whether it is the pill or the sheet.
        onPhone ? GLASS : MATERIAL,
        onPhone
          ? "inset-x-0"
          : cn(
              // A card at the left from a tablet's width, a side panel with
              // room for a desktop's type from 1024 (design/tokens.json
              // size.panel, panel-wide; the UI audit, 2026-11-09).
              "left-[max(1rem,env(safe-area-inset-left))] w-(--size-panel) lg:w-(--size-panel-wide) ring-1 ring-black/5 dark:ring-white/10",
              // Floating, its edge drawn inside: the clip at its top (place)
              // cuts whatever is outside its box, a ring's or a shadow's.
              floating ? "ring-inset" : "shadow-float",
            ),
      )}
    >
      {pillPictured && pill && <PillPicture pill={pill} />}
      {fromBottom && grabber}
      {/* The head's band: the first row (the bar), the top row, any
                notice, the controls. Over the body, which runs on up under
                it (`under`): frosted while anything is there. */}
      <div
        ref={setHeadBand}
        data-head-band=""
        onPointerDown={startDrag}
        className={cn("relative flex shrink-0 touch-none flex-col", under && "z-20", !fromBottom && "pt-[env(safe-area-inset-top)]")}
      >
        {bar && (
          <div
            className={cn(
              // The grabber's band, the tabs 52 tall, six under them: the
              // tab up's capsule clear of the grabber and of the search
              // under it (the owner, 2026-11-04: 49 points "too
              // congested", "make the space around the tabs slick like
              // the grabber and the search bar"); minimized to a card's
              // name, as tall as the name's 44-point area, a line under it,
              // 16 over it rather than the band's 10: the name's 44 are
              // centred on its 32, so 6 run up, and they start where the
              // grabber's 10 stop (the iOS audit's P1, "lost 3",
              // 2026-11-05).
              "flex shrink-0 px-2",
              minimized ? "min-h-11 border-b border-border/60 pt-4 pb-2" : cn(ROW_PAD, "h-[4.25rem] pb-1.5"),
              !barHere && "hidden",
            )}
          >
            <TabBarMinimized.Provider value={minimized}>
              <BarOverPicture.Provider value={pillPictured}>
                <PanelSize.Provider value={panelSize}>{bar}</PanelSize.Provider>
              </BarOverPicture.Provider>
            </TabBarMinimized.Provider>
          </div>
        )}
        {/* Under the tab bar, the route's box and its buttons a shade
                  darker (SHEET_BELOW), for the clear glass to stand off it. */}
        <div className={cn("relative flex flex-col", bar && barHere && !atPill && SHEET_BELOW, !headerShown && kept == null && "hidden")}>
          {(headerShown || kept != null) && (
            <header
              className={
                !headerShown
                  ? "contents"
                  : cn(
                      "@container flex items-center gap-2 print:hidden",
                      atPill ? cn("px-[9px] pb-3", ROW_PAD) : top == null ? undefined : cn("px-3 pb-1", barHere ? "pt-1" : ROW_PAD),
                    )
              }
            >
              {/* The kept row first, in the one place whatever is shown,
                        so it is never built again; out of sight inert and not
                        laid out (tab-away). */}
              {kept != null && (
                <div className={keptHere ? "contents" : "tab-away pointer-events-none absolute"} inert={!keptHere}>
                  {kept}
                </div>
              )}
              {headerShown && !keptHere && headContent}
            </header>
          )}
          {headerShown && !atPill && controls && (
            <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-3 px-3 pt-1 print:hidden", fromBottom ? "pb-1.5" : "pb-5")}>
              {controls}
            </div>
          )}
        </div>
      </div>
      {/* The body, laid out at every size and cut off where the sheet
                ends: over a bottom sheet's figures by a translate, its
                content moved back by the same. At rest in the pill out of
                sight and of the keyboard's reach. */}
      <div
        ref={setBody}
        className={cn(
          // No line over it at rest, on any tab: the head draws its own
          // while content is scrolled under it (index.css, data-under),
          // as iOS's sheets do (the owner, 2026-11-05: "why is there a
          // separator for all the tabs?", then "Ok").
          "flex min-h-0 flex-1 flex-col",
          expanded && !fromBottom && "pb-4",
          SHEET_BELOW,
          restingPill && "invisible",
        )}
        inert={restingPill}
        // The sizes the body's content is laid out to: changed as it
        // sets off and at rest, never per frame.
        style={
          {
            "--half-body": `${halfBody}px`,
            "--full-body": `${fullBody}px`,
            "--half-foot": `${toEdge && fromBottom ? halfChrome : 0}px`,
            "--head-room": `${under ? headHeight : 0}px`,
            "--foot-room": `${footShown ? (size === "half" ? footHalf : footFull) : 0}px`,
            "--panel-head": `${under ? headHeight : 0}px`,
          } as CSSProperties
        }
        data-panel-body=""
      >
        <div ref={setInnerNode} className="flex min-h-0 flex-1 flex-col">
          <TabKept away={cardsUp}>{children}</TabKept>
          <SheetCardHost shown={cardsUp} />
        </div>
      </div>
      {/* The route's figures, or the strip's field, pinned at the
                sheet's foot at every size: in the pill its one row. Kept
                under a card, out of sight, with what it holds open. */}
      {!!foot && (footShown || cardsUp) && (
        // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-static-element-interactions -- a pointer convenience, not a control: the grabber is the keyboard's way to open the sheet, and the figures' own buttons stay focusable
        <div
          ref={setFootNode}
          className={footLook(size).className}
          style={footLook(size).style}
          data-testid="panel-foot"
          // In the pill a finger anywhere on it drags the sheet, as
          // the tabs do; a tap on it opens it half way.
          onPointerDown={atPill ? startDrag : undefined}
          onClick={atPill ? () => ask("half", true) : undefined}
        >
          {foot}
        </div>
      )}
      {!fromBottom && grabber}
      {/* The rest of the way to the screen's edge, under the home
                indicator -- in the body where it runs to the edge (toEdge). */}
      {!toEdge && edgeInset > 0 && <div className="shrink-0" style={{ height: edgeInset }} aria-hidden="true" />}
    </section>
  );
}
