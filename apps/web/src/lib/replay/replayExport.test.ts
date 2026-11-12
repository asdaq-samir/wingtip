import { describe, expect, it } from "vitest";
import { audioAt, audioSpan, clockAt, playerPlan, syncFromZulu } from "./audioSync";
import { captionAt, linesOf, srtTime, toSrt, type Caption } from "./captions";
import { ExportCancelled, frameCount, frameMoment, renderFrames } from "./frameLoop";

// 2026-11-10 14:32:05Z, N14511's day.
const T = Date.UTC(2026, 10, 10, 14, 32, 5) / 1000;

describe("the export's frame loop", () => {
  const range = { start: T, end: T + 10, speed: 2, fps: 30 };

  it("has a frame for each 1/fps of the video, the replay going `speed` times as flown", () => {
    expect(frameCount(range)).toBe(150);
    expect(frameMoment(range, 30)).toBe(T + 2);
  });

  it("draws each frame, then hands it to every sink at its time, in order", async () => {
    // A fake canvas: what each frame drew, and what each sink took of it.
    const canvas = { drawn: -1 };
    const took: [string, number, number, number][] = [];
    const sink = (name: string) => ({
      add: async (ts: number, dur: number) => {
        took.push([name, canvas.drawn, ts, dur]);
      },
    });
    const progress: number[] = [];
    const count = await renderFrames(
      { start: T, end: T + 1, speed: 1, fps: 4 },
      async ({ index }) => {
        canvas.drawn = index;
      },
      [sink("map"), sink("overlay")],
      { onProgress: (p) => progress.push(p) },
    );
    expect(count).toBe(4);
    expect(took.slice(0, 4)).toEqual([
      ["map", 0, 0, 0.25],
      ["overlay", 0, 0, 0.25],
      ["map", 1, 0.25, 0.25],
      ["overlay", 1, 0.25, 0.25],
    ]);
    expect(progress).toEqual([0.25, 0.5, 0.75, 1]);
  });

  it("stops between frames once cancelled", async () => {
    const stop = new AbortController();
    let drawn = 0;
    const run = renderFrames(
      range,
      async () => {
        drawn++;
        if (drawn === 3) stop.abort();
      },
      [],
      { signal: stop.signal },
    );
    await expect(run).rejects.toBeInstanceOf(ExportCancelled);
    expect(drawn).toBe(3);
  });
});

describe("the radio recording on the replay's clock", () => {
  const sync = { audioS: 12, clockT: T };

  it("puts every other moment from the one point set", () => {
    expect(audioAt(sync, T + 30)).toBe(42);
    expect(clockAt(sync, 0)).toBe(T - 12);
  });

  it("reads a typed Zulu time on the replay's day", () => {
    expect(syncFromZulu("14:32:05Z", 12, T + 3600)).toEqual(sync);
    expect(syncFromZulu("143205", 12, T)).toEqual(sync);
    expect(syncFromZulu("25:00:00Z", 12, T)).toBeNull();
    expect(syncFromZulu("soon", 12, T)).toBeNull();
  });

  it("plays at the replay's speed, muted above twice and outside the recording", () => {
    const player = { atS: 42, lengthS: 600 };
    expect(playerPlan(sync, { t: T + 30, playing: true, speed: 2 }, player)).toEqual({ play: true, rate: 2, seekTo: null });
    expect(playerPlan(sync, { t: T + 30, playing: true, speed: 4 }, player).play).toBe(false);
    expect(playerPlan(sync, { t: T - 60, playing: true, speed: 1 }, player)).toEqual({ play: false, rate: 1, seekTo: 0 });
    expect(playerPlan(sync, { t: T + 30, playing: false, speed: 1 }, player).play).toBe(false);
  });

  it("is put back on the clock after a scrub, and left alone within a quarter second", () => {
    expect(playerPlan(sync, { t: T + 100, playing: true, speed: 1 }, { atS: 42, lengthS: 600 }).seekTo).toBe(112);
    expect(playerPlan(sync, { t: T + 30, playing: true, speed: 1 }, { atS: 42.2, lengthS: 600 }).seekTo).toBeNull();
  });

  it("gives the video the recording's samples in range, silence first where it starts later", () => {
    expect(audioSpan(sync, { start: T - 20, end: T }, 10, 1000)).toEqual({ lead: 80, from: 0, to: 120 });
    expect(audioSpan(sync, { start: T, end: T + 200 }, 10, 1000)).toEqual({ lead: 0, from: 120, to: 1000 });
  });
});

describe("captions", () => {
  const words = [
    { text: " Wingtip", timestamp: [1, 1.4] as [number, number] },
    { text: " five", timestamp: [1.4, 1.7] as [number, number] },
    { text: " one", timestamp: [1.7, 2] as [number, number] },
    { text: " Roger", timestamp: [4, 4.4] as [number, number] },
  ];

  it("makes lines of the heard words at each pause, on the replay's clock", () => {
    const lines = linesOf(words, T);
    expect(lines.map((l) => [l.from - T, l.to - T, l.text])).toEqual([
      [1, 2, "Wingtip five one"],
      [4, 4.4, "Roger"],
    ]);
    expect(captionAt(lines, T + 1.5)?.text).toBe("Wingtip five one");
    expect(captionAt(lines, T + 3)).toBeNull();
  });

  it("writes SRT times as hours, minutes, seconds and milliseconds", () => {
    expect(srtTime(3723.4567)).toBe("01:02:03,457");
    expect(srtTime(-1)).toBe("00:00:00,000");
  });

  it("writes an SRT file of the range, the speaker before the words, timed from the video's start", () => {
    const captions: Caption[] = [
      { id: "b", from: T + 10, to: T + 14, speaker: "N14511", text: "Roger" },
      { id: "a", from: T + 2, to: T + 6, speaker: "Tower", text: "Cleared to land" },
      { id: "c", from: T + 100, to: T + 101, speaker: "", text: "Not in range" },
    ];
    expect(toSrt(captions, { start: T + 4, end: T + 12, speed: 2 })).toBe(
      "1\r\n00:00:00,000 --> 00:00:01,000\r\nTower: Cleared to land\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nN14511: Roger\r\n",
    );
  });
});
