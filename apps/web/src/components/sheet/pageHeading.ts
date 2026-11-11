import { create } from "zustand";

/** The page the sheet's pager is moving to while it moves -- under a
 *  finger, or flung, or scrolled to by the app -- and null at rest: from
 *  Embla's own scroll progress (SheetPager), for the split grabber's
 *  capsule (SheetGrabber) to name it before the page is picked. */
export const usePageHeading = create<{ heading: number | null }>(() => ({ heading: null }));

export function setPageHeading(heading: number | null) {
  usePageHeading.setState((s) => (s.heading === heading ? s : { heading }));
}
