import { useMediaQuery } from "./use-media-query";
import { SIZE } from "../lib/tokens";

/** Narrower than iPadOS's regular width (design/tokens.json size.regular,
 *  660, Tailwind's md in index.css): an iPhone upright, an iPad's 1/3 or
 *  an 11-inch iPad's 1/2 Split View, a narrow Stage Manager window. From
 *  it up the panel is the side panel: an iPad mini upright (744) and a
 *  13-inch iPad's half (about 680) had the phone's sheet the window's
 *  width (the owner: "Yes do it all for
 *  iPad"). */
const QUERY = `(max-width: ${SIZE.regular - 0.02}px)`;

/**
 * Whether the window is a phone's width (compact). shadcn's generated hook, read
 * as the page renders rather than set in an effect after it: its first
 * render said "not a phone", and on an iPhone that first frame was
 * painted -- the map's panel drawn as a desktop's card, white and the
 * screen's width, then eased into the phone's pill (the owner's "on a
 * fresh load, the tabs seem to move down to a pill", seen frame by frame
 * in their screen recording).
 */
export function useIsMobile() {
  return useMediaQuery(QUERY);
}
