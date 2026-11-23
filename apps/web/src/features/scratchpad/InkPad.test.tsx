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
});
