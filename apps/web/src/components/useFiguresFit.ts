import { useLayoutEffect, useState, type RefObject } from "react";

/** The width a column's figure needs at its full size: the widest of its
 *  name's and its value's runs laid out whole, cut short or not (a text's
 *  own box, past a box that clips it), its marks with them. What only a
 *  screen reader hears (sr-only, laid out on one line out of sight) is no
 *  figure's room. */
function needed(column: Element): number {
  const range = document.createRange();
  let widest = 0;
  for (const part of column.children) {
    let left = Infinity;
    let right = -Infinity;
    const walk = document.createTreeWalker(part, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let node: Node | null = walk.currentNode; node; node = walk.nextNode()) {
      const text = node.nodeType === Node.TEXT_NODE;
      if (!text && !(node instanceof SVGSVGElement)) continue;
      if ((text ? node.parentElement : (node as Element))?.closest(".sr-only")) continue;
      if (text && !node.textContent?.trim()) continue;
      let box: DOMRect;
      if (text) {
        range.selectNodeContents(node);
        box = range.getBoundingClientRect();
      } else box = (node as Element).getBoundingClientRect();
      if (box.width === 0) continue;
      left = Math.min(left, box.left);
      right = Math.max(right, box.right);
    }
    if (right > left) widest = Math.max(widest, right - left);
  }
  return widest;
}

/**
 * How many of a strip's figures, from the first, fit side by side at their
 * full size: the sum of the widths each column's figure needs and the gaps
 * between, against the strip's own width; every one of them where all fit. Measured as it lays out (a ResizeObserver on the
 * strip and its columns: the panel's width and the reader's text size each
 * change one), so where they do not fit the strip goes to two rows of two
 * rather than cut a figure short (the owner's rule: every figure whole;
 * the HIG audit of 2026-11-23, H2: the iPad's side panel at 19.65 px read
 * "2h 5…" for 2h 54m). What a figure needs does not change with the rows,
 * so the strip never flips back and forth.
 *
 * FPL's strip changes size only as the sheet comes to rest (thin from half
 * up, full at the pill; lib/text's PIN_FIGURE), so it is measured at the
 * size it is laid out at, never part way through a pull; the text is
 * walked again only when a column's own size changes, never for the
 * strip's width alone (the r5-code audit's R5-3, 2026-11-23).
 * `content` is the figures' words, to measure again when they change.
 * A pill one row high drops those past the count (FigureStrip's `row`).
 */
export function useFiguresFit(strip: RefObject<HTMLElement | null>, content: string): number {
  const [fit, setFit] = useState(Infinity);
  useLayoutEffect(() => {
    const dl = strip.current;
    if (!dl || typeof ResizeObserver === "undefined") return;
    // Each column's need, walked again only when one of them changes size.
    let needs: number[] | null = null;
    let gap = 0;
    const check = (entries: ResizeObserverEntry[]) => {
      if (needs === null || entries.some((e) => e.target !== dl)) {
        needs = [...dl.children].map(needed);
        gap = parseFloat(getComputedStyle(dl).columnGap) || 0;
      }
      // Half a pixel's slack for the rounding of a layout that just fits.
      let used = -gap;
      let count = 0;
      for (const need of needs) {
        used += gap + need;
        if (used > dl.clientWidth + 0.5) break;
        count += 1;
      }
      setFit(count === needs.length ? Infinity : count);
    };
    const watch = new ResizeObserver(check);
    watch.observe(dl);
    for (const column of dl.children) watch.observe(column);
    return () => watch.disconnect();
  }, [strip, content]);
  return fit;
}
