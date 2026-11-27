import { useEffect, useEffectEvent, type RefObject } from "react";

/**
 * A tap on the ground of a bar beside the sheet's popup (sheet/FootBar, a
 * flying foot's SheetFoot), whose ground takes no touch so a drag on it is
 * the sheet's under it: the tap falls through to the popup, and is taken
 * here before it reaches what is under the bar. With `raise` (a pill whose
 * row the bar is) it raises the sheet, as a tap on the pill's row does;
 * without, it goes no further, as the row it lands on is hidden under the
 * bar. Only the click is taken; the press still reaches the Drawer, for a
 * drag. A tap on the bar's own controls is theirs.
 */
export function useGroundTaps(bar: RefObject<HTMLElement | null>, on: boolean, raise?: () => void) {
  const raised = useEffectEvent(() => raise?.());
  const raises = !!raise;
  useEffect(() => {
    const el = bar.current;
    const host = el?.parentElement;
    if (!el || !host || !on) return;
    const take = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || el.contains(event.target)) return;
      const box = el.getBoundingClientRect();
      if (event.clientY < box.top || event.clientY > box.bottom) return;
      event.preventDefault();
      event.stopPropagation();
      if (raises) raised();
    };
    host.addEventListener("click", take, true);
    return () => host.removeEventListener("click", take, true);
  }, [bar, on, raises]);
}
