import { useLayoutEffect, useRef, useState } from "react";
import { raiseCard, setCard, useSheetCards, type CardFrame, type CardState } from "../../lib/sheetCards";
import { useShown } from "../../lib/shown";
import { drawnFace } from "../../lib/map/gl/glFace";
import { useLatest } from "../../lib/steady";

/**
 * A card's own nested Drawer over the map's sheet (CardStack), held while
 * the caller draws it: the scroller its content is put into, once the
 * drawer is there. Open while what it is drawn in is in sight (lib/shown):
 * under a page put away (TabKept) it is kept, closed, and opens again as
 * it was when the page is back. `id` is the card's (useCardSize).
 *
 * Held in a layout effect, so the drawer and the content are on the page
 * in the same frame as the tap, never an empty card for a frame. The
 * content is drawn in the card's own host, which the drawer's scroller
 * takes in (CardStack): the content is drawn once for the card's life, a
 * new scroller given the host, not the content -- put straight in the
 * scroller, it was built again whenever the drawer was drawn anew, and You
 * opened on Settings from the Map card's gear lost the page it was asked
 * to open on.
 */
export function useCardFrame(frame: CardFrame & { fullScreen?: boolean; title?: string; open?: boolean }, id: string): HTMLElement | null {
  // A card kept between its openings (`open`, CardLayer's) is shown only
  // while it is open; one drawn only while open is open while drawn.
  const open = frame.open ?? true;
  const shown = useShown() && open;
  const slot = useSheetCards((s) => s.stack.find((entry) => entry.id === id)?.slot ?? null);
  // `display: contents`, so the scroller lays out the content as its own.
  const [host] = useState(() => {
    const box = document.createElement("div");
    box.style.display = "contents";
    return box;
  });
  // Drawn in from its drawer's first scroller on, through a drawer made anew.
  const [placed, setPlaced] = useState(false);
  if (slot && !placed) setPlaced(true);
  // The caller's latest, read as the Drawer tells it something.
  const latest = useLatest(frame);
  const { fullScreen, title, testId, label, labelledBy } = frame;
  const state: CardState = shown ? "open" : "kept";
  const opened = useRef({ fullScreen, state });
  useLayoutEffect(() => {
    const { fullScreen, state } = opened.current;
    const entry = {
      id,
      fullScreen,
      state,
      slot: null,
      host,
      frame: {
        dismiss: latest.current.dismiss && ((details) => latest.current.dismiss?.(details)),
        initialFocus: latest.current.initialFocus,
        finalFocus: latest.current.finalFocus,
      } satisfies CardFrame,
    };
    // One opened again while its last drawer still closes takes its place.
    useSheetCards.setState((s) => ({ stack: [...s.stack.filter((e) => e.id !== id), entry] }));
    // Its caller gone (the Map card's close, an airplane's edit cancelled):
    // its drawer is closed, not taken off the page open, so Base UI's close
    // runs -- the focus handed back (finalFocus), the sheet told no card is
    // up over it, its focus manager's marks and Escape put back -- and the
    // entry goes once that close is done (CardStack's onOpenChangeComplete).
    // Taken off open, Escape after an airplane's edit cancelled no longer
    // closed Setup under it, and the focus was left on nothing.
    return () => {
      keepFace(host);
      useSheetCards.setState((s) => ({
        stack: s.stack.flatMap((e) => (e.id !== id ? [e] : e.at === undefined ? [] : [{ ...e, state: "leaving" as const }])),
      }));
    };
  }, [id, host, latest]);
  useLayoutEffect(() => setCard(id, { state }), [id, state]);
  // Opened again by the pilot, it opens by the card rule's 2 as a new card
  // does (CardStack's cardOpening), not at the size it was put away at, and
  // on top, the newest card: kept where it was first opened in the stack,
  // You opened from the Map card's gear came up under it (the owner's
  // iPhone, 2026-11-14). Kept closed under a card over it, it comes back
  // as it was.
  useLayoutEffect(() => {
    if (open) raiseCard(id);
  }, [id, open]);
  useLayoutEffect(() => setCard(id, { title }), [id, title]);
  useLayoutEffect(() => {
    const was = useSheetCards.getState().stack.find((e) => e.id === id)?.frame;
    if (was && (was.testId !== testId || was.label !== label || was.labelledBy !== labelledBy))
      setCard(id, { frame: { ...was, testId, label, labelledBy } });
  }, [id, testId, label, labelledBy]);
  return placed ? host : null;
}

/**
 * A card's content kept in sight while its drawer closes, its caller gone
 * (an airport's ✕, a card swiped away): a still copy of what was drawn,
 * put in the card's own box as React takes the caller's nodes out, so the
 * card goes back down with its face on it, as a kept card does (CardStack's
 * RISE), not as an empty card (the apple-design audit of 2026-11-23, H3).
 * A copy, because the real nodes cannot stay: they are the caller's, which
 * goes as the card closes (its store cleared on ✕), and CardLayer's `open`
 * keeps content alive only for a caller that stays drawn between openings
 * (the Nav Log, the Profile, the Stops). Keeping every caller drawn until
 * its close is done would move that into each caller's store.
 *
 * The copy is inert and hidden from assistive technology, its ids and test
 * ids taken off, so nothing finds it twice; it goes with the drawer once
 * the close is done (dropCard). Put in after React's commit, and only once
 * the caller's own nodes are gone: an effect run again in place (React's
 * StrictMode) keeps them, and then nothing is copied. A clone alone lacks
 * what is not in the markup, so each canvas's picture is drawn into its
 * copy (a MapLibre map's drawn again as it is read, glFace: WebGL keeps no
 * frame once on the screen), each typed value set, each scroller put back
 * where it was, and the copy's animations held (data-card-face, feel.css).
 * Only what can scroll is asked where it is scrolled to, not every node: a
 * layout read each on the close's first frame.
 */
/** What can be scrolled: an overflow class (Tailwind's overflow-auto,
 *  -x-, -y-, -scroll, -hidden; a script scrolls a hidden one too) or an
 *  inline overflow. */
const SCROLLERS = '[class*="overflow-"], [style*="overflow"]';

function keepFace(host: HTMLElement) {
  if (!host.isConnected) return;
  const drawn = [...host.childNodes];
  const face = drawn.map((node) => node.cloneNode(true));
  const scrolled: [Element, number, number][] = [];
  drawn.forEach((node, i) => {
    const copy = face[i];
    if (!(node instanceof Element) || !(copy instanceof Element)) return;
    copy.setAttribute("inert", "");
    copy.setAttribute("aria-hidden", "true");
    copy.setAttribute("data-card-face", "");
    for (const el of [copy, ...copy.querySelectorAll("[id], [data-testid]")]) {
      el.removeAttribute("id");
      el.removeAttribute("data-testid");
    }
    // The same tree, so the nth of a kind in one is the nth in the other.
    const canvases = copy.querySelectorAll("canvas");
    node.querySelectorAll("canvas").forEach((canvas, k) => {
      try {
        canvases[k]?.getContext("2d")?.drawImage(drawnFace(canvas), 0, 0);
      } catch {
        // A canvas with nothing to give (a lost WebGL context) stays blank.
      }
    });
    const fields = copy.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
    node.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select").forEach((field, k) => {
      const to = fields[k];
      if (!to) return;
      to.value = field.value;
      if (field instanceof HTMLInputElement && to instanceof HTMLInputElement) to.checked = field.checked;
    });
    const all = copy.querySelectorAll(SCROLLERS);
    node.querySelectorAll(SCROLLERS).forEach((el, k) => {
      if ((el.scrollTop || el.scrollLeft) && all[k]) scrolled.push([all[k], el.scrollTop, el.scrollLeft]);
    });
  });
  queueMicrotask(() => {
    if (drawn.some((node) => node.parentNode === host)) return;
    host.append(...face);
    for (const [el, top, left] of scrolled) {
      el.scrollTop = top;
      el.scrollLeft = left;
    }
  });
}
