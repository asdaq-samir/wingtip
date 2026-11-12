import type { ComponentProps, ReactNode } from "react";
import { cn } from "cn";
import { Toggle } from "@base-ui/react/toggle";
import { Button, GLASS_BUTTON } from "./ui/button";
import { TEXT } from "../lib/text";
import { Spinner } from "./ui/spinner";
import { Kbd } from "./ui/kbd";

/**
 * One of a card's actions under its head -- the airport card's Fly Here,
 * Add Stop, Call and Address, the airplane card's Follow, Flights,
 * Registry and Share -- one look on every card.
 *
 * A tile of the card's action row: its glyph over its word, as Maps
 *  draws its own -- Fly Here filled in the tint, the rest panes of glass
 *  in the text's colour, as the gear and the route's close are, at the
 *  pilot's ask (they were the tint on grey). A 20-point glyph in a tile
 *  about 50 tall, at the pilot's ask: 70 tall, with Maps' 24-point glyph,
 *  they put the card's tabs under the half sheet's foot. The box in
 *  points, its word in the reader's size: the glyph, padding and gap are
 *  fixed, but the word's line still grows with the text size (checked at
 *  a 19 px root, not at the largest sizes). */
export function CardAction({
  icon,
  label,
  spoken,
  filled,
  destructive,
  busy,
  disabled,
  onClick,
  href,
  testId,
  pressed,
  keys,
  ...trigger
}: {
  icon: ReactNode;
  label: string;
  filled?: boolean;
  onClick?: () => void;
  testId: string;
  /** An action that takes something away (the Route Leg sheet's Remove):
   *  its glyph and word in iOS's red, where the rest are the tint. */
  destructive?: boolean;
  /** A switch's state, said: Follow on or off. */
  pressed?: boolean;
  /** Where it goes instead, outside the app: a phone number to call, the
   *  field in Maps. */
  href?: string;
  /** The whole word, where the tile shows it cut short. */
  spoken?: string;
  /** Until the card's answer is in: the tile in its place, not yet live. */
  disabled?: boolean;
  /** Tapped, and its work under way: a spinner in place of its symbol,
   *  which turns on the compositor while the page is busy drawing what
   *  the tap asked for. */
  busy?: boolean;
  /** Its key on a desktop, shown beside its word (aria-keyshortcuts too):
   *  the airport card's Alt+F, Alt+D and Alt+S. */
  keys?: string;
} & Omit<ComponentProps<"button">, "children" | "onClick" | "disabled">) {
  // Its sides four points in, not the stock button's ten: the room a
  // word needs to stay on its one line (below) at the text sizes a reader
  // sets larger.
  // The others iOS's grey tiles with their glyph and word in the tint, as
  // Apple's Maps on the web draws a place's Call and Website (the owner's
  // screenshot, 2026-10-26).
  const look = cn(
    // No edge on any, Fly Here's filled one too: the stock button's
    // clear one inset its fill a point, out of line with the tiles beside
    // and under it (the sheet audit's F-B2).
    "h-auto min-w-0 flex-col gap-0.5 rounded-xl border-0 px-1 py-1.5 [&_svg:not([class*='size-'])]:size-[20px]",
    !filled &&
      cn(
        GLASS_BUTTON,
        // Its grey kept at 8% while its menu is open (GLASS_BUTTON's 12% there):
        // on the darker grey the tint read 4.44 to 1, short of WCAG's 4.5 (the
        // iOS audit's P15, an airplane's Alert menu, 2026-11-05); the menu
        // under it says it is open.
        destructive ? "text-destructive-ink hover:text-destructive-ink" : "text-tint hover:text-tint",
        "aria-expanded:bg-foreground/8",
      ),
  );
  const face = (
    <>
      {busy ? <Spinner className="size-[20px]" aria-hidden="true" /> : icon}
      {/* On one line, at the pilot's ask: "Fly Here" and "Add Stop" on
          two at a larger text size made every tile a line taller, and
          the card's tiles ran off the half sheet. Wrapped, not cut
          short, only where even that is too narrow, a 320-point Slide Over:
          HIG says not to truncate a button's title. */}
      <span className={cn("max-w-full text-center leading-tight font-semibold", TEXT.note)}>
        {label}
        {keys && (
          <Kbd aria-hidden="true" className="ml-1 align-middle">
            {keys}
          </Kbd>
        )}
      </span>
    </>
  );
  // A link where it leaves the app, the stock button's look on it.
  if (href && !disabled) {
    return (
      <Button
        variant={filled ? "default" : "secondary"}
        className={look}
        nativeButton={false}
        render={
          <a
            href={href}
            target={href.startsWith("tel:") ? undefined : "_blank"}
            rel="noreferrer"
            data-testid={testId}
            aria-label={spoken}
          />
        }
      >
        {face}
      </Button>
    );
  }
  // What a menu's trigger hands its button (DropdownMenuTrigger asChild:
  // its ref, its pointer and key handlers, aria-expanded) goes on it, so
  // a tile can open a menu, as the airplane card's Alert does.
  const own = {
    type: "button" as const,
    variant: filled ? ("default" as const) : ("secondary" as const),
    ...trigger,
    onClick,
    disabled,
    "data-testid": testId,
    "aria-label": spoken,
    "aria-busy": busy || undefined,
    // "Alt+F", as aria-keyshortcuts names it (lib/shortcutKeys).
    "aria-keyshortcuts": keys,
    className: look,
  };
  // A tile that is on or off is Base UI's Toggle (aria-pressed its own).
  return pressed === undefined ? (
    <Button {...own}>{face}</Button>
  ) : (
    <Toggle pressed={pressed} disabled={disabled} render={<Button {...own} />}>
      {face}
    </Toggle>
  );
}
