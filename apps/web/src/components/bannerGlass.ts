import { cn } from "cn";
import { GLASS } from "../lib/mapChrome";

/** A banner's ink: a warning's red and a caution's amber, as a cockpit's
 *  are; `tint` a line of the app's own (its glyph in the tint, its words
 *  the text's); `plain` the text's ink throughout. */
export type BannerTone = "warning" | "caution" | "tint" | "plain";

export const BANNER_INK: Record<BannerTone, string> = {
  warning: "text-destructive-ink",
  caution: "text-caution-ink",
  tint: "text-foreground",
  plain: "text-foreground",
};

/**
 * The glass every banner over the map stands on, in the banners' column
 * (MapBanners, the one place they stack, eight apart): the map buttons'
 * glass at the banner's corner. As wide as its line, or `wide` for a card
 * with a row of choices (the radio's and the ATC copilot's calls, the
 * weather loop's bar), which takes the column's width up to 28 rem.
 */
export function bannerGlass(wide = false) {
  return cn(GLASS, "pointer-events-auto rounded-(--radius-banner)", wide ? "w-full max-w-md" : "w-fit max-w-full");
}
