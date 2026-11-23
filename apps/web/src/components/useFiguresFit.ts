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
 * Whether a strip's figures fit side by side at their full size: the sum
 * of the widths each column's figure needs and the gaps between, against
 * the strip's own width. Measured as it lays out (a ResizeObserver on the
 * strip and its columns: the panel's width, the reader's text size and the
 * pill's growth each change one), so where they do not fit the strip goes
 * to two rows of two rather than cut a figure short (the owner's rule:
 * every figure whole; the HIG audit of 2026-11-23, H2: the iPad's side
 * panel at 19.65 px read "2h 5…" for 2h 54m). What a figure needs does not
 * change with the rows, so the strip never flips back and forth. `content`
 * is the figures' words, to measure again when they change.
 */
export function useFiguresFit(strip: RefObject<HTMLElement | null>, content: string): boolean {
  const [fit, setFit] = useState(true);
  useLayoutEffect(() => {
    const dl = strip.current;
    if (!dl || typeof ResizeObserver === "undefined") return;
    const check = () => {
      const columns = [...dl.children];
      const gap = parseFloat(getComputedStyle(dl).columnGap) || 0;
      const need = columns.reduce((sum, column) => sum + needed(column), 0) + gap * Math.max(0, columns.length - 1);
      // Half a pixel's slack for the rounding of a layout that just fits.
      setFit(need <= dl.clientWidth + 0.5);
    };
    const watch = new ResizeObserver(check);
    watch.observe(dl);
    for (const column of dl.children) watch.observe(column);
    return () => watch.disconnect();
  }, [strip, content]);
  return fit;
}
