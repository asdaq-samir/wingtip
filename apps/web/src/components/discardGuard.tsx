import type { ReactNode } from "react";
import { useConfirm } from "./useConfirm";

/**
 * A form swiped closed, or put away by its Cancel, Escape or a tap beside
 * it, asks before what was typed in it is thrown away, as an iOS sheet with
 * an edit asks (the one scrolling rule, the owner 2026-11-10): Discard
 * closes it, Cancel leaves the form as it was. With nothing typed it
 * closes at once. Give the result's first to SheetDialog's onOpenChange and
 * draw its second beside the form.
 */
export function useDiscardGuard(dirty: boolean, close: () => void): [(open: boolean) => void, ReactNode] {
  const [ask, question] = useConfirm({
    title: "Discard your changes?",
    description: "What you typed here isn't kept.",
    confirmLabel: "Discard",
    destructive: true,
    onConfirm: close,
  });
  const onOpenChange = (open: boolean) => {
    if (open) return;
    if (dirty) ask();
    else close();
  };
  return [onOpenChange, question];
}
