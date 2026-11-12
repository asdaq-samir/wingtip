import type { Map as MlMap } from "maplibre-gl";
import { audioSpan, type AudioSync } from "../../../lib/replay/audioSync";
import { toSrt, type Caption } from "../../../lib/replay/captions";
import { positionAt, usePastFlight } from "../../../lib/replay/clock";
import { renderFrames, type FrameRange, type FrameSink } from "../../../lib/replay/frameLoop";
import { replayView, showView } from "../camera/cameraView";
import { DISCLAIMER, drawOverlay, type OverlayScene } from "./drawOverlay";
import type { ExportChoice } from "./exportOptions";
import { drawAirplane, drawMapFrame, withMapSized } from "./mapFrames";

/** What a video is made of: the frames' range, its size and choices, the
 *  overlays' scene, the captions for the SRT, and the radio, if any. */
export interface ExportJob {
  map: MlMap;
  range: FrameRange;
  size: { width: number; height: number };
  choice: ExportChoice;
  scene: OverlayScene;
  captions: Caption[];
  audio: { buffer: AudioBuffer; sync: AudioSync } | null;
  /** Called before each frame: false stops the export (imagery that may
   *  not be exported has come under the map). */
  allowed: () => boolean;
  name: string;
}

export class ExportRefused extends Error {}

/** A canvas the video's size, drawn on in 2D. */
function canvas2d(size: { width: number; height: number }, alpha: boolean) {
  const c = new OffscreenCanvas(size.width, size.height);
  const ctx = c.getContext("2d", { alpha }) as unknown as CanvasRenderingContext2D | null;
  if (!ctx) throw new ExportRefused("This browser can't draw the video's frames.");
  return { canvas: c, ctx };
}

/** The radio of the range as one buffer: silence where the video starts
 *  before the recording, the recording's samples after. */
function audioOfRange(audio: { buffer: AudioBuffer; sync: AudioSync }, range: FrameRange): AudioBuffer | null {
  const { buffer, sync } = audio;
  const span = audioSpan(sync, range, buffer.sampleRate, buffer.length);
  const length = Math.round((range.end - range.start) * buffer.sampleRate);
  if (span.to <= span.from || length <= 0) return null;
  const out = new AudioBuffer({ length, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const part = buffer.getChannelData(ch).subarray(span.from, Math.min(span.to, span.from + length - span.lead));
    out.copyToChannel(part, ch, span.lead);
  }
  return out;
}

/**
 * A replay rendered to video, offline and frame by frame (lib/replay's
 * renderFrames), with mediabunny (MPL-2.0; WebCodecs encoding, its
 * CanvasSource taking each frame with backpressure) -- on its own chunk,
 * fetched when an export starts:
 *
 * - finished: one MP4 (H.264 where the browser encodes it, else VP9), the
 *   map with the overlays drawn over it, and the radio as its sound;
 * - layers: a zip (fflate) of the map alone as MP4, the overlays alone with
 *   their alpha as WebM VP9 (or PNG frames), the radio as its own track of
 *   the map's MP4, and the captions as SRT, for an editor.
 *
 * The radio goes in at 1x only: faster or slower it would be the wrong
 * pitch or the wrong words, so the panel says so. Answers the file.
 */
export async function exportReplay(
  job: ExportJob,
  signal: AbortSignal,
  onProgress: (done: number) => void,
): Promise<{ name: string; blob: Blob }> {
  const mb = await import("mediabunny");
  const { size, choice, range } = job;
  const layers = choice.kind === "layers";
  const mapOut = canvas2d(size, false);
  const overOut = canvas2d(size, true);

  const quality = mb.QUALITY_HIGH;
  const videoCodec = await mb.getFirstEncodableVideoCodec(["avc", "vp9", "av1"], { ...size, quality });
  if (!videoCodec) throw new ExportRefused("This browser can't encode video at this size. Try 1080p.");
  const mp4 = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
  const mapSource = new mb.CanvasSource(mapOut.canvas, { codec: videoCodec, quality, keyFrameInterval: 1 });
  mp4.addVideoTrack(mapSource, { frameRate: range.fps });
  const sinks: FrameSink[] = [mapSource];

  const sound = job.audio && range.speed === 1 ? audioOfRange(job.audio, range) : null;
  const audioCodec = sound ? await mb.getFirstEncodableAudioCodec(["aac", "opus"], { sampleRate: sound.sampleRate }) : null;
  const audioSource = sound && audioCodec ? new mb.AudioBufferSource({ codec: audioCodec, quality }) : null;
  if (audioSource) mp4.addAudioTrack(audioSource);

  let webm: InstanceType<typeof mb.Output> | null = null;
  const pngs: Record<string, Uint8Array> = {};
  if (layers && choice.overlayAs === "webm") {
    if (!(await mb.canEncodeVideo("vp9", { ...size, quality }))) throw new ExportRefused("This browser can't encode VP9. Pick PNG frames.");
    webm = new mb.Output({ format: new mb.WebMOutputFormat(), target: new mb.BufferTarget() });
    const overSource = new mb.CanvasSource(overOut.canvas, { codec: "vp9", quality, alpha: "keep", keyFrameInterval: 1 });
    webm.addVideoTrack(overSource, { frameRate: range.fps });
    sinks.push(overSource);
  } else if (layers) {
    sinks.push({
      add: async (ts) => {
        const blob = await overOut.canvas.convertToBlob({ type: "image/png" });
        pngs[`overlay/${String(Math.round(ts * range.fps)).padStart(6, "0")}.png`] = new Uint8Array(await blob.arrayBuffer());
      },
    });
  }

  const wasAt = usePastFlight.getState().at;
  const wasPlaying = usePastFlight.getState().playing;
  usePastFlight.setState({ playing: false });
  const scene = { ...job.scene, captions: choice.captions && !layers ? job.scene.captions : null };
  const startMs = performance.now();
  try {
    await mp4.start();
    await webm?.start();
    if (audioSource && sound) {
      await audioSource.add(sound);
      audioSource.close();
    }
    await withMapSized(job.map, size, () =>
      renderFrames(
        range,
        async ({ t, videoS }) => {
          if (!job.allowed()) throw new ExportRefused("Google's imagery came under the map, which may not be exported.");
          await drawMapFrame(
            job.map,
            startMs + videoS * 1000,
            () => {
              usePastFlight.setState({ at: t });
              const view = replayView(job.map, t, videoS);
              if (view) showView(job.map, view);
            },
            mapOut.ctx,
          );
          await drawAirplane(job.map, positionAt(usePastFlight.getState().points, t), mapOut.ctx);
          overOut.ctx.clearRect(0, 0, size.width, size.height);
          drawOverlay(overOut.ctx, scene, t);
          if (!layers) mapOut.ctx.drawImage(overOut.canvas, 0, 0);
        },
        sinks,
        { signal, onProgress },
      ),
    );
    await mp4.finalize();
    await webm?.finalize();
  } catch (err) {
    await mp4.cancel().catch(() => {});
    await webm?.cancel().catch(() => {});
    throw err;
  } finally {
    usePastFlight.setState({ at: wasAt, playing: wasPlaying });
  }

  const video = new Uint8Array((mp4.target as InstanceType<typeof mb.BufferTarget>).buffer!);
  if (!layers) return { name: `${job.name}.mp4`, blob: new Blob([video], { type: "video/mp4" }) };
  const { zipSync } = await import("fflate");
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    [`${job.name}-map.mp4`]: [video, { level: 0 }],
    [`${job.name}-captions.srt`]: new TextEncoder().encode(toSrt(job.captions, range)),
    [`${job.name}-credits.txt`]: new TextEncoder().encode([job.scene.credit, DISCLAIMER].filter(Boolean).join("\n")),
  };
  if (webm)
    files[`${job.name}-overlay.webm`] = [new Uint8Array((webm.target as InstanceType<typeof mb.BufferTarget>).buffer!), { level: 0 }];
  for (const [path, bytes] of Object.entries(pngs)) files[`${job.name}-${path}`] = [bytes, { level: 0 }];
  return { name: `${job.name}-layers.zip`, blob: new Blob([zipSync(files)], { type: "application/zip" }) };
}
