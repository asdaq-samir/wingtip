import type { MouseEvent, ReactNode } from "react";
import type { PanelState } from "../../lib/mapChrome";
import type { SheetPages } from "../../lib/sheetPages";

/** What the sheet holds, as MapPanel is given it: its rows, body and foot. */
export interface SheetSlots {
  top: ReactNode;
  kept?: ReactNode;
  controls?: ReactNode;
  compact?: ReactNode;
  bar?: ReactNode;
  foot?: ReactNode;
  children: ReactNode;
  /** The sheet's two pages, Search and FPL, turned by the toggle at their
   *  first row's end (PageToggle, SheetPages). */
  pages?: SheetPages;
}

/** How the sheet is laid out this render, worked out once by MapPanel and
 *  read by each of its parts (SheetParts, SheetHead, SheetScroller, SheetFoot). */
export interface SheetLayout {
  layer: "tab" | "card";
  flying: boolean;
  size: PanelState;
  /** At the pill: the body out of sight and of the keyboard's reach. */
  atPill: boolean;
  /** A phone's bottom sheet (else a top sheet or the side panel). */
  fromBottom: boolean;
  onPhone: boolean;
  desktop: boolean;
  footShown: boolean;
  /** The foot is FPL's fixed bar beside the Drawer's popup (sheet/FootBar),
   *  not drawn in the sheet. */
  footBar: boolean;
  cardsUp: boolean;
  barShown: boolean;
  toEdge: boolean;
}

/** The sheet's size and how to ask another, for what its rows hold (PanelSize). */
export type PanelSizeValue = { size: PanelState; to: (size: PanelState) => void; card: boolean };

/** The first row's room under the grabber: ten points, the grabber's bar
 *  in it four from the edge. */
export const ROW_PAD = "pt-2.5";

/** Under the head, the body and the foot a shade darker than the glass
 *  over them, the grey of notes and the blue of tappable words a step
 *  darker on it for WCAG's 4.5:1 (design/tokens.json's -shade tokens). */
export const SHEET_BELOW = "[--muted-foreground:var(--muted-foreground-shade)] [--tint:var(--tint-shade)] print:bg-transparent";

/** A tap on a pill's row raises the sheet, but not one on a control in it. */
export function tapOpens(event: MouseEvent, open: () => void) {
  if (!(event.target instanceof Element) || !event.target.closest("button, a, input, [role=button]")) open();
}
