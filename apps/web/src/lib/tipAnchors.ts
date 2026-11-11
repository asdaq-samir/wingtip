import { useCallback } from "react";
import { create } from "zustand";

/**
 * The controls a first-run tip is about (lib/firstRunTips), each
 * registered by itself (useTipAnchor) and watched by one
 * IntersectionObserver, where TipHost looked the page over every 700 ms
 * for any `data-tip` (the stock audit's W9). `inView` is the ones on the
 * screen now, with their tip's id; TipHost offers a tip from it.
 */
export const useTipSight = create<{ inView: readonly { id: string; el: HTMLElement }[] }>(() => ({ inView: [] }));

const ids = new WeakMap<Element, string>();
const seen = new Set<Element>();
let watch: IntersectionObserver | null = null;

function shown() {
  const inView: { id: string; el: HTMLElement }[] = [];
  for (const el of seen) {
    const id = ids.get(el);
    if (id) inView.push({ id, el: el as HTMLElement });
  }
  useTipSight.setState({ inView });
}

function observer(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  watch ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) seen.add(entry.target);
      else seen.delete(entry.target);
    }
    shown();
  });
  return watch;
}

/** A ref for the control tip `id` is about: watched while it is drawn.
 *  With no id, nothing. */
export function useTipAnchor(id: string | undefined) {
  return useCallback(
    (el: HTMLElement | null) => {
      const io = observer();
      if (!el || !io || !id) return;
      ids.set(el, id);
      io.observe(el);
      return () => {
        io.unobserve(el);
        if (seen.delete(el)) shown();
      };
    },
    [id],
  );
}
