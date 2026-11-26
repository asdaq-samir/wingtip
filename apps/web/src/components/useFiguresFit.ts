import { useLayoutEffect, useRef, useState, type RefObject } from "react";

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

/** How many of a row's widths, from the first, fit side by side in it
 *  with its own column gap between: half a pixel's slack for the rounding
 *  of a layout that just fits. The one sum of "does this row fit", FPL's
 *  figure strip's and a Land or Takeoff line's (procedures' useLineRoom). */
export function countFitting(row: HTMLElement, widths: readonly number[]): number {
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
  let used = -gap;
  let count = 0;
  for (const width of widths) {
    used += gap + width;
    if (used > row.clientWidth + 0.5) break;
    count += 1;
  }
  return count;
}

/**
 * How many of a strip's figures, from the first, fit side by side at their
 * full size, against the strip's own width; every one of them where all
 * fit. Measured as it lays out (a ResizeObserver on the strip and its
 * columns: the panel's width and the reader's text size each change one),
 * so where they do not fit the strip goes to two rows of two rather than
 * cut a figure short (the owner's rule: every figure whole). What a figure
 * needs does not change with the rows, so the strip never flips back and
 * forth.
 *
 * FPL's strip changes size only as the sheet comes to rest (lib/text's
 * PIN_FIGURE), so it is measured at the size it is laid out at, never part
 * way through a pull; the text is walked again only when a column's own
 * size changes or `content`, the figures' words, does, never for the
 * strip's width alone. One observer for the strip's life: the words change
 * every few seconds in flight. A pill one row high drops those past the
 * count (FigureStrip's `row`).
 */
export function useFiguresFit(strip: RefObject<HTMLElement | null>, content: string): number {
  const [fit, setFit] = useState(Infinity);
  const remeasure = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    const dl = strip.current;
    if (!dl || typeof ResizeObserver === "undefined") return;
    // Each column's need, walked again only when one of them changes size.
    let needs: number[] | null = null;
    const check = (entries: readonly ResizeObserverEntry[]) => {
      if (needs === null || entries.some((e) => e.target !== dl)) needs = [...dl.children].map(needed);
      const count = countFitting(dl, needs);
      setFit(count === needs.length ? Infinity : count);
    };
    remeasure.current = () => {
      needs = null;
      check([]);
    };
    const watch = new ResizeObserver(check);
    watch.observe(dl);
    for (const column of dl.children) watch.observe(column);
    return () => {
      watch.disconnect();
      remeasure.current = null;
    };
  }, [strip]);
  useLayoutEffect(() => remeasure.current?.(), [content]);
  return fit;
}
