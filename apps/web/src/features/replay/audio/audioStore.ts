import { create } from "zustand";
import type { AudioSync } from "../../../lib/replay/audioSync";

/**
 * The radio recording a replay plays with: the creator's own file (the
 * Studio never fetches one: LiveATC's archive, the obvious source, may
 * only be used with its own permission), decoded once for the video's
 * sound track and the captions, and its sync to the replay's clock.
 */
interface AudioState {
  file: File | null;
  /** The file's address in this page, for the waveform and the player. */
  url: string | null;
  buffer: AudioBuffer | null;
  sync: AudioSync | null;
  problem: string | null;
}

export const useReplayAudio = create<AudioState>(() => ({ file: null, url: null, buffer: null, sync: null, problem: null }));

/** A recording picked: decoded, the last one let go. */
export async function pickAudio(file: File) {
  const old = useReplayAudio.getState().url;
  if (old) URL.revokeObjectURL(old);
  useReplayAudio.setState({ file, url: URL.createObjectURL(file), buffer: null, sync: null, problem: null });
  try {
    const context = new AudioContext();
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    void context.close();
    useReplayAudio.setState({ buffer });
  } catch {
    useReplayAudio.setState({ problem: "This recording couldn't be read. Try an MP3, M4A, WAV or OGG file." });
  }
}

export function setAudioSync(sync: AudioSync | null) {
  useReplayAudio.setState({ sync });
}

export function dropAudio() {
  const old = useReplayAudio.getState().url;
  if (old) URL.revokeObjectURL(old);
  useReplayAudio.setState({ file: null, url: null, buffer: null, sync: null, problem: null });
}

/** The recording as Whisper hears it: one channel at 16 kHz. */
export async function speechSamples(buffer: AudioBuffer): Promise<Float32Array> {
  const rate = 16_000;
  const offline = new OfflineAudioContext(1, Math.ceil(buffer.duration * rate), rate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  return (await offline.startRendering()).getChannelData(0);
}
