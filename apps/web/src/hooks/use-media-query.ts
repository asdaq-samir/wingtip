import { useSyncExternalStore } from "react";

/** Whether a media query matches, read as the page renders rather than set
 *  in an effect after it, so the first frame is already the right layout
 *  (a phone's pill, a desktop's panel). Server-side it is false. The three
 *  the app asks (use-mobile, use-desktop, use-pointer-hover) share it. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
