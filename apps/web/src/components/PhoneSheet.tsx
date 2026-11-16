import type { ComponentProps, ReactNode } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { cn } from "cn";
import { DIM, GLASS_SHEET, SHEET_CORNERS } from "../lib/mapChrome";
import { TEXT } from "../lib/text";
import { keepOpenOn, TOAST } from "./ui/dismiss";

/**
 * A phone's sheet, the box that asks something of the pilot on a phone
 * (SheetDialog): Base UI's stock Drawer (the owner, 2026-11-10: the stock
 * sheet with its own motion, gestures and behaviour, as the map's sheet
 * is, MapPanel), up from the screen's foot and swiped back down to it,
 * where a phone's sheet always is (the owner, 2026-11-13). The Drawer follows the finger, from the grabber, the title row or
 * the content scrolled to its start, reads the throw and closes or eases
 * back on its own curve. What is the app's is the look: the solid sheet
 * (the look's --sheet, GLASS_SHEET; glass is only for what floats over the
 * map) eight points in from the screen's sides and its edge, the half sheet's
 * corners and its grabber, the dimming every sheet has (D1 of the sheets
 * audit, 2026-10-17; the sheet consolidation, 2026-10-27).
 */
export function PhoneSheet({ onOpenChange, ...props }: Drawer.Root.Props) {
  return (
    <Drawer.Root
      swipeDirection="down"
      onOpenChange={(open, details) => {
        // A toast is not outside it (ui/dismiss), nor a tap on a sheet's
        // own button as it eases out, which had opened it again.
        if (!open && keepOpenOn(details, `${TOAST}, [aria-haspopup="dialog"]`)) return;
        onOpenChange?.(open, details);
      }}
      {...props}
    />
  );
}

export const PhoneSheetTrigger = Drawer.Trigger;
export const PhoneSheetClose = Drawer.Close;

/** The sheet itself, sized to what it holds, at most 85% of the screen,
 *  and over the keyboard while it is up, as an iOS sheet rides up on it:
 *  Safari leaves a fixed sheet where it was, under the keyboard, and the
 *  address to sign in with was typed out of sight (the owner's screen
 *  recording, 2026-10-28). The keyboard's inset is the Drawer's own
 *  (VirtualKeyboardProvider's --drawer-keyboard-inset on the viewport,
 *  which it also scrolls the field typed into into sight over). */
export function PhoneSheetContent({ className, style, children, onPointerDown, ...props }: Drawer.Popup.Props) {
  return (
    <Drawer.VirtualKeyboardProvider>
      <Drawer.Portal>
        <Drawer.Backdrop
          data-slot="sheet-overlay"
          className={cn(
            "fixed inset-0 z-50 opacity-[calc(1_-_var(--drawer-swipe-progress,0))] transition-opacity duration-(--motion-drawer) ease-(--motion-drawer-ease)",
            "data-starting-style:opacity-0 data-ending-style:opacity-0 data-swiping:duration-0 data-closed:pointer-events-none",
            DIM,
          )}
        />
        <Drawer.Viewport className="pointer-events-none fixed inset-x-0 top-0 z-50" style={{ bottom: "var(--drawer-keyboard-inset, 0px)" }}>
          <Drawer.Popup
            data-slot="sheet-content"
            data-side="bottom"
            data-floating=""
            className={cn(
              "pointer-events-auto absolute inset-x-2 flex max-h-[min(calc(85dvh-1rem),calc(100%-1rem))] flex-col overflow-hidden text-foreground outline-none",
              TEXT.detail,
              GLASS_SHEET,
              SHEET_CORNERS,
              "bottom-2",
              // The Drawer's own motion, as Base UI's drawer has it: with the
              // finger as it is swiped, in from and out to its edge on its
              // curve, out the faster the harder it was thrown.
              "transition-transform duration-(--motion-drawer) ease-(--motion-drawer-ease) data-swiping:duration-0 data-swiping:select-none",
              "data-ending-style:duration-[calc(var(--drawer-swipe-strength,1)*400ms)] motion-reduce:transition-none",
              "[transform:translateY(var(--drawer-swipe-movement-y))] data-starting-style:[transform:translateY(calc(100%_+_1rem))] data-ending-style:[transform:translateY(calc(100%_+_1rem))]",
              className,
            )}
            style={style}
            onPointerDown={(event) => {
              onPointerDown?.(event);
              // Its own, not the map's sheet's: a sheet opened from inside the
              // map's sheet is its child in React's tree though portalled out
              // of it in the page's, and a press here went on up to the map
              // sheet, which then took the finger.
              event.stopPropagation();
            }}
            {...props}
          >
            {/* iOS's grabber, 36 by 5, five points in from the sheet's top. */}
            <div
              aria-hidden="true"
              data-swipe-handle=""
              className="absolute inset-x-0 top-0 z-10 flex h-4 items-start justify-center pt-1.25"
            >
              <span className="h-[5px] w-9 rounded-full bg-muted-foreground/40" />
            </div>
            {children}
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.VirtualKeyboardProvider>
  );
}

/**
 * A phone's sheet's title row, as an iOS sheet's navigation bar is: its
 * title, the app's close (CloseButton) at the row's end -- or a form's
 * Cancel at its start and its Add or Set at its end, the title between --
 * and what the sheet is about under it.
 */
export function PhoneSheetHeader({
  title,
  description,
  leading,
  end,
}: {
  title: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  end?: ReactNode;
}) {
  return (
    <div data-slot="sheet-header" className="flex flex-row flex-wrap items-center justify-between gap-1.5 p-4 pt-5 pb-2 text-left">
      {leading}
      {/* A sheet's title at the app's size for one (TEXT). */}
      <Drawer.Title
        data-slot="sheet-title"
        className={cn("min-w-0 flex-1 font-semibold text-foreground", TEXT.title, leading && "text-center")}
      >
        {title}
      </Drawer.Title>
      {end}
      {description ? (
        <Drawer.Description data-slot="sheet-description" className={cn("basis-full text-muted-foreground", TEXT.prose)}>
          {description}
        </Drawer.Description>
      ) : null}
    </div>
  );
}

/** A phone's sheet's room under its title row: its content scrolling
 *  there when it holds more than the sheet has room for (the keyboard
 *  up), clear of the grabber at its far edge and of the home indicator
 *  the sheet floats eight points over. The Drawer's content: a mouse's
 *  drag there selects its words rather than swiping the sheet. */
export function PhoneSheetBody({ className, ...props }: ComponentProps<"div">) {
  return (
    <Drawer.Content
      className={cn("min-h-0 overflow-y-auto px-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)-0.5rem))]", className)}
      {...props}
    />
  );
}
