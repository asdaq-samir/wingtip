import { useMediaQuery } from "./use-media-query";

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/**
 * Whether the window is a phone's width. shadcn's generated hook, read
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
