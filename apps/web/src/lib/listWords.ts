/**
 * A list of words as a sentence says it, through the browser's own
 * Intl.ListFormat in American English, the comma before the last "and" or
 * "or" included ("charts, procedures, and frequencies"), at the owner's
 * pick (2026-11-11). Made at the first ask, not at the first paint
 * (lib/format keeps Intl off that path), and kept after.
 */
let and: Intl.ListFormat | undefined;
let or: Intl.ListFormat | undefined;

/** "a", "a and b", "a, b, and c". */
export function andList(items: readonly string[]): string {
  and ??= new Intl.ListFormat("en-US", { type: "conjunction" });
  return and.format(items);
}

/** "a", "a or b", "a, b, or c". */
export function orList(items: readonly string[]): string {
  or ??= new Intl.ListFormat("en-US", { type: "disjunction" });
  return or.format(items);
}
