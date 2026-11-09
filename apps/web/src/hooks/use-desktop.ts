import { useSyncExternalStore } from "react";
import { SIZE } from "../lib/tokens";

/** A desktop's window: at least design/tokens.json's size.desktop wide
 *  (1024, Tailwind's lg) and a mouse or a trackpad to point with. An
 *  iPad held wide, all touch, is not one: it keeps the touch layout. */
const QUERY = `(min-width: ${SIZE.desktop}px) and (pointer: fine)`;

const subscribe = (onChange: () => void) => {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
};

/** Whether the page is on a desktop: the wide side panel, hover and the
 *  keyboard's shortcuts (useShortcuts). Read as the page renders, as
 *  useIsMobile is, so the first frame is already the right layout. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
