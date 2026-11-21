/**
 * How the reader finds its way in a PDF, apart from pdf.js itself so it
 * is tested on its own: the outline flattened into rows, an AIM
 * paragraph found among them, and a pinch's step of zoom.
 */

/** An item of a PDF's outline, as pdf.js's getOutline gives it. */
export interface OutlineItem {
  title: string;
  dest: unknown;
  items: OutlineItem[];
}

/** An outline row, its depth for its indent. */
export interface OutlineRow {
  title: string;
  dest: unknown;
  depth: number;
}

/** The outline as rows, in its order, each under the one it is in. */
export function outlineRows(items: readonly OutlineItem[] | null | undefined, depth = 0): OutlineRow[] {
  return (items ?? []).flatMap((i) => [{ title: i.title, dest: i.dest, depth }, ...outlineRows(i.items, depth + 1)]);
}

/** The dashes a PDF's text may set a paragraph's number in (the AIM's
 *  "7–1–5", a minus) as the hyphen the engine's citations write. */
export const plainDashes = (text: string) => text.replace(/[‐-―−]/g, "-");

/** The outline's row for a paragraph or section ("7-1-5", "91.155"): the
 *  first whose title starts with it, a word after it ("7-1-5. Preflight
 *  Briefings"), not a longer number ("7-1-50"). */
export function rowFor(rows: readonly OutlineRow[], at: string): OutlineRow | null {
  const wanted = plainDashes(at);
  return (
    rows.find((r) => {
      const title = plainDashes(r.title.trim()).replace(/^(paragraph|section|§)\s*/i, "");
      return title.startsWith(wanted) && !/[0-9]/.test(title.charAt(wanted.length));
    }) ?? null
  );
}

/** What the reader searches the text for where the outline has no row for
 *  a paragraph: its number as a heading sets it, with its stop. */
export const headingWords = (at: string) => `${at}.`;

/** A pinch's step of zoom, the fingers' spread now over before, held to
 *  halving or doubling at a step so a jump of the fingers is not a leap. */
export function pinchStep(before: number, now: number): number {
  if (!(before > 0) || !(now > 0)) return 1;
  return Math.min(2, Math.max(0.5, now / before));
}

/** The distance between two touches, and the point between them. */
export function spread(a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }) {
  return {
    distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
    origin: [(a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2] as [number, number],
  };
}
