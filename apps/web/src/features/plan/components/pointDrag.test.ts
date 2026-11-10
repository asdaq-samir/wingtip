import { describe, expect, it, vi } from "vitest";
import { joinProps, movePoint } from "./pointDrag";

describe("movePoint", () => {
  it("puts a point at another's place, the rest kept in order", () => {
    expect(movePoint(["C81", "KRYV", "KMSN", "KDLH"], 3, 0)).toEqual(["KDLH", "C81", "KRYV", "KMSN"]);
    expect(movePoint(["KDLH", "C81", "KRYV", "KMSN"], 0, 3)).toEqual(["C81", "KRYV", "KMSN", "KDLH"]);
    expect(movePoint(["A", "B", "C"], 1, 2)).toEqual(["A", "C", "B"]);
  });
});

describe("joinProps", () => {
  it("runs both handlers, the first's first, and reads both descriptions", () => {
    const calls: string[] = [];
    const first = vi.fn(() => calls.push("drag"));
    const second = vi.fn(() => calls.push("ours"));
    const props = joinProps({ onPointerDown: first, "aria-describedby": "a" }, { onPointerDown: second, "aria-describedby": "b" });
    (props.onPointerDown as () => void)();
    expect(calls).toEqual(["drag", "ours"]);
    expect(props["aria-describedby"]).toBe("a b");
  });
});
