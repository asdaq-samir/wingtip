import { useEffectEvent, useLayoutEffect, type RefObject } from "react";
import { useFootBarHeight } from "./sheetMotion";

/** `el`'s border-box height, px, from the ResizeObserver's own reports,
 *  the first of them its first: `onHeight` at each. Answers the watch's
 *  end; nothing where there is no ResizeObserver (jsdom). */
export function observeHeight(el: HTMLElement, onHeight: (px: number) => void): () => void {
  if (typeof ResizeObserver === "undefined") return () => {};
  const watch = new ResizeObserver(([entry]) => onHeight(Math.round(entry?.borderBoxSize[0]?.blockSize ?? el.offsetHeight)));
  watch.observe(el);
  return () => watch.disconnect();
}

/** The foot bars on the page, the last mounted the one in sight: FPL's
 *  (sheet/FootBar) and, over it in flight and a dry run, SheetFoot's. */
type Owner = { el: HTMLElement; height: number; pill: number | null };
const owners: Owner[] = [];

/** The store told the top bar's height, its pill height kept from the
 *  last bar that measured one. */
function publish() {
  const top = owners.at(-1);
  useFootBarHeight.setState((was) => ({ height: top?.height ?? 0, pill: top ? (top.pill ?? was.pill) : 0 }));
}

/**
 * A foot bar's height told to useFootBarHeight, the store's one writer:
 * the page's end room and the map's room under the sheet. Each bar mounted
 * is an owner and the last one mounted is told; one going leaves the one
 * under it told, where SheetFoot's going zeroed the height under FPL's bar
 * till its next resize. `folded` reads the bar's
 * height at the pill, where it has one (FPL's figures, footPillPx).
 */
export function useTellFootBar(ref: RefObject<HTMLElement | null>, folded?: (el: HTMLElement) => number | undefined) {
  const fold = useEffectEvent((el: HTMLElement) => folded?.(el));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const owner: Owner = { el, height: 0, pill: null };
    owners.push(owner);
    const stop = observeHeight(el, (height) => {
      owner.height = height;
      owner.pill = fold(el) ?? owner.pill;
      publish();
    });
    return () => {
      stop();
      owners.splice(owners.indexOf(owner), 1);
      publish();
    };
  }, [ref]);
}

/** A bar's folded height read outside a resize (FPL's bar come into sight
 *  at the pill, which need not resize it). */
export function tellFootPill(el: HTMLElement, pill: number) {
  const owner = owners.find((o) => o.el === el);
  if (!owner) return;
  owner.pill = pill;
  publish();
}
