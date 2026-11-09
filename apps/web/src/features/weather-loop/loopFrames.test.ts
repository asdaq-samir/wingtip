import { describe, expect, it } from "vitest";
import { dwellMs, frameTime, nextFrame, FRAME_MS, NEWEST_HOLD_MS } from "./loopFrames";

describe("the loop's frames", () => {
  it("writes a frame's time in Zulu and its age, and says when it is old", () => {
    const now = Date.parse("2026-11-09T21:32:00Z");
    const fresh = frameTime("2026-11-09T21:20:00Z", now, 900);
    expect(fresh.zulu).toBe("2120Z");
    expect(fresh.age).toBe("12m ago");
    expect(fresh.old).toBe(false);
    expect(frameTime("2026-11-09T21:10:00Z", now, 900).old).toBe(true);
  });

  it("goes round, holding on the newest frame", () => {
    expect(nextFrame(10, 12)).toBe(11);
    expect(nextFrame(11, 12)).toBe(0);
    expect(nextFrame(0, 0)).toBe(0);
    expect(dwellMs(3, 12, "fast")).toBe(FRAME_MS.fast);
    expect(dwellMs(11, 12, "fast")).toBe(NEWEST_HOLD_MS);
  });
});
