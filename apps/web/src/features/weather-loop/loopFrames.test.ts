import { describe, expect, it } from "vitest";
import { dwellMs, firstPlay, frameTime, nextInPass, playFrom, FRAME_MS } from "./loopFrames";

describe("the loop's frames", () => {
  it("writes a frame's time in Zulu and its age, and says when it is old", () => {
    const now = Date.parse("2026-11-09T21:32:00Z");
    const fresh = frameTime("2026-11-09T21:20:00Z", now, 900);
    expect(fresh.zulu).toBe("2120Z");
    expect(fresh.age).toBe("12m ago");
    expect(fresh.old).toBe(false);
    expect(frameTime("2026-11-09T21:10:00Z", now, 900).old).toBe(true);
  });

  it("plays one pass and stops on the newest frame (WCAG 2.2.2)", () => {
    expect(nextInPass(0, 12)).toBe(1);
    expect(nextInPass(10, 12)).toBe(11);
    expect(nextInPass(11, 12)).toBeNull();
    expect(nextInPass(0, 0)).toBeNull();
    expect(dwellMs("fast")).toBe(FRAME_MS.fast);
  });

  it("starts a pass from the oldest frame when Play is pressed on the newest", () => {
    expect(playFrom(11, 12)).toBe(0);
    expect(playFrom(-1, 12)).toBe(0);
    expect(playFrom(4, 12)).toBe(4);
  });

  it("never plays by itself under Reduce Motion: the newest frame, still", () => {
    expect(firstPlay(true)).toEqual({ playing: false, index: null });
    expect(firstPlay(false)).toEqual({ playing: true, index: 0 });
  });
});
