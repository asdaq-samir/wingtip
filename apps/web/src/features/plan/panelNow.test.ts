import { describe, expect, it } from "vitest";
import { risenForFigures, risenToSee } from "./panelNow";

describe("risenToSee", () => {
  it("rises the pill to half and leaves every other size as the pilot left it", () => {
    expect(risenToSee("peek")).toBe("half");
    expect(risenToSee("half")).toBeNull();
    expect(risenToSee("full")).toBeNull();
  });
});

describe("risenForFigures", () => {
  it("takes half all the way up just after the pilot's own edit", () => {
    expect(risenForFigures("half", 0)).toBe("full");
    expect(risenForFigures("half", 1200)).toBe("full");
  });
  it("leaves it with no edit of the pilot's just now: a load, a link, the sheet moved since", () => {
    expect(risenForFigures("half", Infinity)).toBeNull();
    expect(risenForFigures("half", 60_000)).toBeNull();
  });
  it("leaves the pill and all the way up as they are", () => {
    expect(risenForFigures("peek", 0)).toBeNull();
    expect(risenForFigures("full", 0)).toBeNull();
  });
});
