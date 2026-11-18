import type { PanelState } from "../../lib/mapChrome";

/** The sizes a tap on a phone's sheet's grabber cycles: the pill, half and all the way up. */
export const SHEET_SIZES: readonly PanelState[] = ["peek", "half", "full"];
/** The side panel's (a desktop's, MapPanel): in at its pill or out the
 *  window's height. Half and all the way up are the same box there, so a
 *  tap that asked for all the way up from half moved nothing: the owner,
 *  with a mouse on a Mac (2026-11-18), saw only "view=full" (then
 *  "view=briefing") come into the address, a second tap again nothing,
 *  and a third put it away. The arrow keys still step all three: all the
 *  way up is what the plan's own (its nav log's rows brought into sight,
 *  usePlanView) and a link (`view`) name. */
export const SIDE_SIZES: readonly PanelState[] = ["peek", "half"];

/** Where a tap on the grabber takes the sheet among `sizes`: from an end to
 *  the next one in, from between the ends on the way it was going. A size
 *  it does not have (all the way up, by the address, on the side panel)
 *  is its largest, which it looks like. */
export function tapTo(size: PanelState, rising: boolean, sizes: readonly PanelState[]): PanelState {
  const last = sizes.length - 1;
  const at = sizes.includes(size) ? sizes.indexOf(size) : last;
  if (at === 0) return sizes[1]!;
  if (at === last) return sizes[last - 1]!;
  return sizes[rising ? at + 1 : at - 1]!;
}
