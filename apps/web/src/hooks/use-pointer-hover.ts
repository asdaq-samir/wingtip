import { useMediaQuery } from "./use-media-query";

/** A mouse or a trackpad: a pointer that can rest on something. */
const QUERY = "(hover: hover) and (pointer: fine)";

/** Whether hover previews belong here (the owner, 2026-11-09: on pointer
 *  devices only): a finger's tap is the thing's own, never a preview. */
export function usePointerHover(): boolean {
  return useMediaQuery(QUERY);
}
