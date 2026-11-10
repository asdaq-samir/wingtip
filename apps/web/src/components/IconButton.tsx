import type { ComponentProps } from "react";
import { cn } from "cn";
import { Button } from "./ui/button";
import { EXPANDED_BUTTON } from "./expandedButton";
import { usePopups } from "./popupsChunk";

type Props = ComponentProps<typeof Button> & {
  /** Names the button once: the tooltip's text and the accessible name. */
  label: string;
};

/**
 * Every icon-only button in this app: a stock shadcn Button at
 * `size="icon"` unless told otherwise, ghost unless told otherwise,
 * inside a Tooltip that shows the same text the accessible name
 * carries.
 *
 * `size` used to be omitted from the props on purpose, which read as
 * "this component decides the size" and worked out as "anyone who
 * needs another size writes their own button instead" -- which is what
 * the training map's popup did with three of them. A shared component
 * that is rigid about the wrong thing is not shared for long. It
 * composes like the Button itself -- `render` with a Link inside, a
 * `PopoverTrigger`/`SheetTrigger render` outside -- because every
 * other prop, `ref` included, lands on the Button.
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
export default function IconButton(props: Props) {
  // Its tooltip is on the popups' chunk (popupsChunk): until that is in,
  // the button alone, named the same.
  const popups = usePopups();
  if (popups) return <popups.IconTip {...props} />;
  const { label, variant = "ghost", size = "icon", className, ...rest } = props;
  return <Button variant={variant} size={size} aria-label={label} className={cn(EXPANDED_BUTTON, className)} {...rest} />;
}
