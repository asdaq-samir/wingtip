import { describe, expect, it } from "vitest";
import { risenToSee } from "./panelNow";

describe("risenToSee", () => {
  it("rises the pill to half and leaves every other size as the pilot left it", () => {
    expect(risenToSee("peek")).toBe("half");
    expect(risenToSee("half")).toBeNull();
    expect(risenToSee("full")).toBeNull();
  });
});
