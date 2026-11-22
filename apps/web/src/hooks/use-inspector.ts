import { useMediaQuery } from "./use-media-query";
import { SIZE } from "../lib/tokens";

/** A touch screen at least design/tokens.json's size.inspector wide (1180:
 *  an 11-inch iPad on its side, a 13-inch one, a wide Stage Manager
 *  window). A desktop's fine pointer is not one: its cards keep the side
 *  panel's one box (web.md, "Desktop versus phone"). */
const QUERY = `(min-width: ${SIZE.inspector}px) and (pointer: coarse)`;

/**
 * Whether the cards open in an inspector column at the map's right, the
 * plan staying in the side panel at its left, as the iPad app lays out
 * at the regular width (SplitLayout's `.inspector`, Apple Maps on an iPad
 * opening a place beside the map): there is room for the map between
 * them only this wide. Narrower, a card covers the side panel. The owner,
 * 2026-11-21: "Yes do it all for iPad", the iPad app's inspector matched
 * on the web at the regular width.
 */
export function useInspector(): boolean {
  return useMediaQuery(QUERY);
}
