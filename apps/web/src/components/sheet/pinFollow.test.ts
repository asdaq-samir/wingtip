import { describe, expect, it } from "vitest";
import { path } from "./pinFollow";

describe("pinFollow's path", () => {
  it("rides the sheet down and stops where it rests, with a frame where the two meet", () => {
    // The sheet slides 300 down; the figures' foot is 100 above where it
    // rests, so they ride the first third and stay still after it.
    const frames = path({ sheetFrom: 400, sheetTo: 700, from: 0, to: -200, h0: 30, h1: 30 });
    expect(frames).toHaveLength(3);
    expect(frames[1]?.u).toBeCloseTo(1 / 3);
    // Riding: no transform of its own yet at the meeting point.
    expect(frames[1]?.y).toBeCloseTo(0);
    expect(frames[2]).toEqual({ u: 1, y: -200 });
  });

  it("waits on the foot as the sheet comes up until its place reaches it", () => {
    // Held 200 up from its place at the pill; the sheet comes up 300.
    const frames = path({ sheetFrom: 700, sheetTo: 400, from: -200, to: 0, h0: 30, h1: 30 });
    expect(frames).toHaveLength(3);
    expect(frames[1]?.u).toBeCloseTo(2 / 3);
    // Still: as the sheet rises 200, its transform falls 200 to hold it.
    expect(frames[1]?.y).toBeCloseTo(0);
  });

  it("keeps its foot where it rests as it grows, its transform less the growth", () => {
    const frames = path({ sheetFrom: 400, sheetTo: 700, from: 0, to: -215, h0: 30, h1: 45 });
    const last = frames.at(-1);
    expect(last).toEqual({ u: 1, y: -215 });
    // The foot on the screen at the meeting point is where it rests.
    const kink = frames[1];
    expect(kink).toBeDefined();
    if (kink) expect(400 + 300 * kink.u + kink.y + 30 + 15 * kink.u).toBeCloseTo(700 - 215 + 45);
  });

  it("eases straight where no ride fits", () => {
    // It goes up while the sheet goes down: no piece of riding fits.
    expect(path({ sheetFrom: 400, sheetTo: 700, from: 0, to: -400, h0: 30, h1: 30 })).toEqual([
      { u: 0, y: 0 },
      { u: 1, y: -400 },
    ]);
  });
});
