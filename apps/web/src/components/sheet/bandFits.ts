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
 * sticks. So too the page's end room under FPL's foot bar (sheet/FootBar,
 * SheetScroller's data-foot-room), which the scroller runs on under: a
 * long route's field all the way up stuck with its last row, the Add
 * Stops pill and the toggle back, under the bar, out of a finger's reach
 * (the owner's iPhone, 2026-11-23).
 */
export function bandFits(band: HTMLElement | null) {
  const scroller = band?.parentElement;
  if (!band || !scroller) return;
  const watch = new ResizeObserver(() => check());
  // The foot room found again as it comes and goes with the scroller's
  // children (a layout that adds or drops its end room), not once.
  let room: HTMLElement | null = null;
  const find = () => {
    const now = scroller.querySelector<HTMLElement>(":scope > [data-foot-room]");
    if (now === room) return;
    if (room) watch.unobserve(room);
    room = now;
    if (room) watch.observe(room);
  };
  const check = () => {
    find();
    const foot = (parseFloat(getComputedStyle(scroller).paddingBottom) || 0) + (room?.offsetHeight ?? 0);
    band.toggleAttribute("data-band-tall", band.offsetHeight > scroller.clientHeight - foot);
  };
  find();
  watch.observe(band);
  watch.observe(scroller);
  const children = new MutationObserver(check);
  children.observe(scroller, { childList: true });
  return () => {
    watch.disconnect();
    children.disconnect();
  };
}
