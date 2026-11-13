import { create } from "zustand";
import { sharedLinkOf, withoutSharedLink, type SharedLink } from "../../lib/sharedFlight";

/** The shared flight waiting for the receiver's answer, if one is. */
export const useSharedLink = create<{ link: SharedLink | null }>(() => ({ link: null }));

export const closeSharedLink = () => useSharedLink.setState({ link: null });

/**
 * A shared flight's link, taken off the address as the page opens
 * (main.tsx), before the planner reads its route from it: the web's plan
 * is its address, so a link's `dep` and `dest` left there would plan the
 * shared route at once. Kept here instead for the preview, which plans it
 * only on Use This Plan; the rest of the address is the receiver's own,
 * given back for the router to put in its place (React Router's navigate,
 * replacing) and for the first load to read; null with no link in it.
 */
export function takeSharedLinkFrom(search: string): URLSearchParams | null {
  const params = new URLSearchParams(search);
  const link = sharedLinkOf(params);
  if (!link) return null;
  useSharedLink.setState({ link });
  return withoutSharedLink(params);
}
