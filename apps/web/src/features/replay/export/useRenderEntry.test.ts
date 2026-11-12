import { describe, expect, it } from "vitest";
import { outputSize, RENDER_PRESETS } from "./exportOptions";
import { draftSpeed } from "./useRenderEntry";

describe("a crash draft's film", () => {
  it("runs at the slowest Studio speed that keeps it to three minutes", () => {
    expect(draftSpeed(120)).toBe(1);
    expect(draftSpeed(180)).toBe(1);
    expect(draftSpeed(181)).toBe(2);
    // The identity check's window, 60 minutes before to 15 after: 4.7 minutes of film at 16x.
    expect(draftSpeed(75 * 60)).toBe(16);
  });

  it("goes no faster than 16x, however long the day", () => {
    expect(draftSpeed(12 * 3600)).toBe(16);
  });

  it("is 1080p 16:9 at 30 fps with the credits and the disclaimer, finished or as layers", () => {
    for (const [name, kind] of [
      ["draft-1080p", "finished"],
      ["draft-1080p-layers", "layers"],
    ] as const) {
      const choice = RENDER_PRESETS[name]!;
      expect(outputSize(choice.resolution, choice.aspect)).toEqual({ width: 1920, height: 1080 });
      expect(choice).toMatchObject({ fps: 30, kind, credits: true, disclaimer: true });
    }
  });
});
