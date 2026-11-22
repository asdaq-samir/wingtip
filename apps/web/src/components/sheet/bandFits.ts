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
 *
 * The room it is measured against is the scroller's less its foot's
 * padding (a foot laid over the page's end, as FPL's was for a day):
 * a band that fit the scroller's whole height but not the room above the
 * foot still scrolled, and a sticky band can move no further than its
 * scroller's content, so all of it went up with the scroll, FPL's head
 * 40 points off the sheet's top all the way up at the default text size
 * (the HIG review, 2026-11-21). Measured as a tall one, only its first row
 * sticks.
 */
export function bandFits(band: HTMLElement | null) {
  const scroller = band?.parentElement;
  if (!band || !scroller) return;
  const check = () => {
    const foot = parseFloat(getComputedStyle(scroller).paddingBottom) || 0;
    band.toggleAttribute("data-band-tall", band.offsetHeight > scroller.clientHeight - foot);
  };
  const watch = new ResizeObserver(check);
  watch.observe(band);
  watch.observe(scroller);
  return () => watch.disconnect();
}
