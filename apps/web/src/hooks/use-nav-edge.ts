import { useIsMobile } from "./use-mobile";
import type { NavEdge } from "../lib/preferences";

/**
 * The screen edge the navigation bar is on -- the map panel with the
 * route and the console's button (MapPanel): the bottom on a phone --
 * where a thumb reaches it, as Maps puts its sheet; no longer a setting,
 * the owner's 2026-11-13 -- and the top from `md` up, the side panel's.
 * On a phone the consoles and every panel come in from it; the map's
 * buttons and the toasts take the other one.
 *
 * The styling that follows it is CSS (index.css's `nav-bottom`
 * variant, a media query), which knows a phone from
 * the first frame; this is for what the stock components take as a
 * prop -- a sheet's side, a drawer's direction, the toaster's corner.
 */
export function useNavEdge(): NavEdge {
  return useIsMobile() ? "bottom" : "top";
}
