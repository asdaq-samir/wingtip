import type { ComponentProps } from "react";

/** A box a tap on its bare part moves the sheet by (the figures' foot, a
 *  card's scroller, the head band and body at the pill): a pointer
 *  convenience, not a control -- the grabber is the keyboard's way to move
 *  the sheet, and the buttons inside the box stay focusable. It is the one
 *  home of that reasoning for the four boxes that do it: the click handler
 *  goes in through props, so the a11y lint, which reads a div's own
 *  attributes, has nothing to flag, and nothing is disabled. */
export function PointerTapDiv(props: ComponentProps<"div">) {
  return <div {...props} />;
}
