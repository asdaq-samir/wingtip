import type { ComponentProps } from "react";
import { cn } from "cn";
import { Button } from "./ui/button";
import { EXPANDED_BUTTON } from "./expandedButton";
import { usePopups } from "./popupsChunk";

type Props = ComponentProps<typeof Button> & {
  /** Names the button once: the tooltip's text and the accessible name. */
  label: string;
  /** A round pane of glass, as Maps' buttons are on iOS 26: the console's
   *  gear, every panel's close (CloseButton), Share, Refresh, a row's
   *  "⋯". The stock Button's glass variant, made round at 44 points, the
   *  size of iOS 26's glass buttons in a sheet's head (the owner,
   *  2026-11-20: "let's do what Apple does"), the glyph the caller's at
   *  20 (`size-5`). */
  round?: boolean;
};

/**
 * Every icon-only button in this app, the one wrapper over the stock
 * shadcn Button (ui/button): `size="icon"` unless told otherwise, ghost
 * unless told otherwise or `round`, inside a Tooltip that shows the same
 * text the accessible name carries. RoundButton was a second wrapper for
 * the glass circles; it is this one's `round` now (the owner, 2026-11-17).
 *
 * It composes like the Button itself -- `render` with a Link inside, a
 * `PopoverTrigger`/`SheetTrigger render` outside -- because every other
 * prop, `ref` included, lands on the Button, `size` among them: a shared
 * component rigid about its size had callers writing their own.
 *
 * A button that has opened something -- `aria-expanded` true: a
 * console, the drawer -- carries a ring for as long as it stays open,
 * so the header says which one is out (see `EXPANDED_BUTTON`).
 *
 * A finger has no hover, so on a touch screen a long press shows the
 * label (half a second, as iOS's own long-press labels take), and the
 * tap that ends it does not also press the button. Without it the
 * label was the screen reader's alone: a sparkle or a wand meant
 * nothing to a sighted pilot on a phone.
 */
export default function IconButton({ round = false, ...given }: Props) {
  const props = round
    ? { variant: "glass" as const, size: "icon-round" as const, ...given, className: cn("shrink-0 rounded-full", given.className) }
    : given;
  // Its tooltip is on the popups' chunk (popupsChunk): until that is in,
  // the button alone, named the same.
  const popups = usePopups();
  if (popups) return <popups.IconTip {...props} />;
  const { label, variant = "ghost", size = "icon", className, ...rest } = props;
  return <Button variant={variant} size={size} aria-label={label} className={cn(EXPANDED_BUTTON, className)} {...rest} />;
}
