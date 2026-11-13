import { useEffect, useLayoutEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { cn } from "cn";
import { useIsMobile } from "../hooks/use-mobile";
import { useIsDesktop } from "../hooks/use-desktop";
import { backOne } from "../hooks/use-shortcuts";
import { useNavEdge } from "../hooks/use-nav-edge";
import { useSafeArea } from "../hooks/use-viewport";
import { GLASS_SHEET, MATERIAL, PILL_RADIUS, type MapInsets, type PanelState } from "../lib/mapChrome";
import { coverCard, useSheetCards } from "../lib/sheetCards";
import { useBackCloses } from "../lib/backNavigation";
import { FLOAT_PX, insetsOf, sizeAt, snapsOf, tabBarRoomPx } from "./sheet/insets";
import { useSheetCover } from "./sheet/useSheetCover";
import { useDrawn } from "./sheet/useDrawn";
import { CUT_TOP, FOLLOW, SHEET_BELOW, SheetParts, type PartsProps } from "./sheet/SheetParts";
import { SheetGrabber } from "./sheet/SheetGrabber";
import { CardStack, type StackProps } from "./sheet/CardStack";
import { SheetDrawer } from "./sheet/SheetDrawer";
import { useCardMoving, useRidingCard } from "./sheet/sheetTopSlot";
import { SheetTabBar, SheetTabs, type SheetPages } from "./sheet/SheetTabBar";

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
  /** The sheet's two pages, Search and FPL, picked from a tab bar under the
   *  sheet (the owner, 2026-11-13: tab bar, option A): the first the search
   *  and `children`, the second the top row and its own body (SheetTabBar). */
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
 * snapsOf: the pill's rem, 23 rem, 1), which it measures itself; a
 * bottom or a top sheet by the pilot's Layout (swipeDirection down or up). The Drawer follows the finger, reads the
 * throw, picks the snap point and eases there on its own curve; a swipe
 * past the pill is refused and lands on the pill. What the stock sheet
 * leaves to its user is a thin layer here: the parts held in sight at its
 * free edge (by the Drawer's own CSS variables, SheetParts), the room over
 * its top where the radio's and the map's buttons ride it (OnSheetTop), the room it
 * leaves the map (insetsOf, read from the Drawer by useSheetCover). The
 * cards over it are its own nested drawers, each with its own snap point
 * (CardStack); the keyboard's inset is the Drawer's
 * (VirtualKeyboardProvider), and a swipe moves one size however fast, by
 * the Drawer's own snapToSequentialPoints (the owner, 2026-11-11). What it shows -- the grabber, what rides its
 * top, its body's layout, the map's room -- follows its snap point the
 * moment that is set, never held for the slide to end.
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
  const bottomSheet = onPhone && fromBottom;
  // The card that covers the map most (coverCard): the top card can sit
  // lower than the one under it.
  const coverEntry = useSheetCards((s) => coverCard(s.stack));
  const cardsUp = !!coverEntry;
  // The map's buttons ride the sheet's top until a card has finished coming up (sheetTopSlot).
  const ridingCard = useRidingCard();
  // Where the cards over it are put: inside its popup (CardStack).
  const [cardHost, setCardHost] = useState<HTMLElement | null>(null);
  // The route's figures at half and all the way up; at the pill where they
  // are the pill -- flying, and FPL's page (the owner, 2026-11-11, the
  // canvas's b: To, Dist, ETE and Fuel at a glance, the route's row from
  // half up) -- the search's row being it on Search: paged, they are FPL's
  // page's own (SheetParts), beside Search's row. The pill is one fixed
  // height for every page and card (sheet/insets), which the figures fit.
  const footShown = !!foot && !cardsUp && (!onPhone || props.state !== "peek" || flying || !!props.pages);
  // A card or a page open (the account page too) is the whole sheet, its own head and ✕ at the top
  // (one card rule, 2026-11-10); closed, the search is back -- kept with the keyboard up, as it is typed in.
  const barShown = !!bar && !flying && !cardsUp && layer === "tab";
  const toEdge = layer !== "console" && !!props.toEdge && !cardsUp;

  // The sheet's own size is the page's (MapPanel's state, its setPanel); a
  // card over it sizes its own drawer (CardStack, useCardSize). What is in
  // sight is the highest card's, else the sheet's: read for the map's room
  // and the rules over the map (all the way up, its buttons give way,
  // index.css), and for the side panel, which a card covers.
  const ask = props.onStateChange;
  const front: PanelState = coverEntry ? (coverEntry.at ?? "half") : props.state;
  const size = onPhone ? props.state : front;
  const ready = useDrawn();
  const hasPill = !!bar || !!compact;
  const atPill = size === "peek" && hasPill;

  // The sheet's element (the Drawer's popup, or the side panel), for what
  // it covers of the map.
  const [sheetNode, setSheetNode] = useState<HTMLElement | null>(null);
  const snaps = snapsOf(fromBottom);

  // The room the sheet in sight (the top card, else the sheet) leaves the
  // map, read from the Drawer as its snap point is set: the map eases with
  // the sheet (GlMapShell, in the Drawer's time).
  const { cover, card: coverIsCard } = useSheetCover(sheetNode, front, onPhone, fromBottom);
  // The pages' tab bar, in the workspace and not flying (a card over it
  // keeps it: a tab picked puts the card away with its page, usePanelView).
  const pages = props.pages && !flying && layer === "tab" ? props.pages : undefined;
  // Under a top sheet the bar is the map's foot (under a bottom sheet the
  // Drawer's viewport stands on it, which useSheetCover reads).
  const barUnderMap = onPhone && !fromBottom && pages ? tabBarRoomPx(safe.bottom) : 0;
  const tellInsets = props.onInsetsChange;
  const insetsNow = useMemo(() => {
    const insets = insetsOf(front, cover, onPhone, fromBottom, safe.top, desktop);
    return { ...insets, bottom: insets.bottom + barUnderMap, card: cardsUp || coverIsCard };
  }, [front, cover, onPhone, fromBottom, safe.top, desktop, cardsUp, coverIsCard, barUnderMap]);
  useEffect(() => tellInsets(insetsNow), [insetsNow, tellInsets]);

  // Escape with no card over it (a card's own drawer takes it) lowers the
  // sheet to the pill; whether it took the key.
  const lower = () => {
    if (cardsUp || size === "peek") return false;
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
  // A card still sliding up or down: the map's buttons give way until it
  // is up and they ride its top (index.css, useCardMoving).
  const cardMoving = useCardMoving();
  useLayoutEffect(() => {
    document.body.toggleAttribute("data-card-moving", cardMoving);
    return () => document.body.removeAttribute("data-card-moving");
  }, [cardMoving]);
  useLayoutEffect(() => {
    document.body.toggleAttribute("data-map-sheet", onPhone);
    return () => document.body.removeAttribute("data-map-sheet");
  }, [onPhone]);

  const panelSize = useMemo(() => ({ size, to: ask, card: layer === "card" }), [size, ask, layer]);
  const shared: PartsProps = {
    ...props,
    // The pages as drawn (none under the console, a card or in flight):
    // the props' own drew SheetPage's panels with no Tabs round them, and
    // the console's opening threw Base UI's "TabsRootContext is missing".
    pages,
    layer,
    flying,
    size,
    atPill,
    resting: atPill,
    fromBottom: bottomSheet,
    onPhone,
    desktop,
    footShown,
    cardsUp,
    barShown,
    toEdge,
    tabBar: !!pages,
    panelSize,
    onFootTap: () => ask("half"),
    kept,
    top,
    controls,
    compact,
    bar,
    children,
  };
  // The sheet's grabber and each card's, the one plain bar.
  const grabberAt = bottomSheet ? "top" : "bottom";
  const sheetGrabber = <SheetGrabber label={label} size={size} ask={ask} at={grabberAt} />;
  // On a phone the light grey of Apple Maps' web sheet (2026-11-10): the look's --sheet, Canvas in Native.
  const look = onPhone
    ? GLASS_SHEET
    : cn(MATERIAL, "w-(--size-panel) lg:w-(--size-panel-wide) ring-1 ring-inset ring-black/5 shadow-float dark:ring-white/10");
  const common = {
    "data-slot": "map-panel",
    // The sheet's own size, under a card too; a card's is on its own
    // drawer (CardStack's data-panel).
    "data-panel": size,
    "data-capsule": atPill || undefined,
    "aria-label": label,
  };

  // A drag let go at a snap point: its size, the point being one of ours.
  // Let go past the pill, the Drawer reads a close, which is refused for
  // the pill.
  const snapped = (point: Drawer.Root.SnapPoint | null, details: Drawer.Root.SnapPointChangeEventDetails) => {
    // A card's drag is its own drawer's (CardStack).
    if (cardsUp) return;
    if (point === null) {
      details.cancel();
      if (size !== "peek") ask("peek");
      return;
    }
    const target = sizeAt(fromBottom, point);
    if (target && target !== size) ask(target);
  };

  // The cards over it, its nested drawers (CardStack), with its sizes.
  const stackProps: StackProps & { host: HTMLElement | null } = {
    host: cardHost,
    onPhone,
    fromBottom: bottomSheet,
    ready,
    grabber: (cardSize, cardAsk) => <SheetGrabber label={label} size={cardSize} ask={cardAsk} at={grabberAt} />,
    look: onPhone ? GLASS_SHEET : "bg-background dark:bg-popover",
    below: SHEET_BELOW,
    follow: onPhone && !fromBottom ? cn(FOLLOW, CUT_TOP) : undefined,
  };

  if (!onPhone)
    return (
      // eslint-disable-next-line jsx-a11y-x/no-static-element-interactions -- the side panel hears the Escape pressed in it, a keyboard convenience; its controls are its own
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
        // Out, the window's height inside its float on either side.
        style={{ top: FLOAT_PX, bottom: size === "peek" ? undefined : FLOAT_PX, borderRadius: PILL_RADIUS }}
      >
        <SheetTabs pages={pages}>
          <SheetParts {...shared} />
          {/* The pages' tabs at the panel's foot, on it rather than over the map. */}
          {pages && <SheetTabBar names={pages.names} floating={false} className="mt-auto shrink-0 px-3 pt-2" />}
        </SheetTabs>
        {!cardsUp && sheetGrabber}
        {/* The cards over it, each covering the panel, its own scroller. */}
        <div ref={setCardHost} className="pointer-events-none absolute inset-0 z-40 rounded-[inherit]" />
        <CardStack {...stackProps} />
      </section>
    );

  return (
    <SheetTabs pages={pages}>
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
        tabBar={pages && <SheetTabBar names={pages.names} floating />}
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
    </SheetTabs>
  );
}
