import { describe, expect, it, vi } from "vitest";

const callEngine = vi.fn((_name: string, input: { speed_kt: number | null }) => (input.speed_kt ?? 0) >= 40);
vi.mock("../../engine/engine", () => ({
  engineLoaded: () => true,
  callEngine: (name: string, input: { speed_kt: number | null }) => callEngine(name, input),
}));

const { underway } = await import("./glide");

const fix = (speedKt: number | null) => ({ lat: 42, lon: -88, accuracyM: 5, headingDeg: 0, altitudeFt: 3000, speedKt, at: 0 });

describe("underway", () => {
  it("asks the engine once for the same speed, however many ask it of the fix", () => {
    callEngine.mockClear();
    const at = fix(95);
    for (let i = 0; i < 10; i++) expect(underway(at)).toBe(true);
    expect(callEngine).toHaveBeenCalledTimes(1);
  });

  it("asks again as the speed changes, and gives the new answer", () => {
    callEngine.mockClear();
    expect(underway(fix(140))).toBe(true);
    expect(underway(fix(12))).toBe(false);
    // No fix and a fix with no speed are the same question.
    expect(underway(null)).toBe(false);
    expect(underway(fix(null))).toBe(false);
    expect(callEngine).toHaveBeenCalledTimes(3);
  });
});
