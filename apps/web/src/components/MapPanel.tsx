import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Drawer } from "@base-ui/react/drawer";
import { cn } from "cn";
import { useIsMobile } from "../hooks/use-mobile";
import { useIsDesktop } from "../hooks/use-desktop";
import { backOne } from "../hooks/use-shortcuts";
import { useNavEdge } from "../hooks/use-nav-edge";
import { useSafeArea, useWindowHeight } from "../hooks/use-viewport";
import { GLASS_SHEET, MATERIAL, PILL_RADIUS, SHEET_MARGIN, usePanelDragging, type MapInsets, type PanelState } from "../lib/mapChrome";
import { cardsOpen, raisedFor, useSheetCards } from "../lib/sheetCards";
import { FLOAT_PX, insetsOf, type Detents, type SheetTurn } from "./sheet/insets";
import { useSheetDetents } from "./sheet/useSheetDetents";
import { prefersReducedMotion } from "../lib/motion";
import { useSheetLife } from "./sheet/useSheetLife";
import { useCardRaise } from "./sheet/useCardRaise";
import { CUT_TOP, FOLLOW, SHEET_BELOW, SheetGrabber, SheetParts, type PartsProps } from "./sheet/SheetParts";
import { CardStack, type StackProps } from "./sheet/CardStack";
import { SheetDrawer } from "./sheet/SheetDrawer";
import type { SheetPages } from "./sheet/SheetPager";

interface Props {
  /** The panel's name -- "Flight Planning", "Model Training" -- for its
   *  grabber and a screen reader. */
  label: string;
  /** The row over everything, always in sight: the route and the
   *  workspace's actions. */
  top: ReactNode;
  /** A top row kept while out of sight (the planner's route box): under a
   *  card alone or the pill it stays built, hidden, and is `top` again as
   *  it was left, as iOS keeps a tab's screen. */
  kept?: ReactNode;
  /** The row under it, in sight at rest too: the airplane and the
   *  departure time, the rating's progress. */
  controls?: ReactNode;
  /** What the panel holds at rest with no first row (`bar`): a capsule's
   *  own row. With a bar the pill is the bar alone. */
  compact?: ReactNode;
  /** The body: the nav log and the briefing, the training list. */
  children: ReactNode;
  /** The planner's one search, the developer's places (DevBar): the
   *  sheet's first row, and at rest the pill itself. */
  bar?: ReactNode;
  /** What the panel is showing: the workspace, a card open alone over it,
   *  or the console's layer (the account page). */
  layer?: "tab" | "card" | "console";
  /** A card from elsewhere open over the workspace. */
  cardOver?: boolean;
  /** Pinned at the sheet's foot at every size: the route's figures -- in
   *  the pill its one row. */
  foot?: ReactNode;
  /** The body down to the sheet's own edge, over the home indicator's
   *  inset (PlaceCard). */
  toEdge?: boolean;
  /** The airplane flying the route (useFlyingMode): the first row, the top
   *  row and the controls put away, the pill its foot alone. */
  flying?: boolean;
  /** The sheet's two pages, Search and FPL, side by side and swiped between
   *  (the owner, 2026-11-11): the first the search and `children`, the
   *  second the top row and its own body (SheetPager). */
  pages?: SheetPages;
  state: PanelState;
  onStateChange: (state: PanelState) => void;
  onInsetsChange: (insets: MapInsets) => void;
}

/** The grabber's row at the far edge of a top sheet or the side panel. */
const GRABBER = 16;

/**
 * The page's one panel over the map, the way Maps on an iPhone has one:
 * the one search first, the route and the workspace's actions under it,
 * and the workspace's own content under those.
 *
 * On a phone it is Base UI's stock Drawer (the owner, 2026-11-10: the
 * stock sheet with its own motion, gestures and behaviour): open and
 * non-modal, so the map stays the map's; the pill, half and all the way
 * up its snap points in px; a bottom or a top sheet by the pilot's Layout
 * (swipeDirection down or up). The Drawer follows the finger, reads the
 * throw, picks the snap point and eases there on its own curve; a swipe
 * past the pill is refused and lands on the pill. What the stock sheet
 * leaves to its user is a thin layer here: the parts held in sight at its
 * free edge (by the Drawer's own CSS variables, SheetParts), the room over
 * its top where the radio's and the map's buttons ride it (OnSheetTop), the room it
 * leaves the map (insetsOf, told as it sets off and once it has landed)
 * and its fixed heights (useSheetDetents). The cards over it are its own
 * nested drawers (CardStack); the keyboard's inset is the Drawer's
 * (VirtualKeyboardProvider), and a throw moves it one size
 * (snapToSequentialPoints, the owner's "one size per throw").
 *
 * From `md` up it is a side panel instead, a plain region at the left the
 * window's height while it is out and its head alone at rest, the map
 * beside it -- not a sheet.
 */
export default function MapPanel(props: Props) {
  const { label, top, kept, controls, compact, children, bar, foot, flying = false, layer = "tab" } = props;
  const onPhone = useIsMobile();
  const desktop = useIsDesktop();
  const fromBottom = useNavEdge() === "bottom";
  const safe = useSafeArea();
  const windowHeight = useWindowHeight();
  const bottomSheet = onPhone && fromBottom;
  const raised = useSheetCards((s) => raisedFor(s.stack));
  const cardsUp = useSheetCards((s) => cardsOpen(s.stack));
  // Where the cards over it are put: inside its popup (CardStack).
  const [cardHost, setCardHost] = useState<HTMLElement | null>(null);
  const footShown = !!foot && !cardsUp;
  // A card or a page open (the account page too) is the whole sheet, its own head and ✕ at the top
  // (one card rule, 2026-11-10); closed, the search is back -- kept with the keyboard up, as it is typed in.
  const barShown = !!bar && !flying && !cardsUp && layer === "tab";
  const toEdge = layer !== "console" && !!props.toEdge && !cardsUp;

  // Where the Drawer is going (its snap point) and the size laid out for:
  // the same, but going down to the pill the half's layout kept until it
  // lands. Landed at once where nothing slides (side panel, Reduce Motion,
  // before the first frame, the same height).
  const still = useRef({ onPhone, ready: false, detents: null as Detents | null, at: props.state as PanelState });
  const life = useSheetLife(props.state, props.onStateChange, (target) => {
    const now = still.current;
    return !now.onPhone || !now.ready || prefersReducedMotion() || (!!now.detents && now.detents[target] === now.detents[now.at]);
  });
  const { size, snap, moving } = life;
  const hasPill = !!bar || !!compact;
  const atPill = size === "peek" && hasPill;

  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [footNode, setFoot] = useState<HTMLDivElement | null>(null);

  // A bottom sheet runs on to the screen's edge, under the home indicator
  // (or eight points where there is none); its pill ends at its row's
  // foot, the home indicator's inset alone kept (the owner, 2026-11-08).
  // With the keyboard up the sheet sits on it (the Drawer's
  // --drawer-keyboard-inset), that room given up in CSS (SheetParts).
  const edgeInset = bottomSheet ? Math.max(Math.round(safe.bottom), SHEET_MARGIN) : 0;
  const pillChrome = bottomSheet ? Math.round(safe.bottom) : GRABBER;
  const halfChrome = bottomSheet ? edgeInset : GRABBER;
  // What the sheet leaves at its far edge: the status bar and eight.
  const reserve = Math.round(fromBottom ? safe.top : safe.bottom) + SHEET_MARGIN;
  const room = onPhone ? windowHeight - reserve : windowHeight - 2 * FLOAT_PX;
  const sizes = useSheetDetents({
    foot: footNode,
    size,
    moving,
    barInPill: !flying,
    dots: !!props.pages && !flying,
    grabberOver: bottomSheet,
    footShown,
    pillChrome,
    halfChrome,
    room,
    sideOut: !onPhone,
    topInset: onPhone && !fromBottom ? Math.round(safe.top) : 0,
  });
  const { detents } = sizes;

  // The room it leaves the map: told to the map as it sets off (sheetturn,
  // GlMapShell eases with it) and to the page once it has landed.
  const insetsFor = useCallback(
    (s: PanelState, d: Detents) => insetsOf(s, d, onPhone, fromBottom, safe.top, desktop),
    [onPhone, fromBottom, safe.top, desktop],
  );
  const detentsRef = useRef(detents);
  useLayoutEffect(() => {
    detentsRef.current = detents;
    still.current = { onPhone, ready: life.ready, detents, at: life.snapRef.current };
  });
  const go = life.go;
  const ask = useCallback((target: PanelState) => go(target, true), [go]);
  // The map told as the sheet sets off for another size, whatever sent it
  // (a finger, the grabber, the page), so it eases with the sheet.
  const turned = useRef(snap);
  useEffect(() => {
    if (turned.current === snap) return;
    turned.current = snap;
    panel?.dispatchEvent(
      new CustomEvent("sheetturn", { bubbles: true, detail: { insets: insetsFor(snap, detentsRef.current) } satisfies SheetTurn }),
    );
  }, [snap, panel, insetsFor]);
  const tellInsets = props.onInsetsChange;
  const insetsNow = useMemo(() => insetsFor(size, detents), [insetsFor, size, detents]);
  useEffect(() => {
    if (!moving) tellInsets(insetsNow);
  }, [moving, insetsNow, tellInsets]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => usePanelDragging.setState({ dragging: moving }));
    return () => cancelAnimationFrame(frame);
  }, [moving]);

  // Escape, once nothing else took it (a menu, Setup's page): the top card
  // or page closed first, a level back (backOne), on a phone too by the one
  // card rule (the owner, 2026-11-10); with none open, the sheet lowered.
  const lower = (event: Event) => {
    setTimeout(() => {
      if (event.defaultPrevented) return;
      if (panel && backOne(panel.ownerDocument)) return;
      if (life.sizeRef.current !== "peek") ask("peek");
    });
  };

  // Half way the body is cut off at the sheet's edge, as Apple Maps' is: a
  // row focused there (the keyboard, VoiceOver) or asked for (sheetreveal,
  // a pin's row in the Stops) brings the sheet all the way up.
  const halfEdge = detents.half - (footShown ? sizes.footHalf : 0);
  useEffect(() => {
    if (!panel) return;
    const reveal = (event: Event) => {
      if (life.sizeRef.current !== "half" || !onPhone) return;
      if (!(event.target instanceof Element) || !event.target.closest("[data-panel-body]")) return;
      const row = event.target.getBoundingClientRect().bottom;
      const below = fromBottom ? row - panel.getBoundingClientRect().top : row;
      if (below > halfEdge + 1) ask("full");
    };
    panel.addEventListener("focusin", reveal);
    panel.addEventListener("sheetreveal", reveal);
    return () => {
      panel.removeEventListener("focusin", reveal);
      panel.removeEventListener("sheetreveal", reveal);
    };
  }, [panel, fromBottom, ask, halfEdge, onPhone, life.sizeRef]);

  // A card opened comes up half way at the least, all the way for a search (useCardRaise).
  useCardRaise(raised, ask, life.snapRef);

  // The panel's size on <body>, for index.css's rules over the map.
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

  const panelSize = useMemo(() => ({ size, to: ask, card: layer === "card" }), [size, ask, layer]);
  const shared: PartsProps = {
    ...props,
    layer,
    flying,
    size,
    atPill,
    resting: atPill && !moving,
    fromBottom: bottomSheet,
    onPhone,
    desktop,
    footShown,
    cardsUp,
    barShown,
    toEdge,
    edgeInset,
    halfChrome,
    panelSize,
    setFoot,
    onFootTap: () => ask("half"),
    kept,
    top,
    controls,
    compact,
    bar,
    children,
  };
  const grabber = <SheetGrabber label={label} size={size} ask={ask} at={bottomSheet ? "top" : "bottom"} />;
  // The room at half for a card fitted to it (ProfileCard, PastFlightCard),
  // for the sheet's body and the cards over it: changed as it sets off and
  // at rest, never per frame.
  const halfBody = { "--half-body": `${sizes.halfBody}px` } as CSSProperties;
  // On a phone the light grey of Apple Maps' web sheet (2026-11-10): the look's --sheet, Canvas in Native.
  const look = onPhone
    ? GLASS_SHEET
    : cn(MATERIAL, "w-(--size-panel) lg:w-(--size-panel-wide) ring-1 ring-inset ring-black/5 shadow-float dark:ring-white/10");
  const common = {
    "data-slot": "map-panel",
    "data-panel": size,
    "data-capsule": (atPill && !moving) || undefined,
    // Its three heights, for a probe or a test to read.
    "data-detents": `${detents.peek},${detents.half},${detents.full}`,
    "aria-label": label,
  };

  const snapPoints = [detents.peek, detents.half, detents.full];
  // A drag let go at a snap point: the size nearest it. Let go past the
  // pill, the Drawer reads a close, which is refused for the pill.
  const snapped = (point: Drawer.Root.SnapPoint | null, details: Drawer.Root.SnapPointChangeEventDetails) => {
    if (point === null) {
      details.cancel();
      if (life.sizeRef.current !== "peek") ask("peek");
      return;
    }
    const px = typeof point === "number" ? point : parseFloat(point);
    const d = detentsRef.current;
    const target = (Object.keys(d) as PanelState[]).reduce((best, s) => (Math.abs(d[s] - px) < Math.abs(d[best] - px) ? s : best));
    if (target !== life.snapRef.current) ask(target);
  };

  // The cards over it, its nested drawers (CardStack), with its sizes.
  const stackProps: StackProps & { host: HTMLElement | null } = {
    host: cardHost,
    onPhone,
    fromBottom: bottomSheet,
    detents,
    size,
    snap,
    resting: atPill && !moving,
    ready: life.ready,
    snapped,
    ask,
    grabber,
    look: onPhone ? GLASS_SHEET : "bg-background dark:bg-popover",
    below: SHEET_BELOW,
    follow: onPhone && !fromBottom ? cn(FOLLOW, CUT_TOP) : undefined,
  };

  if (!onPhone)
    return (
      // eslint-disable-next-line jsx-a11y-x/no-static-element-interactions -- the side panel hears the Escape pressed in it, a keyboard convenience; its controls are its own
      <section
        ref={setPanel}
        {...common}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key === "Escape" && !event.defaultPrevented) lower(event.nativeEvent);
        }}
        className={cn(
          "fixed left-[max(1rem,env(safe-area-inset-left))] z-40 flex flex-col pb-4 overflow-clip text-foreground outline-none print:static",
          look,
        )}
        style={{ top: FLOAT_PX, height: size === "peek" ? undefined : detents.full, borderRadius: PILL_RADIUS, ...halfBody }}
      >
        <SheetParts {...shared} />
        {!cardsUp && grabber}
        {/* The cards over it, each covering the panel, its own scroller. */}
        <div ref={setCardHost} className="pointer-events-none absolute inset-0 z-40 rounded-[inherit]" />
        <CardStack {...stackProps} />
      </section>
    );

  return (
    <SheetDrawer
      fromBottom={fromBottom}
      snapPoints={snapPoints}
      snapPoint={detents[snap]}
      snapped={snapped}
      lower={lower}
      ready={life.ready}
      onLanded={life.landed}
      setPanel={setPanel}
      popup={common}
      style={{ height: detents.full, maxHeight: `calc(100% - ${reserve}px)`, ...halfBody }}
      look={look}
    >
      {fromBottom && !cardsUp && grabber}
      <SheetParts {...shared} />
      {!fromBottom && !cardsUp && grabber}
      {/* The cards over it, inside it: its corners, its place. */}
      <div ref={setCardHost} className="pointer-events-none absolute inset-0 z-40" />
      <CardStack {...stackProps} />
    </SheetDrawer>
  );
}
