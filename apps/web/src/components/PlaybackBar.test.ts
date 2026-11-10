// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { playbackKey } from "./PlaybackBar";

describe("the playback bar's keys", () => {
  it("plays or pauses with Space from the scrubber or the bar, never from a button's own press", () => {
    const bar = document.createElement("div");
    const range = document.createElement("input");
    range.type = "range";
    const button = document.createElement("button");
    const text = document.createElement("input");
    bar.append(range, button, text);
    expect(playbackKey(" ", range)).toBe("toggle");
    expect(playbackKey(" ", bar)).toBe("toggle");
    expect(playbackKey(" ", button)).toBeNull();
    expect(playbackKey(" ", text)).toBeNull();
    // The arrows, Home and End are the scrubber's own (the APG slider).
    expect(playbackKey("ArrowRight", range)).toBeNull();
    expect(playbackKey("Home", range)).toBeNull();
  });
});
