import type { ComponentProps } from "react";
import { ICON } from "../lib/icons";
import RoundButton from "./RoundButton";

/**
 * Every panel's close, one look in all of them at the pilot's ask -- the
 * route's, the cards', the console's, the airport picker's and a
 * dialog's: a RoundButton -- the stock Button, `size="icon"` in its
 * glass variant -- as the console's button and Save, Share and Print are. The cross drawn at 24 with a thinner line: lucide's spans
 * half its box where the other glyphs span most of theirs, so at their
 * 20 it read as a small mark. Its size held against a row's own glyph
 * size (`!`).
 */
export default function CloseButton({
  label = "Close",
  ...props
}: Omit<ComponentProps<typeof RoundButton>, "label" | "children"> & {
  /** What it does, where that is more than closing ("Clear the route"). */
  label?: string;
}) {
  return (
    <RoundButton label={label} {...props}>
      <ICON.close className="size-6!" strokeWidth={1.7} />
    </RoundButton>
  );
}
