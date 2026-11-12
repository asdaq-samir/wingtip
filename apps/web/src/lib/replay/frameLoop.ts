/**
 * A replay rendered to video offline, frame by frame: never recorded off
 * the screen in real time, where a slow frame is a dropped one. Each
 * frame is put at its own moment of the replay, drawn (the map waited
 * for until its tiles are in), and handed to every sink (the video's
 * canvas sources, mediabunny's backpressure awaited) before the next.
 */

/** What part of the replay becomes the video and how: from `start` to
 *  `end` (s since 1970), `speed` times as flown, `fps` frames a second. */
export interface FrameRange {
  start: number;
  end: number;
  speed: number;
  fps: number;
}

/** A video track a frame is added to: mediabunny's CanvasSource's `add`. */
export interface FrameSink {
  add(timestampS: number, durationS: number): Promise<void>;
}

/** How many frames the video has. */
export const frameCount = (r: FrameRange) => Math.max(1, Math.round(((r.end - r.start) / r.speed) * r.fps));

/** The replay's moment frame `i` shows. */
export const frameMoment = (r: FrameRange, i: number) => r.start + (i / r.fps) * r.speed;

export class ExportCancelled extends Error {
  constructor() {
    super("The export was cancelled.");
  }
}

/**
 * Every frame of `range`, in order: `draw` puts the replay at the frame's
 * moment and draws it (the replay's moment, the video's time and the
 * frame's index given), then each sink takes the frame at its time and
 * duration in the video. `onProgress` hears the share done after each;
 * `signal` stops it between frames with ExportCancelled.
 */
export async function renderFrames(
  range: FrameRange,
  draw: (frame: { index: number; t: number; videoS: number }) => Promise<void>,
  sinks: FrameSink[],
  opts: { signal?: AbortSignal; onProgress?: (done: number) => void } = {},
): Promise<number> {
  const count = frameCount(range);
  const duration = 1 / range.fps;
  for (let index = 0; index < count; index++) {
    if (opts.signal?.aborted) throw new ExportCancelled();
    const videoS = index * duration;
    await draw({ index, t: frameMoment(range, index), videoS });
    for (const sink of sinks) await sink.add(videoS, duration);
    opts.onProgress?.((index + 1) / count);
  }
  return count;
}
