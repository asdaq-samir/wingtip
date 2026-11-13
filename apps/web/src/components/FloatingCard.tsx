import { useRef, type ReactNode, type Ref } from "react";
import type { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import { Dialog, DialogPopup, DialogPortal } from "./ui/dialog";
import { CARD_GLASS } from "../lib/mapChrome";

/**
 * A card floating over the map and everything on it, its buttons too, as
 * Apple Maps' iOS 27 cards are (the owner's screenshot, 2026-11-13; You
 * first, then every card but an airport's: "Except for airport card,
 * redesign the others as recommended"): ten points in from a phone's sides
 * and foot -- from `sm` up at the side panel's top corner -- its four
 * corners the floating sheet's (radius.sheet), only as tall as what is in
 * it and scrolling inside past the screen's top. Its material the sheet's
 * ground nearly whole over a heavy frost (CARD_GLASS), so nothing under it
 * is read through it; solid under Reduce Transparency or Increase Contrast. The stock Base UI Dialog, kept on the page once
 * drawn (keepMounted), so what is put in its scroller (`scrollRef`) stays
 * laid out between its openings. The sheet under it is left as it was.
 *
 * One shell for You (ConsoleLayer) and the cards (sheet/FloatingCards):
 * what each is, its head and its close, is its content's.
 */
export function FloatingCard({
  open,
  onOpenChange,
  onOpenChangeComplete,
  modal = false,
  label,
  labelledBy,
  testId,
  initialFocus,
  finalFocus,
  tall = false,
  instant = false,
  layer = 0,
  card = false,
  scrollRef,
  corners,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean, details: DialogPrimitive.Root.ChangeEventDetails) => void;
  onOpenChangeComplete?: (open: boolean) => void;
  /** You's focus held in it while it is the top one; a card's not, as
   *  the drawers it replaced were none. */
  modal?: boolean;
  label?: string;
  labelledBy?: string;
  testId?: string;
  initialFocus?: DialogPrimitive.Popup.Props["initialFocus"];
  finalFocus?: DialogPrimitive.Popup.Props["finalFocus"];
  /** All the way up whatever is in it: Emergency (the card rule's 4). */
  tall?: boolean;
  /** Put away with no fade: its content already gone with its caller. */
  instant?: boolean;
  /** Its place among the cards open (lib/sheetCards' floatLayer): the
   *  last opened over the rest, over the map's sheet (z-40) and under the
   *  menus and lists opened from them (z-50). */
  layer?: number;
  /** One of the map's cards (FloatingCards), not You: for what looks for a
   *  card (the browser tests, SheetCard's focus, index.css's kept cards). */
  card?: boolean;
  scrollRef?: Ref<HTMLDivElement>;
  /** Over what scrolls, in its corners: You's gear and ✕. */
  corners?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  // With no place given (You), the card itself, which names itself to a
  // screen reader, unless a key opened it: Base UI's own first control is
  // a corner button whose tooltip then showed as the card came, taking the
  // first Escape (a link to Settings, 2026-11-13).
  const popup = useRef<HTMLDivElement>(null);
  const focus = initialFocus ?? ((type: string) => (type === "keyboard" ? true : popup.current));
  return (
    <Dialog open={open} onOpenChange={onOpenChange} onOpenChangeComplete={onOpenChangeComplete} modal={modal}>
      <DialogPortal keepMounted>
        <DialogPopup
          aria-label={label}
          aria-labelledby={label ? undefined : labelledBy}
          ref={popup}
          initialFocus={focus}
          finalFocus={finalFocus}
          data-testid={testId}
          data-sheet-card={card ? "" : undefined}
          data-floating-card=""
          // A drag on it is its own scroller's, never the sheet's under it.
          data-base-ui-swipe-ignore=""
          style={{ zIndex: 41 + Math.min(layer, 8) }}
          className={cn(
            CARD_GLASS,
            "fixed inset-x-2.5 bottom-2.5 flex max-h-[calc(100dvh-env(safe-area-inset-top)-3rem)] flex-col overflow-hidden rounded-(--radius-sheet) text-foreground outline-none print:hidden",
            "sm:top-2.5 sm:right-auto sm:bottom-auto sm:w-96",
            tall && "h-[calc(100dvh-env(safe-area-inset-top)-3rem)]",
            instant
              ? "data-closed:animate-none"
              : "[animation-duration:var(--motion-page)] data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-4 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-4",
            className,
          )}
        >
          <div ref={scrollRef} data-floating-scroll="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {children}
          </div>
          {corners}
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
