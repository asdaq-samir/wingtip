import { describe, expect, it } from "vitest";
import { safeHref } from "./safeHref";

describe("safeHref", () => {
  it("keeps a web page, a number, an address and a path of this site", () => {
    expect(safeHref("https://www.example.com/fbo")).toBe("https://www.example.com/fbo");
    expect(safeHref("http://example.com")).toBe("http://example.com");
    expect(safeHref("tel:+18178587503")).toBe("tel:+18178587503");
    expect(safeHref("mailto:fbo@example.com")).toBe("mailto:fbo@example.com");
    expect(safeHref("/api/planner/foreflight-pack/C81-KDLH.zip")).toBe("/api/planner/foreflight-pack/C81-KDLH.zip");
  });

  it("drops what runs or poses as a page", () => {
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref(" JavaScript:alert(1)")).toBeUndefined();
    expect(safeHref("data:text/html,<h1>Sign in</h1>")).toBeUndefined();
    expect(safeHref("vbscript:x")).toBeUndefined();
    expect(safeHref("//attacker.example/x")).toBeUndefined();
    expect(safeHref("/\\attacker.example")).toBeUndefined();
    expect(safeHref("www.example.com")).toBeUndefined();
  });
});
