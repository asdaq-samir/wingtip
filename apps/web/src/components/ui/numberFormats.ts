/**
 * How the figure fields (ui/number-field, React Aria's NumberField) write
 * what they hold, in the pilot's locale, never grouped: a weight or an
 * altitude as the book writes it.
 */

/** A whole figure: feet, people, minutes. */
export const WHOLE: Intl.NumberFormatOptions = { useGrouping: false, maximumFractionDigits: 0 };

/** Three figures, as a course, a heading or a flight level is written and
 *  said: 090, FL045. */
export const THREE_FIGURES: Intl.NumberFormatOptions = { useGrouping: false, minimumIntegerDigits: 3, maximumFractionDigits: 0 };
