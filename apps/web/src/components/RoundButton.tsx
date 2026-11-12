import type { ComponentProps } from "react";
import { cn } from "cn";
import IconButton from "./IconButton";

/**
 * A round pane of glass on the map's panel, as Maps' buttons are on iOS
 * 26 -- the console's gear, every panel's close (CloseButton), Nearest,
 * Save, Share and Print, an airport's star: the stock Button at its icon
 * size (36 points) in its glass variant, made round, with a finger's 44
 * round it (index.css's pseudo-element), the glyph the caller's at 20
 * (`size-5`), one look and size in every panel, at the pilot's ask. An
 * IconButton, so its label is its tooltip and its name, and it composes
 * as one does (a menu's or a sheet's trigger).
 */
export default function RoundButton({ className, ...props }: ComponentProps<typeof IconButton>) {
  return <IconButton variant="glass" size="icon" className={cn("shrink-0 rounded-full", className)} {...props} />;
}
