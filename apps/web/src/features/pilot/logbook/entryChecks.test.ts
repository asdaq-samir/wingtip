import { describe, expect, it } from "vitest";
import { entryProblems } from "./entryChecks";
import { blankEntry } from "./logbookEntry";

describe("entryProblems", () => {
  it("asks for the day flown and nothing else", () => {
    expect(entryProblems({ ...blankEntry(), flownOn: "" })).toEqual({ flownOn: "Enter the day you flew." });
    expect(entryProblems({ ...blankEntry(), totalHours: 0 })).toEqual({});
  });
});
