import { describe, expect, it } from "vitest";
import { andList, orList } from "./listWords";

describe("a list in words", () => {
  it("says one, two, or three and more with the comma before the last", () => {
    expect(andList([])).toBe("");
    expect(andList(["charts"])).toBe("charts");
    expect(andList(["charts", "procedures"])).toBe("charts and procedures");
    expect(andList(["charts", "procedures", "frequencies"])).toBe("charts, procedures, and frequencies");
    expect(orList(["takes off", "lands", "comes within 5 nm of you"])).toBe("takes off, lands, or comes within 5 nm of you");
  });
});
