// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { strokePath } from "./ink";
import { InkPad } from "./InkPad";
import type { Stroke } from "./padStore";

vi.mock("./ink", async (actual) => {
  const real = await actual<typeof import("./ink")>();
  return { ...real, strokePath: vi.fn(real.strokePath) };
});

beforeAll(() => {
  // jsdom has no pointer capture: the pad holds the pointer it draws with.
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.hasPointerCapture = () => true;
  // The live stroke is drawn once a frame: run each frame at once.
  vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => {
    f(0);
    return 0;
  });
});

const stroke = (x: number): Stroke => ({
  points: [
    [x, 0.1, 0.5],
    [x + 0.01, 0.2, 0.5],
  ],
  pen: false,
});

describe("InkPad", () => {
  it("works out only the live stroke's outline again as the pointer moves", () => {
    const outlines = vi.mocked(strokePath);
    const kept = Array.from({ length: 20 }, (_, i) => stroke(i / 20));
    const { getByTestId } = render(<InkPad strokes={kept} onStroke={() => {}} label="Page" />);
    expect(outlines.mock.calls.filter(([s]) => kept.includes(s))).toHaveLength(20);
    outlines.mockClear();
    const pad = getByTestId("scratchpad-ink");
    fireEvent.pointerDown(pad, { pointerId: 1, pointerType: "mouse", isPrimary: true, clientX: 10, clientY: 10 });
    for (let i = 1; i <= 5; i++) fireEvent.pointerMove(pad, { pointerId: 1, pointerType: "mouse", clientX: 10 + i, clientY: 10 + i });
    // The live stroke drawn at each move, and none of the twenty again.
    expect(outlines.mock.calls.length).toBeGreaterThan(0);
    expect(outlines.mock.calls.filter(([s]) => kept.includes(s))).toHaveLength(0);
  });

  it("keeps every coalesced point of a move and hands the stroke on as it ends", () => {
    const kept: Stroke[] = [];
    const { getByTestId } = render(<InkPad strokes={[]} onStroke={(s) => kept.push(s)} label="Page" />);
    const pad = getByTestId("scratchpad-ink");
    expect(pad.getAttribute("data-base-ui-swipe-ignore")).toBe("");
    fireEvent.pointerDown(pad, { pointerId: 1, pointerType: "mouse", isPrimary: true, clientX: 10, clientY: 10 });
    const move = new MouseEvent("pointermove", { bubbles: true, clientX: 14, clientY: 14 }) as MouseEvent & {
      pointerId: number;
      getCoalescedEvents: () => object[];
    };
    Object.assign(move, {
      pointerId: 1,
      pointerType: "mouse",
      getCoalescedEvents: () => [11, 12, 13].map((v) => ({ clientX: v, clientY: v, pointerType: "mouse", pressure: 0.5 })),
    });
    fireEvent(pad, move);
    expect(getByTestId("scratchpad-live").getAttribute("d")).not.toBe("");
    fireEvent.pointerUp(pad, { pointerId: 1 });
    expect(kept).toHaveLength(1);
    expect(kept[0]?.points).toHaveLength(4);
    expect(getByTestId("scratchpad-live").getAttribute("d")).toBe("");
  });
});
