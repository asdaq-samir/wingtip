import { describe, expect, it } from "vitest";
import { entryProblems, sameEntry } from "./entryChecks";
import { blankEntry } from "./logbookEntry";

describe("entryProblems", () => {
  it("asks for the day flown and nothing else", () => {
    expect(entryProblems({ ...blankEntry(), flownOn: "" })).toEqual({ flownOn: "Enter the day you flew." });
    expect(entryProblems({ ...blankEntry(), totalHours: 0 })).toEqual({});
  });
});

describe("sameEntry", () => {
  it("is the same while nothing is typed, an empty box and none alike", () => {
    const a = blankEntry("N12345");
    expect(sameEntry(a, { ...a })).toBe(true);
    expect(sameEntry({ ...a, remarks: "" }, { ...a, remarks: null as unknown as string })).toBe(true);
    expect(sameEntry(a, { ...a, totalHours: 1.2 })).toBe(false);
  });
});
