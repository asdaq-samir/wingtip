import { useMediaQuery } from "./use-media-query";
import { SIZE } from "../lib/tokens";

/** A desktop's window: at least design/tokens.json's size.desktop wide
 *  (1024, Tailwind's lg) and a mouse or a trackpad to point with. An
 *  iPad held wide, all touch, is not one: it keeps the touch layout. */
const QUERY = `(min-width: ${SIZE.desktop}px) and (pointer: fine)`;

/** Whether the page is on a desktop: hover and the keyboard's shortcuts
 *  shown (Kbd). Read as the page renders, as
 *  useIsMobile is, so the first frame is already the right layout. */
export function useIsDesktop(): boolean {
  return useMediaQuery(QUERY);
}

/** The same, read once outside a render: where the page starts. */
export const isDesktopNow = (): boolean => typeof window !== "undefined" && window.matchMedia(QUERY).matches;
