import { useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { cn } from "cn";
import { PanelSize, type PanelState } from "../../lib/mapChrome";
import { SheetCardHost } from "../SheetCard";
import TabKept from "../TabKept";
import type { useSheetDetents } from "./useSheetDetents";
export { SheetViewport } from "./SheetViewport";

/** The first row's room under the grabber: ten points, the grabber's bar
 *  in it four from the edge. */
const ROW_PAD = "pt-2.5";
/** The one search's row, its 46-point field (OneSearchField) sixteen in
 *  from either side as everything in the sheet is (the sheet audit's
 *  F-P1, F-P2, 2026-11-10): on a bottom sheet clear of the grabber's
 *  24-point hit area over it, 76 (BAR_ALONE_REM); else ten over it and
 *  twelve under, 68 (BAR_REM). The pill is this row alone: the title row
 *  over it went for the map's room (the owner, 2026-11-10). */
function barRowPad(underGrabber: boolean) {
  if (underGrabber) return "h-[4.75rem] pt-6 pb-1.5";
  return cn("h-[4.25rem] pb-3", ROW_PAD);
}
/** Those rows' heights, for what pins under them (--sheet-head). */
const BAR_ALONE = "4.75rem";
const BAR = "4.25rem";
const RANK: Record<PanelState, number> = { peek: 0, half: 1, full: 2 };

/** Under the head, the body and the foot a shade darker than the glass
 *  over them, the grey of notes and the blue of tappable words a step
 *  darker on it for WCAG's 4.5:1 (design/tokens.json's -shade tokens). */
const SHEET_BELOW = "[--muted-foreground:var(--muted-foreground-shade)] [--tint:var(--tint-shade)] print:bg-transparent";

/**
 * iOS's grabber: 36 by 5 in a button a little wider, at the sheet's free
 * edge: the top of a bottom sheet, the foot of a top sheet or the side
 * panel. A finger drags the sheet from it (the Drawer's own swipe); tapped
 * it cycles the heights, small to big and back, and the arrow keys step
 * them, for a keyboard and VoiceOver.
 */
export function SheetGrabber({
  label,
  size,
  ask,
  at,
}: {
  label: string;
  size: PanelState;
  ask: (s: PanelState) => void;
  at: "top" | "bottom";
}) {
  const [was, setWas] = useState(size);
  const [rising, setRising] = useState(true);
  if (size !== was) {
    setWas(size);
    setRising(RANK[size] > RANK[was]);
  }
  const cycle = () => ask(size === "peek" || size === "full" ? "half" : rising ? "full" : "peek");
  const arrows = (event: ReactKeyboardEvent) => {
    if (event.key === "ArrowUp" && size !== "full") ask(size === "peek" ? "half" : "full");
    else if (event.key === "ArrowDown" && size !== "peek") ask(size === "full" ? "half" : "peek");
    else return;
    event.preventDefault();
  };
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={size !== "peek"}
      data-testid="sidebar-trigger-button"
      onClick={cycle}
      onKeyDown={arrows}
      // 56 by 24 to a finger, as iOS's grabber takes a drag well round its
      // bar (the sheet audit's F-SC1: it was 96 by 10), its own box that
      // size and its hit area no more than it, so what is under it -- the
      // title row's ends, the field all the way up -- is clear of it.
      className={cn(
        "absolute inset-x-0 z-30 mx-auto flex h-6 w-14 justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset print:hidden",
        "after:inset-x-0! after:top-0! after:bottom-0!",
        at === "top" ? "top-0 items-start pt-1" : "bottom-0 items-end pb-1.25",
      )}
    >
      <span className="h-[5px] w-9 rounded-full bg-muted-foreground/40" aria-hidden="true" />
    </button>
  );
}

export interface PartsProps {
  top: ReactNode;
  kept?: ReactNode;
  controls?: ReactNode;
  compact?: ReactNode;
  bar?: ReactNode;
  foot?: ReactNode;
  children: ReactNode;
  layer: "tab" | "card" | "console";
  flying: boolean;
  size: PanelState;
  atPill: boolean;
  /** The pill at rest: the body out of sight and of the keyboard's reach. */
  resting: boolean;
  /** A phone's bottom sheet (else a top sheet or the side panel). */
  fromBottom: boolean;
  onPhone: boolean;
  desktop: boolean;
  footShown: boolean;
  cardsUp: boolean;
  barShown: boolean;
  toEdge: boolean;
  edgeInset: number;
  halfChrome: number;
  sizes: ReturnType<typeof useSheetDetents>;
  panelSize: { size: PanelState; to: (size: PanelState) => void; card: boolean };
  setFoot: (node: HTMLDivElement | null) => void;
  onFootTap: () => void;
}

/** Back by the Drawer's snap offset and the finger's movement, on its
 *  curve, held still under a finger. Read through the popup's own copies
 *  (MapPanel's --sheet-offset and --sheet-swipe): Base UI registers its
 *  variables with `inherits: false`, so under the popup they were 0 and
 *  nothing followed -- a top sheet's search rode off the screen at the
 *  pill (consoles.spec, 2026-11-10). */
const FOLLOW =
  "[transform:translateY(calc(-1*(var(--sheet-offset,0px)+var(--sheet-swipe,0px))))] transition-transform duration-450 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-swiping/sheet:transition-none motion-reduce:transition-none";
/** The body cut off at a bottom sheet's figures, or past a top sheet's
 *  edge, by the same offset. */
const CUT_BOTTOM = "[clip-path:inset(0_0_max(0px,calc(var(--sheet-offset,0px)+var(--sheet-swipe,0px)))_0)]";
const CUT_TOP = "[clip-path:inset(0_0_max(0px,calc(-1*(var(--sheet-offset,0px)+var(--sheet-swipe,0px))))_0)]";

/**
 * What the sheet holds, the same in the Drawer and the side panel: one
 * scroller, its head's band (the first row, the top row, the controls)
 * sticky at its top and the body under it, laid out at every size and cut
 * off where the sheet ends; and the route's figures pinned at its foot --
 * in the pill its one row.
 *
 * The head is in the body's own scroller, `position: sticky; top: 0`,
 * frosted (frost-head), so what scrolls passes under it by the browser's
 * own layout: no height of it measured, no scroller pulled up under it.
 * A card, which has the sheet to itself (no search over it), is its own
 * scroller filling the room under an empty head, its title row sticky at
 * its top (PinnedHead) and its tabs under that.
 */
export function SheetParts(p: PartsProps) {
  const { atPill, fromBottom, size, sizes, footShown, cardsUp, setFoot } = p;
  const headerShown = !p.flying && !cardsUp && (atPill ? !p.barShown : p.top != null || !p.barShown);
  const headContent = atPill ? p.compact : p.top;
  const keptHere = p.kept != null && headerShown && headContent === p.kept;
  const under = !atPill;
  // Where the panel's top-right button sits, one place in every panel.
  const topSheet = p.onPhone && !fromBottom;
  const headPad = topSheet ? "max(0.5rem, env(safe-area-inset-top))" : "0.25rem";
  const bodyPad = topSheet ? "env(safe-area-inset-top)" : "0px";
  const vars = {
    "--corner-line": "calc((2.875rem - 36px) / 2)",
    "--corner-inset": `calc(${headPad} - ${bodyPad} + (2.875rem - 36px) / 2)`,
  } as CSSProperties;
  const pillFoot = size === "peek" && !!(p.bar || p.compact);
  const bandOnly = !!p.bar && p.barShown && !headerShown;
  const sheetHead = bandOnly ? `calc(${p.fromBottom ? BAR_ALONE : BAR}${topSheet ? " + env(safe-area-inset-top)" : ""})` : "0px";
  // A card or a page at the pill, with no search and no pill of its own
  // over it: its one title row (PinnedHead, data-sheet-head) shown in the
  // pill's room, the rest of it out of sight, a tap on the row raising it
  // back to half, as Apple Maps' place card at its smallest (the owner,
  // 2026-11-11: Settings dragged to the smallest size left the sheet empty).
  const headAlone = atPill && !p.flying && !p.barShown && !(headerShown && headContent != null);
  // On a phone, what stays in sight at the sheet's free edge while the
  // popup, laid out at its full height, slides: moved back by the Drawer's
  // own offset and the finger's (its CSS variables), on its curve, and the
  // body cut off where those parts begin. A bottom sheet's figures; a top
  // sheet's head and body.
  const follows = p.onPhone ? FOLLOW : undefined;

  return (
    <>
      <div
        data-sheet-scroll=""
        // Where a list's pinned head sticks under the head band (PinnedHead):
        // the search's row, a fixed height, where that is all the band holds
        // (a tab's lists); none over a card, which has the sheet to itself.
        // A row focused or brought into view stops under the search's row,
        // not behind it (WCAG 2.4.11).
        style={{ "--sheet-head": sheetHead, scrollPaddingTop: sheetHead } as CSSProperties}
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:none] print:overflow-visible",
          topSheet && cn(follows, CUT_TOP),
          p.onPhone && fromBottom && footShown && CUT_BOTTOM,
        )}
      >
        <div
          data-head-band=""
          style={vars}
          // Sticky at the scroller's top, frosted wherever the body runs on
          // up under it, the grabber's room inside it (the owner's iPhone,
          // 2026-11-11: clear, the list showed through the band).
          className={cn("sticky top-0 flex shrink-0 flex-col", under && "frost-head z-20", topSheet && "pt-[env(safe-area-inset-top)]")}
        >
          {p.bar && (
            <div
              className={cn(
                "flex shrink-0 px-4",
                barRowPad(p.fromBottom),
                !p.barShown && "hidden",
                // All the way up on a phone the search alone is pinned at the
                // top, a hairline under it, as Apple Maps' is.
                p.onPhone && size === "full" && "border-b border-border",
              )}
            >
              <PanelSize.Provider value={p.panelSize}>{p.bar}</PanelSize.Provider>
            </div>
          )}
          <div
            className={cn(
              "relative flex flex-col",
              p.bar && p.barShown && !atPill && SHEET_BELOW,
              ((!headerShown && p.kept == null) || headAlone) && "hidden",
            )}
          >
            {(headerShown || p.kept != null) && (
              <header
                className={
                  !headerShown
                    ? "contents"
                    : cn(
                        "@container flex items-center gap-2 print:hidden",
                        atPill ? cn("px-2.25 pb-3", ROW_PAD) : p.top == null ? undefined : cn("px-3 pb-1", p.barShown ? "pt-1" : ROW_PAD),
                      )
                }
              >
                {/* The kept row first, in the one place whatever is shown, so
                    it is never built again; out of sight inert and not laid
                    out (tab-away). */}
                {p.kept != null && (
                  <div className={keptHere ? "contents" : "tab-away pointer-events-none absolute"} inert={!keptHere}>
                    {p.kept}
                  </div>
                )}
                {headerShown && !keptHere && headContent}
              </header>
            )}
            {headerShown && !atPill && p.controls && (
              <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-3 px-3 pt-1 print:hidden", topSheet ? "pb-5" : "pb-1.5")}>
                {p.controls}
              </div>
            )}
          </div>
        </div>
        {/* eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-static-element-interactions -- a pointer convenience, not a control: the grabber is the keyboard's way to raise the sheet, and the card's own buttons stay focusable */}
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            size !== "peek" && !fromBottom && "pb-4",
            SHEET_BELOW,
            p.resting && "invisible",
            p.resting && headAlone && "[&_[data-sheet-head]]:visible",
            !p.onPhone && size === "peek" && "hidden",
          )}
          inert={p.resting && !headAlone}
          // The room at half for a card fitted to it (ProfileCard,
          // PastFlightCard): changed as it sets off and at rest, never per frame.
          style={{ "--half-body": `${sizes.halfBody}px` } as CSSProperties}
          data-panel-body=""
          // On a phone, Drawer.Content's own mark: a mouse dragged across the
          // body selects its words rather than moving the sheet (a finger
          // still moves it, where the body's lists are not scrolling).
          data-drawer-content={p.onPhone ? "" : undefined}
          onClick={
            p.resting && headAlone
              ? (event) => {
                  if (!(event.target instanceof Element) || !event.target.closest("button, a, input, [role=button]")) p.onFootTap();
                }
              : undefined
          }
        >
          <TabKept away={cardsUp} still={p.layer === "console"}>
            {p.children}
          </TabKept>
          <SheetCardHost shown={cardsUp} />
        </div>
      </div>
      {!!p.foot && (footShown || cardsUp) && (
        // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-static-element-interactions -- a pointer convenience, not a control: the grabber is the keyboard's way to open the sheet, and the figures' own buttons stay focusable
        <div
          ref={setFoot}
          data-testid="panel-foot"
          className={cn(
            // One box at the pill and all the way up, the figures centred
            // in it at their large size; at half small, the box only as tall
            // as they are (the owner, 2026-11-05). What gives way in the
            // pill (data-pill-hides) is put away there.
            "relative z-10 flex shrink-0 flex-col justify-center border-t print:hidden",
            fromBottom && follows,
            fromBottom || size !== "half" ? "pb-1" : "pb-4",
            size === "half" ? "min-h-0" : "min-h-[3.875rem]",
            ROW_PAD,
            p.layer === "card" ? "px-0" : "px-4",
            !footShown && "hidden",
            pillFoot ? "border-transparent [&_[data-pill-hides]]:hidden [&>*]:flex-none" : cn("border-border/60", SHEET_BELOW),
          )}
          style={
            {
              "--sheet-progress": size === "half" && !p.desktop ? "0" : "1",
              ...(p.toEdge && fromBottom && !pillFoot ? { paddingBottom: Math.max(10, p.edgeInset) } : {}),
            } as CSSProperties
          }
          // In the pill a tap on it opens it half way.
          onClick={pillFoot ? p.onFootTap : undefined}
        >
          {p.foot}
        </div>
      )}
      {/* The rest of the way to the screen's edge, under the home
          indicator -- in the body where it runs to the edge (toEdge). */}
      {!p.toEdge && p.edgeInset > 0 && <div className="shrink-0" style={{ height: p.edgeInset }} aria-hidden="true" />}
    </>
  );
}
