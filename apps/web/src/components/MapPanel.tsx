import { useEffect, useLayoutEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { cn } from "cn";
import { useIsMobile } from "../hooks/use-mobile";
import { useIsDesktop } from "../hooks/use-desktop";
import { useInspector } from "../hooks/use-inspector";
import { backOne } from "../hooks/use-shortcuts";
import { useNavEdge } from "../hooks/use-nav-edge";
import { useKeyboardUp, useSafeArea } from "../hooks/use-viewport";
import { GLASS_SHEET, PILL_RADIUS, useSlidingSheet, type MapInsets, type PanelState } from "../lib/mapChrome";
import { cardOpening, coverCard, useSheetCards } from "../lib/sheetCards";
import { useBackCloses } from "../lib/backNavigation";
import { CARD, FLOAT_PX, footPillPx, insetsOf, inspectorRoom, letGo, snapsOf } from "./sheet/insets";
import { useSheetCover } from "./sheet/useSheetCover";
import { FootBar } from "./sheet/FootBar";
import { useFootBarHeight } from "./sheet/sheetMotion";
import { useSideGlide } from "./sheet/useSideGlide";
import { useDrawn } from "./sheet/useDrawn";
import { SheetParts, type PartsProps } from "./sheet/SheetParts";
import { SHEET_BELOW } from "./sheet/sheetLayout";
import { SheetGrabber } from "./sheet/SheetGrabber";
import { SHEET_SIZES, SIDE_SIZES } from "./sheet/grabberSizes";
import { CardStack, type StackProps } from "./sheet/CardStack";
import { SheetDrawer } from "./sheet/SheetDrawer";
import { useRidingCard } from "./sheet/sheetTopSlot";
import type { SheetPages } from "../lib/sheetPages";
import { usePageToggle } from "./sheet/pageToggle";

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
  /** What the panel is showing: the workspace, or a card open alone over it. */
  layer?: "tab" | "card";
  /** Pinned at the sheet's foot at every size: the route's figures -- in
   *  the pill its one row. */
  foot?: ReactNode;
  /** The body down to the sheet's own edge, over the home indicator's
   *  inset (PlaceCard). */
  toEdge?: boolean;
  /** The airplane flying the route (useFlyingMode): the first row, the top
   *  row and the controls put away, the pill its foot alone. */
  flying?: boolean;
  /** The sheet's two pages, Search and FPL, turned by the round toggle at
   *  their first row's end (PageToggle): the first the search and
   *  `children`, the second its own bar, the top row under it and its own
   *  body (SheetPages). */
  pages?: SheetPages;
  state: PanelState;
  onStateChange: (state: PanelState) => void;
  onInsetsChange: (insets: MapInsets) => void;
}

/**
 * The page's one panel over the map, the way Maps on an iPhone has one:
 * the one search first, the route and the workspace's actions under it,
 * and the workspace's own content under those.
 *
 * On a phone it is Base UI's stock Drawer (the owner, 2026-11-10: the
 * stock sheet with its own motion, gestures and behaviour): open and
 * non-modal, so the map stays the map's; the pill, half and all the way
 * up its snap points, fixed in the Drawer's own units (sheet/insets'
 * snapsOf: the pill's rem or FPL's foot bar's px, 26 rem, 1), which it measures itself; a
 * bottom or a top sheet by the pilot's Layout (swipeDirection down or up). The Drawer follows the finger, reads the
 * throw, picks the snap point and eases there on its own curve; a swipe
 * past the pill is refused and lands on the pill. What the stock sheet
 * leaves to its user is a thin layer here: the parts held in sight at its
 * free edge (by the Drawer's own CSS variables, SheetParts), the room over
 * its top where the radio's and the map's buttons ride it (OnSheetTop), the room it
 * leaves the map (insetsOf, from its size by useSheetCover). The
 * cards over it are its own nested drawers, each with its own snap point
 * (CardStack); the keyboard's inset is the Drawer's
 * (VirtualKeyboardProvider), and a swipe moves one size however fast, by
 * the Drawer's own snapToSequentialPoints (the owner, 2026-11-11). What it shows -- the grabber, what rides its
 * top, its body's layout, the map's room -- follows its snap point the
 * moment that is set, never held for the slide to end.
 *
 * From `md` up it is a side panel instead, a plain region at the left the
 * window's height while it is out and its head alone at rest, the map
 * beside it -- not a sheet. A card covers it, except on a touch screen
 * wide enough for an inspector (useInspector), where the cards open in a
 * column of their own at the map's right and the plan stays in sight, as
 * the iPad app's inspector holds them.
 */
export default function MapPanel(props: Props) {
  const { label, top, kept, controls, compact, children, bar, foot, flying = false, layer = "tab" } = props;
  const onPhone = useIsMobile();
  const desktop = useIsDesktop();
  const fromBottom = useNavEdge() === "bottom";
  const safe = useSafeArea();
  const bottomSheet = onPhone && fromBottom;
  // The card that covers the map most (coverCard): the top card can sit
  // lower than the one under it.
  const coverEntry = useSheetCards((s) => coverCard(s.stack));
  const cardsUp = !!coverEntry;
  // The cards in the inspector at the map's right: the side panel left as
  // it is under them, its search, its plan and its figures in sight.
  const inspector = useInspector() && !onPhone;
  const covering = cardsUp && !inspector;
  // The map's buttons ride the sheet's top, or the top of the card over it that covers the map most (sheetTopSlot).
  const ridingCard = useRidingCard();
  // Where the cards over it are put: inside its popup (CardStack).
  const [cardHost, setCardHost] = useState<HTMLElement | null>(null);
  // The route's figures at half and all the way up; at the pill where they
  // are the pill -- flying, and FPL's page (the owner, 2026-11-11, the
  // canvas's b: To, Dist, ETE and Fuel at a glance, the route's row from
  // half up) -- the search's row being it on Search: paged, they are FPL's
  // page's own (SheetParts), beside Search's row. The pill is one fixed
  // height for every page and card (sheet/insets), which the figures fit.
  const footShown = !!foot && !covering && (!onPhone || props.state !== "peek" || flying || !!props.pages);
  // FPL's foot on a phone's bottom sheet, on the ground: the figures and the
  // tab bar as one fixed bar beside the Drawer's popup, not in it, the sheet
  // sliding behind it (sheet/FootBar); in flight, a dry run, a top sheet
  // and the side panel the foot is the sheet's own (SheetFoot).
  const footBar = bottomSheet && !!foot && !flying && !!props.pages?.floats;
  // In sight on FPL's page alone, as its foot was (SheetPages), and not
  // under a card; put away while the keyboard is up, as iOS puts a tab bar
  // away, so the field typed in keeps the screen (the r6 UI audit's M1).
  const keyboard = useKeyboardUp();
  const footBarUp = footBar && footShown && props.pages?.at === 1 && !keyboard;
  // A card or a page open is the whole sheet, its own head and ✕ at the top
  // (one card rule, 2026-11-10); closed, the search is back -- kept with the keyboard up, as it is typed in.
  const barShown = !!bar && !flying && !covering && layer === "tab";
  const toEdge = !!props.toEdge && !covering;

  // The sheet's own size is the page's (MapPanel's state, its setPanel); a
  // card over it sizes its own drawer (CardStack, useCardSize). What is in
  // sight is the highest card's, else the sheet's: read for the map's room
  // and the rules over the map (all the way up, its buttons give way,
  // index.css), and for the side panel, which a card covers.
  const ask = props.onStateChange;
  // A card opening, the size it opens at (Emergency's all the way up), not half for its first render.
  const front: PanelState = coverEntry && !inspector ? (coverEntry.at ?? cardOpening(coverEntry)) : props.state;
  const size = onPhone ? props.state : front;
  const ready = useDrawn();
  const hasPill = !!bar || !!compact;
  const atPill = size === "peek" && hasPill;
  // The sheet's element (the Drawer's popup, or the side panel), for what
  // it covers of the map.
  const [sheetNode, setSheetNode] = useState<HTMLElement | null>(null);
  // FPL's pill, where its foot bar is in sight, is the bar folded and the
  // grabber's room (footPillPx), so the sheet rests wholly behind the bar.
  const { height: barHeight, pill: barPill } = useFootBarHeight();
  const pillPx = footBarUp ? footPillPx(barPill) : 0;
  const snaps = snapsOf(fromBottom, pillPx);

  // The room the sheet in sight (the top card, else the sheet) leaves the
  // map, from the size it is set to: the map eases with the sheet
  // (GlMapShell, in the Drawer's time).
  const sheetCover = useSheetCover(sheetNode, front, onPhone, fromBottom, pillPx);
  const { most, width } = sheetCover;
  // Never less than the foot bar, which stands over the sheet's foot: it
  // sits inside what the sheet covers at every size (the pill's room under
  // the grabber is its least height), but at a large text size it grows
  // taller than that (FlightFoot's min-height), its measured height here,
  // and the map's room ends at its top.
  const barRoom = footBarUp ? barHeight : 0;
  const cover = Math.max(sheetCover.cover, barRoom);
  const least = Math.max(sheetCover.least, barRoom);
  // The inspector's column while a card is in it: the panel's width.
  const right = inspector && cardsUp ? CARD : 0;
  // The sheet the map slides with, frame by frame (useSlidingSheet): a
  // phone's bottom sheet with no card over it.
  const slides = bottomSheet && !cardsUp && !!sheetNode && most > 0;
  useEffect(() => {
    useSlidingSheet.setState({
      sheet: slides && sheetNode ? { node: sheetNode, least, most } : null,
      half: bottomSheet ? most : 0,
      side: inspector ? inspectorRoom(CARD) : 0,
    });
  }, [slides, sheetNode, least, most, bottomSheet, inspector]);
  useEffect(() => () => useSlidingSheet.setState({ sheet: null, half: 0, side: 0 }), []);
  // The pages, drawn whenever the workspace has them and is not flying: a
  // card alone over them (`layer` "card") is drawn from inside one, the
  // Brief from FPL's (PlanPage), so put away with them it never opened.
  const pages = props.pages && !flying ? props.pages : undefined;
  // Turned by their toggle (PageToggle), told them here: it is drawn in
  // each page's first row, apart from the pages' own state.
  const pageAt = pages?.at;
  const pageGo = pages?.go;
  useEffect(() => {
    usePageToggle.setState({ pages: pageGo && pageAt !== undefined ? { at: pageAt, go: pageGo } : null });
  }, [pageAt, pageGo]);
  useEffect(() => () => usePageToggle.setState({ pages: null }), []);
  const tellInsets = props.onInsetsChange;
  const insetsNow = useMemo(
    () => ({ ...insetsOf(front, cover, onPhone, fromBottom, safe.top, width, right), card: cardsUp }),
    [front, cover, onPhone, fromBottom, safe.top, width, right, cardsUp],
  );
  // Told in the commit that changes them, before any effect after paint: a
  // place picked with a card centres itself in the card's room (GlMapShell).
  useLayoutEffect(() => tellInsets(insetsNow), [insetsNow, tellInsets]);

  // Escape with no card over it (a card's own drawer takes it) lowers the
  // sheet to the pill; whether it took the key.
  const lower = () => {
    if (covering || size === "peek") return false;
    ask("peek");
    return true;
  };

  // Android's Back closes the top card, else lowers the sheet.
  useBackCloses(front !== "peek");
  // The size in sight on <body> (the top card's, else the sheet's), for
  // index.css's rules over the map.
  useLayoutEffect(() => {
    document.body.dataset.mapPanel = front;
    return () => {
      delete document.body.dataset.mapPanel;
    };
  }, [front]);
  useLayoutEffect(() => {
    document.body.toggleAttribute("data-map-sheet", onPhone);
    return () => document.body.removeAttribute("data-map-sheet");
  }, [onPhone]);

  const panelSize = useMemo(() => ({ size, to: ask, card: layer === "card" }), [size, ask, layer]);
  // How the sheet is laid out this render, worked out once for each of its parts.
  const shared: PartsProps = {
    // The pages as drawn (none in flight).
    slots: { top, kept, controls, compact, bar, foot, children, pages },
    layout: {
      layer,
      flying,
      size,
      atPill,
      fromBottom: bottomSheet,
      onPhone,
      desktop,
      footShown,
      footBar,
      cardsUp: covering,
      barShown,
      toEdge,
    },
    panelSize,
    onFootTap: () => ask("half"),
  };
  // The sheet's grabber and each card's, the one plain bar.
  const grabberAt = bottomSheet ? "top" : "bottom";
  // A tap puts the side panel in or out: half and all the way up are one box there.
  const grabberSizes = onPhone ? SHEET_SIZES : SIDE_SIZES;
  const sheetGrabber = <SheetGrabber label={label} size={size} ask={ask} at={grabberAt} sizes={grabberSizes} />;
  // Solid at every size, the look's --sheet (Canvas in Native), the light
  // grey of Apple Maps' web sheet (2026-11-10): glass is only for what
  // floats over the map (CLAUDE.md, owner decision 2026-11-10). The side
  // panel was MATERIAL, the chart showing through it (the web audit's WEB-6).
  const look = onPhone
    ? GLASS_SHEET
    : // Narrowed in a narrow window to leave the map 22 rem beside it (an
      // iPad's half or a Stage Manager window from 660), the wide one from 1024.
      cn(
        GLASS_SHEET,
        "w-[min(var(--size-panel),calc(100vw-22rem))] lg:w-(--size-panel-wide) ring-1 ring-inset ring-black/5 dark:ring-white/10",
      );
  const common = {
    "data-slot": "map-panel",
    // The sheet's own size, under a card too; a card's is on its own
    // drawer (CardStack's data-panel).
    "data-panel": size,
    "data-capsule": atPill || undefined,
    "aria-label": label,
  };

  // A drag let go (letGo); a swipe past the pill lands on it. A card's drag
  // is its own drawer's (CardStack).
  const snapped = (point: Drawer.Root.SnapPoint | null, details: Drawer.Root.SnapPointChangeEventDetails) => {
    if (!cardsUp) letGo(point, details, { fromBottom, pillPx, at: size, ask, park: "peek" });
  };

  // The cards over it, its nested drawers (CardStack), with its sizes.
  const stackProps: StackProps & { host: HTMLElement | null } = {
    host: cardHost,
    onPhone,
    fromBottom: bottomSheet,
    ready,
    // None in the inspector: its card is the column's height, nothing to put in or out.
    grabber: (cardSize, cardAsk) =>
      inspector ? null : <SheetGrabber label={label} size={cardSize} ask={cardAsk} at={grabberAt} sizes={grabberSizes} />,
    look: onPhone ? GLASS_SHEET : "bg-background dark:bg-popover",
    below: SHEET_BELOW,
    inspector,
  };
  // The side panel's edge glides as it is put in and out (useSideGlide).
  useSideGlide(onPhone ? null : sheetNode, size, PILL_RADIUS);

  // The inspector's column, the window's height inside its float as the
  // side panel is, at the right inside the safe area: the cards' host,
  // drawn as a panel only while one is in it, its ground fading in and out
  // with its card on the Drawer's time (the apple-design audit of
  // 2026-11-23, H1), where it popped in and out as the map eased beside it.
  const inspectorColumn = inspector && (
    <div
      data-slot="map-inspector"
      className={cn(
        "pointer-events-none fixed right-[max(1rem,env(safe-area-inset-right))] z-40 w-(--size-panel) overflow-clip print:hidden",
        GLASS_SHEET,
        "ring-1 ring-inset ring-black/5 transition-opacity duration-(--motion-drawer) ease-(--motion-drawer-ease) dark:ring-white/10",
        !cardsUp && "opacity-0",
      )}
      style={{
        top: `max(${FLOAT_PX}px, env(safe-area-inset-top))`,
        bottom: `max(${FLOAT_PX}px, env(safe-area-inset-bottom))`,
        borderRadius: PILL_RADIUS,
      }}
    >
      <div ref={setCardHost} className="pointer-events-none absolute inset-0 z-40 rounded-[inherit]" />
    </div>
  );

  if (!onPhone)
    return (
      <>
        {/* eslint-disable-next-line jsx-a11y-x/no-static-element-interactions -- the side panel hears the Escape pressed in it, a keyboard convenience; its controls are its own */}
        <section
          {...common}
          ref={setSheetNode}
          // Escape a level back first, a page's close in it (use-shortcuts'
          // backOne), then the panel lowered; taken, so the shortcuts' own
          // Escape on the document does not go back a second level.
          onKeyDown={(event: KeyboardEvent) => {
            if (event.key !== "Escape" || event.defaultPrevented) return;
            if (backOne(event.currentTarget.ownerDocument) || lower()) event.preventDefault();
          }}
          className={cn(
            "fixed left-[max(1rem,env(safe-area-inset-left))] z-40 flex flex-col pb-4 overflow-clip text-foreground outline-none print:static",
            look,
          )}
          // Out, the window's height inside its float on either side, and
          // inside the safe area, as its left edge is: an iPhone held
          // sideways has the home indicator under the panel's grabber.
          style={{
            top: `max(${FLOAT_PX}px, env(safe-area-inset-top))`,
            bottom: size === "peek" ? undefined : `max(${FLOAT_PX}px, env(safe-area-inset-bottom))`,
            borderRadius: PILL_RADIUS,
          }}
        >
          <SheetParts {...shared} />
          {!covering && sheetGrabber}
          {/* The cards over it, each covering the panel, its own scroller; or in the inspector. */}
          {!inspector && <div ref={setCardHost} className="pointer-events-none absolute inset-0 z-40 rounded-[inherit]" />}
          <CardStack {...stackProps} />
        </section>
        {inspectorColumn}
      </>
    );

  return (
    <SheetDrawer
      fromBottom={fromBottom}
      snapPoints={snaps.points}
      snapPoint={snaps.at[size]}
      snapped={snapped}
      popupRef={setSheetNode}
      lower={lower}
      ready={ready}
      popup={common}
      look={look}
      grabber={!cardsUp && sheetGrabber}
      topSlot={ridingCard === null}
      foot={
        footBar && (
          <FootBar size={size} shown={footBarUp}>
            {foot}
          </FootBar>
        )
      }
      cards={
        // The cards over it, inside its popup: its place.
        <>
          <div ref={setCardHost} className="pointer-events-none absolute inset-0 z-40" />
          <CardStack {...stackProps} />
        </>
      }
    >
      <SheetParts {...shared} />
    </SheetDrawer>
  );
}
