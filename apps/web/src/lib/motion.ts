/** Whether the pilot asked for less motion (iOS's Reduce Motion, the
 *  system setting a browser reports as prefers-reduced-motion). The CSS
 *  rule in index.css stills transitions and animations, and MapLibre's
 *  camera honours it itself (a flyTo, easeTo or fitBounds not marked
 *  `essential` goes straight there), so the map's moves don't ask here.
 *  What moves in script of our own does: a marker's fade-in, a paint
 *  transition, Embla's page turn, a smooth scroll. Read at the move, not kept:
 *  the setting can change while the app is open. The query itself is
 *  made once and its `matches` read each time: made afresh at each ask,
 *  the map's marks asked for every mark at every frame of a zoom, 42 ms of a zoom's 4 s at CPU 4x on the phone viewport
 *  (2026-11-03). */
import { MOTION } from "./tokens";

let query: MediaQueryList | null | undefined;
export function prefersReducedMotion(): boolean {
  if (query === undefined) query = typeof window !== "undefined" ? (window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null) : null;
  return !!query?.matches;
}

/** A Web Animations timing from the tokens' motion (design/tokens.json):
 *  the sheet's or the drawer's duration and its easing curve, built in
 *  one place rather than at each animate(). */
export function timing(kind: "sheet" | "drawer"): { duration: number; easing: string } {
  const ease = kind === "sheet" ? MOTION.sheetEase : MOTION.drawerEase;
  return { duration: MOTION[kind] * 1000, easing: `cubic-bezier(${ease.join(",")})` };
}
