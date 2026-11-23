/** The sheet's head that the held figures must not be drawn over (FPL's
 *  bar row, SheetBarRow's `clears`). */
const HEAD = "[data-pin-clears]";

/** How far over the figures' row their backing reaches (FplActions'
 *  PINNED, its -top-1.5), and the run over which the head fades out as
 *  the figures' top comes up to its foot. */
const BACKING_PX = 6;
const FADE_PX = 16;

/**
 * The head faded out as the figures held at the foot (usePinAtFoot) reach
 * it, and back in as they leave it, from where both are drawn now, a frame
 * at a time while the sheet moves. Settling to the pill the figures grow
 * to the pill's size on the foot's edge as the sheet's top comes down to
 * them, and the head, held in sight till the sheet has settled
 * (RISEN_FACE), slid under them: "Flight Plan" cut in half behind the
 * strip for the last frames of every drop to the pill (the owner's screen
 * recording, 2026-11-23). Faded by how near they are, read off their rects,
 * not mirrored from the sheet's offset on a curve of its own (the sheet
 * motion lesson of 278b67c62): an opacity a frame late shows nothing.
 * Reads every rect before it writes.
 */
export function clearHead(row: HTMLElement, sheet: Element | null) {
  const heads = sheet ? Array.from(sheet.querySelectorAll<HTMLElement>(HEAD)) : [];
  if (heads.length === 0) return;
  const px = (name: string) => parseFloat(row.style.getPropertyValue(name));
  // The figures drawn grown by --pin-s from their foot, their backing raised with them.
  const s = px("--pin-s");
  const grown = Number.isNaN(s) ? 0 : (1 - s) * (px("--pin-h") || 0);
  const top = row.getBoundingClientRect().top + grown - BACKING_PX;
  const read = heads.map((head) => ({ head, bottom: head.getBoundingClientRect().bottom }));
  for (const { head, bottom } of read) fadeTo(head, headOpacity(top - bottom));
}

/** The head's own look given back (the figures put away or gone). */
export function unclearHead(sheet: Element | null) {
  for (const head of sheet?.querySelectorAll<HTMLElement>(HEAD) ?? []) head.style.removeProperty("opacity");
}

/** The head's opacity with the figures' top `clear` points below its foot:
 *  whole while they are a fade's run away, none once they meet it. */
export function headOpacity(clear: number) {
  return Math.round(Math.min(1, Math.max(0, clear / FADE_PX)) * 100) / 100;
}

function fadeTo(head: HTMLElement, opacity: number) {
  if (opacity >= 1) head.style.removeProperty("opacity");
  else if (head.style.opacity !== `${opacity}`) head.style.opacity = `${opacity}`;
}
