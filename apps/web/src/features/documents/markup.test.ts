import { describe, expect, it } from "vitest";
import {
  carryOver,
  distanceToStroke,
  draws,
  erases,
  HIGHLIGHT_COLOURS,
  INKS,
  notesOf,
  pageFileName,
  pageNotes,
  sameMark,
  sweep,
  twoFingerScroll,
  withNote,
  type SavedMark,
} from "./markup";

const highlight = (page: number, top: number, extra: Partial<SavedMark> = {}): SavedMark => ({
  page,
  kind: "highlight",
  data: { pageIndex: page - 1, rect: [72, top - 20, 300, top], quadPoints: [] },
  ...extra,
});
const ink = (page: number, points: number[]): SavedMark => ({
  page,
  kind: "ink",
  data: { pageIndex: page - 1, rect: [Math.min(...points), 0, Math.max(...points), 800], paths: { points: [points] } },
});

describe("markup", () => {
  it("knows a mark again when pdf.js draws it anew, its box a little off, and not one on another page", () => {
    const a = highlight(3, 700);
    const drawnAgain = { ...a, data: { ...a.data, rect: [72.4, 679.6, 300.3, 700.2] } };
    expect(sameMark(a, drawnAgain)).toBe(true);
    expect(sameMark(a, highlight(4, 700))).toBe(false);
    expect(sameMark(a, highlight(3, 650))).toBe(false);
    expect(sameMark(a, { ...a, kind: "ink" })).toBe(false);
  });

  it("carries a highlight's words and note over to pdf.js's new drawing of it, and keeps what is new", () => {
    const before = [highlight(1, 700, { text: "Fuel requirements", note: "30 min day VFR" })];
    const now = [highlight(1, 700), highlight(2, 500, { text: "Night" })];
    expect(carryOver(now, before)).toEqual([
      highlight(1, 700, { text: "Fuel requirements", note: "30 min day VFR" }),
      highlight(2, 500, { text: "Night" }),
    ]);
    // A mark erased is gone, its note with it.
    expect(carryOver([], before)).toEqual([]);
  });

  it("sets a note, changes it and takes it off when it is emptied", () => {
    const mark = highlight(1, 700, { text: "Fuel" });
    const noted = withNote([mark], mark, "  Check the reserve  ");
    expect(noted[0]!.note).toBe("Check the reserve");
    expect(withNote(noted, mark, "Day VFR 30 min")[0]!.note).toBe("Day VFR 30 min");
    expect(withNote(noted, mark, "  ")[0]).not.toHaveProperty("note");
    // A mark not yet kept is kept with its note.
    expect(withNote([], mark, "New")).toEqual([{ ...mark, note: "New" }]);
  });

  it("lists the notes page by page and down each page, every highlight and every noted drawing", () => {
    const marks: SavedMark[] = [
      highlight(2, 300, { text: "Lower", note: "b" }),
      ink(1, [10, 10, 20, 20]),
      { ...ink(1, [10, 10, 20, 20]), note: "Circled" },
      highlight(2, 700, { text: "Upper" }),
      highlight(1, 100, { text: "First page" }),
    ];
    expect(notesOf(marks)).toEqual([
      { page: 1, text: null, note: "Circled" },
      { page: 1, text: "First page", note: null },
      { page: 2, text: "Upper", note: null },
      { page: 2, text: "Lower", note: "b" },
    ]);
    expect(pageNotes(marks, 2)).toBe('"Lower": b');
    expect(pageNotes(marks, 1)).toBe("Circled");
  });

  it("finds the distance to a stroke, a lone point's too", () => {
    expect(distanceToStroke([0, 0, 10, 0], 5, 3)).toBeCloseTo(3);
    expect(distanceToStroke([0, 0, 10, 0], 13, 4)).toBeCloseTo(5);
    expect(distanceToStroke([4, 4], 7, 8)).toBeCloseTo(5);
  });

  it("erases a drawing only near its stroke, not anywhere in its box, and a highlight anywhere on it", () => {
    const diagonal = ink(1, [0, 0, 100, 100]);
    diagonal.data.rect = [0, 0, 100, 100];
    expect(erases("ink", diagonal.data, 50, 52, 4)).toBe(true);
    expect(erases("ink", diagonal.data, 90, 10, 4)).toBe(false);
    expect(erases("ink", diagonal.data, 300, 300, 4)).toBe(false);
    const h = highlight(1, 700);
    expect(erases("highlight", h.data, 150, 690, 4)).toBe(true);
    expect(erases("highlight", h.data, 150, 702, 4)).toBe(true);
    expect(erases("highlight", h.data, 150, 600, 4)).toBe(false);
  });

  it("sweeps the eraser's whole way between two pointer events, never farther apart than its step", () => {
    expect(sweep([0, 0], [0, 25], 6)).toEqual([
      [0, 5],
      [0, 10],
      [0, 15],
      [0, 20],
      [0, 25],
    ]);
    expect(sweep([3, 4], [3, 4], 6)).toEqual([[3, 4]]);
  });

  it("rejects the palm: once a pencil draws, a finger does not; a mouse and a pencil always do", () => {
    expect(draws("touch", false)).toBe(true);
    expect(draws("touch", true)).toBe(false);
    expect(draws("pen", true)).toBe(true);
    expect(draws("mouse", true)).toBe(true);
  });

  it("offers four inks a tool, from the tokens, and tells pdf.js the highlighter's", () => {
    expect(INKS.highlight).toHaveLength(4);
    expect(INKS.pen).toHaveLength(4);
    for (const c of [...INKS.highlight, ...INKS.pen]) expect(c.value).toMatch(/^#[0-9a-f]{6}$/i);
    expect(HIGHLIGHT_COLOURS.split(",")[0]).toBe(`yellow=${INKS.highlight[0]!.value}`);
  });

  it("names a shared page by its document and page, without a path's characters", () => {
    expect(pageFileName("C172S POH: Normal/Emergency", 4)).toBe("C172S POH Normal Emergency p4 marked.png");
    expect(pageFileName("  ", 1)).toBe("Document p1 marked.png");
  });
});

describe("two fingers scroll while the pen is in hand", () => {
  it("one finger draws; a second makes it a scroll by the fingers' middle, until both are lifted", () => {
    const f = twoFingerScroll();
    expect(f.down(1, "touch", 100, 100)).toBe(false);
    expect(f.move(1, 110, 100)).toBeNull();
    expect(f.down(2, "touch", 200, 100)).toBe(true);
    // Both fingers 20 down: the pages scroll back up under them, 10 each move.
    expect(f.move(1, 110, 120)).toEqual([0, -10]);
    expect(f.move(2, 200, 120)).toEqual([0, -10]);
    // One lifted: still a scroll, so the finger left draws nothing.
    expect(f.up(2)).toBe(true);
    expect(f.scrolling).toBe(true);
    expect(f.move(1, 110, 130)).toEqual([0, -10]);
    expect(f.up(1)).toBe(true);
    expect(f.scrolling).toBe(false);
    expect(f.down(3, "touch", 0, 0)).toBe(false);
  });

  it("a pencil and a mouse are never a scroll", () => {
    const f = twoFingerScroll();
    expect(f.down(1, "pen", 0, 0)).toBe(false);
    expect(f.down(2, "mouse", 0, 0)).toBe(false);
    expect(f.move(1, 5, 5)).toBeNull();
    expect(f.up(2)).toBe(false);
  });
});
