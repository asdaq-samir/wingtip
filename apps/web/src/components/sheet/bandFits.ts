/**
 * Marks a sheet's head band `data-band-tall` while it is taller than the
 * scroller it sticks in (SheetParts), so it scrolls away with the body
 * then instead of sticking. A band that sticks while it is taller than its
 * scroller covers what is under it at every scroll position: FPL's open
 * route, its airport cards in the band, ran 795 points in a 757-point
 * scroller on a phone and hid the route's field and its pills, which a
 * finger could then never reach (stops-reorder.spec, 2026-11-19). The
 * scrolling rule keeps a card's title and ✕ in view (rules.md §2.1); a
 * band that cannot be seen whole is not a title row. Set on the element
 * itself, so a change of height draws nothing again.
 */
export function bandFits(band: HTMLElement | null) {
  const scroller = band?.parentElement;
  if (!band || !scroller) return;
  const check = () => band.toggleAttribute("data-band-tall", band.offsetHeight > scroller.clientHeight);
  const watch = new ResizeObserver(check);
  watch.observe(band);
  watch.observe(scroller);
  return () => watch.disconnect();
}
