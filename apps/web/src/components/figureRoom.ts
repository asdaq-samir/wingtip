/** A figure as the strip draws it: its value, the unit after it, and the
 *  warning mark before it where it has one. */
interface Sized {
  value: string;
  unit?: string;
  alert?: boolean;
  waiting?: boolean;
}

/** How wide a character is against a digit (the figures are tabular, every
 *  digit one width), about the same in both the looks' faces, Barlow and
 *  Inter (measured in each, 2026-11-17): a gap or a stop narrow, an
 *  ident's capitals and the m wide. The face's own digit, in ems, is the
 *  CSS's (index.css --figure-digit). */
function digits(text: string): number {
  let width = 0;
  for (const c of text)
    width += /[\dhnguaoed≈]/.test(c)
      ? 1
      : /\s/.test(c)
        ? 0.42
        : /[.,]/.test(c)
          ? 0.5
          : /[:lij]/.test(c)
            ? 0.67
            : /[ftr]/.test(c)
              ? 0.72
              : /[mwMW—]/.test(c)
                ? 1.6
                : /[A-Z]/.test(c)
                  ? 1.2
                  : 1;
  return width;
}

/**
 * How many digits wide the widest figure of a strip is, its unit (at
 * `unitScale` of the figure's size) and mark included: the room
 * FigureStrip's CSS divides each column's width (100cqi) by, in the face's
 * own digits, to set the strip's one size, as iOS shrinks a label to fit
 * its width (UILabel's adjustsFontSizeToFitWidth) -- every figure the same
 * size, never over its own and never under 0.7 of it, and past that the
 * figure cut short with "…". Worked out from the words alone, nothing
 * measured in the page: a figure laid out and read back cost a layout at
 * each new figure (a dry run's strip counting down did it at every frame).
 */
export function figureRoom(figures: Sized[], unitScale: number): number {
  let widest = 0;
  for (const f of figures) {
    // A figure still coming is a skeleton 4ch wide (FigureWait).
    const value = f.waiting ? 4 : digits(f.value);
    const unit = f.unit ? digits(` ${f.unit}`) * unitScale : 0;
    // The mark is 0.8 of the figure's size and a 2-point gap: a digit and a half.
    widest = Math.max(widest, value + unit + (f.alert ? 1.6 : 0));
  }
  // A shade over, so a figure is set a little small rather than cut.
  return Math.round(widest * 103) / 100;
}
