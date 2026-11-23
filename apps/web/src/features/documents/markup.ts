import { MARKUP } from "../../lib/tokens";

/**
 * The reader's markup apart from pdf.js, so it is tested on its own: what
 * a mark kept on the device is, how a mark is known again after pdf.js
 * has drawn it anew (its page and its box), what the eraser touches, whose
 * touch draws (palm rejection), the notes list and the inks.
 *
 * The marks themselves are pdf.js's own annotation editors (its highlight
 * and ink, decision 0056's "second editor over pdf.js's annotation
 * layer"), kept as pdf.js serializes them; what pdf.js does not keep -- a
 * highlight's words once drawn again, the pilot's note on it -- is kept
 * beside each, here.
 */

/** A tool in the markup bar; none is reading. */
export type Tool = "highlight" | "pen" | "eraser";

export type MarkKind = "highlight" | "ink";

/** A mark as pdf.js serializes it: its page from 0, its box in the PDF's
 *  own points, and for ink its strokes' points. The rest is pdf.js's. */
export interface MarkData {
  pageIndex: number;
  rect: readonly number[];
  paths?: { points?: readonly ArrayLike<number>[] };
  [field: string]: unknown;
}

/** A mark kept on the device, tied to its page (from 1, as the reader counts). */
export interface SavedMark {
  page: number;
  kind: MarkKind;
  data: MarkData;
  /** A highlight's words, as they were picked. */
  text?: string;
  /** The pilot's note on it. */
  note?: string;
}

/** How far apart two boxes may be, in PDF points, and still be one mark:
 *  pdf.js's sizes go through the page's scale and back on each drawing. */
const SAME_BOX_PT = 1;

/** The same mark: its page, its kind and its box. */
export function sameMark(a: Pick<SavedMark, "page" | "kind" | "data">, b: Pick<SavedMark, "page" | "kind" | "data">): boolean {
  return (
    a.page === b.page &&
    a.kind === b.kind &&
    a.data.rect.length === b.data.rect.length &&
    a.data.rect.every((v, i) => Math.abs(v - b.data.rect[i]!) <= SAME_BOX_PT)
  );
}

/** The marks pdf.js holds now, each with the words and note it had
 *  before: pdf.js draws a kept highlight again without its words, and
 *  knows nothing of notes. */
export function carryOver(now: readonly SavedMark[], before: readonly SavedMark[]): SavedMark[] {
  return now.map((m) => {
    const was = before.find((b) => sameMark(b, m));
    const text = m.text || was?.text;
    const note = was?.note;
    return { ...m, ...(text ? { text } : {}), ...(note ? { note } : {}) };
  });
}

/** A note set on one mark, or taken off it (empty). */
export function withNote(marks: readonly SavedMark[], mark: SavedMark, note: string): SavedMark[] {
  const said = note.trim();
  const found = marks.some((m) => sameMark(m, mark));
  const list = found ? marks : [...marks, mark];
  return list.map((m) => {
    if (!sameMark(m, mark)) return m;
    const { note: _was, ...rest } = m;
    return said ? { ...rest, note: said } : rest;
  });
}

/** A row of the notes list: a highlight's words, its note, its page. */
export interface NoteRow {
  page: number;
  text: string | null;
  note: string | null;
}

/** The document's notes, page by page and down each page: every
 *  highlight (its words) and every mark with a note. A drawing without
 *  one is on its page alone. */
export function notesOf(marks: readonly SavedMark[]): NoteRow[] {
  return (
    marks
      .filter((m) => m.note || m.kind === "highlight")
      .map((m) => ({ row: { page: m.page, text: m.text ?? null, note: m.note ?? null }, top: m.data.rect[3] ?? 0 }))
      // A PDF's y runs up the page, so the higher top is the earlier.
      .sort((a, b) => a.row.page - b.row.page || b.top - a.top)
      .map(({ row }) => row)
  );
}

/** The notes on one page, as the share sheet's words beside its picture. */
export function pageNotes(marks: readonly SavedMark[], page: number): string {
  return notesOf(marks)
    .filter((r) => r.page === page && r.note)
    .map((r) => (r.text ? `"${r.text}": ${r.note}` : r.note!))
    .join("\n");
}

/** The distance from a point to a stroke (its points x, y, x, y ...), in
 *  the stroke's own units. */
export function distanceToStroke(points: ArrayLike<number>, x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < points.length; i += 2) {
    const ax = points[i]!;
    const ay = points[i + 1]!;
    const bx = i + 3 < points.length ? points[i + 2]! : ax;
    const by = i + 3 < points.length ? points[i + 3]! : ay;
    const dx = bx - ax;
    const dy = by - ay;
    const along = dx || dy ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(x - (ax + along * dx), y - (ay + along * dy)));
  }
  return best;
}

/** Whether the eraser at a point of the page (PDF points) touches a mark:
 *  within `slop` of one of a drawing's strokes, or inside a highlight's
 *  box or that close to it. A drawing's box alone is not enough: a long
 *  diagonal stroke's box covers half the page. */
export function erases(kind: MarkKind, data: MarkData, x: number, y: number, slop: number): boolean {
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = data.rect;
  const inBox =
    x >= Math.min(x1, x2) - slop && x <= Math.max(x1, x2) + slop && y >= Math.min(y1, y2) - slop && y <= Math.max(y1, y2) + slop;
  if (!inBox) return false;
  if (kind === "highlight") return true;
  return (data.paths?.points ?? []).some((stroke) => distanceToStroke(stroke, x, y) <= slop);
}

/** The points along a move from one place to the next, no more than
 *  `step` apart, the last the place reached: what the eraser touches on
 *  its way. */
export function sweep(from: readonly [number, number], to: readonly [number, number], step: number): [number, number][] {
  const n = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / step));
  return Array.from({ length: n }, (_, i) => [from[0] + ((to[0] - from[0]) * (i + 1)) / n, from[1] + ((to[1] - from[1]) * (i + 1)) / n]);
}

/** Palm rejection, as iPadOS's "Only Draw with Apple Pencil": once a
 *  pencil has drawn, a finger (or the palm resting on the glass) scrolls
 *  and zooms and draws nothing; a mouse and a pencil always draw. */
export function draws(pointerType: string, pencilOnly: boolean): boolean {
  return pointerType !== "touch" || !pencilOnly;
}

/**
 * Two fingers scroll the pages while the pen or the eraser is in hand, as
 * a finger does in Notes and PencilKit: one finger or a pencil draws, a
 * second finger down makes it a scroll until every finger is lifted (so
 * the finger left behind draws nothing). pdf.js's drawing layer takes
 * every touch (touch-action: none), so the scroll is the reader's own,
 * by how far the fingers' middle moves. Fingers only: a pencil and a
 * mouse are never a scroll.
 */
export function twoFingerScroll() {
  const at = new Map<number, [number, number]>();
  let scrolling = false;
  const middle = () => {
    const all = [...at.values()];
    return [all.reduce((s, p) => s + p[0], 0) / all.length, all.reduce((s, p) => s + p[1], 0) / all.length] as const;
  };
  return {
    /** A pointer down: whether it is (now) a scroll, not a stroke. */
    down(id: number, type: string, x: number, y: number): boolean {
      if (type !== "touch") return false;
      at.set(id, [x, y]);
      if (at.size >= 2) scrolling = true;
      return scrolling;
    },
    /** A pointer moved: how far to scroll the pages by, or null where it
     *  is no scroll's (a stroke's, a pencil's). */
    move(id: number, x: number, y: number): [number, number] | null {
      if (!at.has(id)) return null;
      const [mx, my] = middle();
      at.set(id, [x, y]);
      if (!scrolling) return null;
      const [nx, ny] = middle();
      return [mx - nx, my - ny];
    },
    /** A pointer up or cancelled: whether it ended a scroll's finger. */
    up(id: number): boolean {
      if (!at.delete(id)) return false;
      const was = scrolling;
      if (at.size === 0) scrolling = false;
      return was;
    },
    get scrolling() {
      return scrolling;
    },
  };
}

/** The inks, from the markup's own tokens (design/tokens.json's
 *  color.markup): a highlighter's four, the pen's four. The first of each
 *  is where a tool starts. */
export const INKS: Record<"highlight" | "pen", readonly { value: string; label: string }[]> = {
  highlight: [
    { value: MARKUP.highlightYellow, label: "Yellow" },
    { value: MARKUP.highlightGreen, label: "Green" },
    { value: MARKUP.highlightBlue, label: "Blue" },
    { value: MARKUP.highlightPink, label: "Pink" },
  ],
  pen: [
    { value: MARKUP.penBlack, label: "Black" },
    { value: MARKUP.penBlue, label: "Blue" },
    { value: MARKUP.penRed, label: "Red" },
    { value: MARKUP.penGreen, label: "Green" },
  ],
};

/** pdf.js's own list of highlighter colours, so the colour menu it draws
 *  on a picked highlight offers the same four. */
export const HIGHLIGHT_COLOURS = INKS.highlight.map((c) => `${c.label.toLowerCase()}=${c.value}`).join(",");

/** A marked-up page's file name: the document's and the page's. */
export function pageFileName(title: string, page: number): string {
  const name =
    title
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Document";
  return `${name} p${page} marked.png`;
}
