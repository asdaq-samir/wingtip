import { useEffect } from "react";

/**
 * While the search is in use all the way up on a phone, its title row and
 * field scroll away with the suggestions under them, as one body, as
 * Apple Maps' on the web do (the owner's screenshot, 2026-11-10): the
 * head is pulled up by as much as the list under it has scrolled, up to
 * its own height, and comes back as the list goes back to its top. Only
 * the head moves, never out of the page, so the field keeps its focus and
 * the keyboard stays up. Read from the body's scroll (any scroller in it)
 * as it happens, written straight to the head's style: a frame's work, no
 * render. The Drawer's own swipe is untouched, which takes a drag only
 * with the list at its top.
 */
export function useScrollAway(head: HTMLElement | null, body: HTMLElement | null, on: boolean) {
  useEffect(() => {
    if (!head || !body) return;
    // Through the style's own methods: the head is the caller's element.
    const pull = (px: number) => (px ? head.style.setProperty("margin-top", `${-px}px`) : head.style.removeProperty("margin-top"));
    pull(0);
    if (!on) return;
    let frame = 0;
    const follow = (event: Event) => {
      const scroller = event.target;
      if (!(scroller instanceof HTMLElement)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const away = Math.min(Math.max(scroller.scrollTop, 0), head.offsetHeight);
        pull(away);
      });
    };
    body.addEventListener("scroll", follow, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      body.removeEventListener("scroll", follow, { capture: true });
      pull(0);
    };
  }, [head, body, on]);
}
