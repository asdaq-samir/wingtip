/** `chip` brought to the middle of `row` sideways, by the browser's own
 *  scrollIntoView, the row alone moved: `container: "nearest"` keeps it to
 *  the row where the browser reads it (Chrome 140); where it does not
 *  (Safari), "nearest" could still scroll the sheet up or down to bring
 *  the chip in, so every scroller above the row is put back where it was,
 *  in the same frame. */
export function centre(chip: HTMLElement, row: HTMLElement) {
  const kept: [Element, number, number][] = [];
  for (let el = row.parentElement; el; el = el.parentElement) kept.push([el, el.scrollTop, el.scrollLeft]);
  let contained = false;
  const options = {
    inline: "center",
    block: "nearest",
    behavior: "instant",
    get container() {
      contained = true;
      return "nearest";
    },
  } as ScrollIntoViewOptions;
  chip.scrollIntoView(options);
  if (contained) return;
  for (const [el, top, left] of kept) {
    if (el.scrollTop !== top) el.scrollTop = top;
    if (el.scrollLeft !== left) el.scrollLeft = left;
  }
}
