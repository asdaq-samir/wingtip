import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSheetTop } from "./sheetTopSlot";

/**
 * What rides on a phone's bottom sheet's top edge -- the radio's button
 * at the left, the first flight's card -- drawn inside the stock Drawer's
 * popup, just over its top (bottom: 100%), so it moves with the sheet
 * frame by frame under a finger and on the Drawer's own curve, as Apple
 * Maps' buttons ride its sheet. Where there is no bottom sheet (a top
 * sheet, the side panel) it is drawn where it is, over the map; `children`
 * is told which, for its place. A portal: the caller's providers (the
 * map's) stay its own.
 */
export function OnSheetTop({ children }: { children: (onSheet: boolean) => ReactNode }) {
  const slot = useSheetTop((s) => s.slot);
  return slot ? createPortal(children(true), slot) : children(false);
}
