import { create } from "zustand";
import { linesOf, type Caption } from "../../../lib/replay/captions";
import { audioStart } from "../../../lib/replay/audioSync";
import { speechSamples, useReplayAudio } from "../audio/audioStore";
import type { TranscribeOut } from "./transcribe.worker";

/**
 * A replay's captions (lib/replay/captions) and their making: Whisper on
 * this device (transcribe.worker) over the synced recording, then edited
 * by hand -- the words, who said them, when -- shown over the map, burned
 * into a video and written out as SRT.
 */
interface CaptionState {
  captions: Caption[];
  /** While the words are made: the model fetched, then the words heard. */
  making: { phase: "model" | "words"; done: number } | null;
  problem: string | null;
}

export const useCaptions = create<CaptionState>(() => ({ captions: [], making: null, problem: null }));

let worker: Worker | null = null;

/** The recording's words heard on this device, as caption lines on the
 *  replay's clock (the recording's sync), replacing those there were. */
export async function makeCaptions() {
  const { buffer, sync } = useReplayAudio.getState();
  if (!buffer || !sync) return;
  useCaptions.setState({ making: { phase: "model", done: 0 }, problem: null });
  const samples = await speechSamples(buffer);
  worker?.terminate();
  worker = new Worker(new URL("./transcribe.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<TranscribeOut>) => {
    const m = e.data;
    if (m.kind === "progress") useCaptions.setState({ making: { phase: m.phase, done: m.done } });
    else {
      worker?.terminate();
      worker = null;
      if (m.kind === "words") useCaptions.setState({ captions: linesOf(m.words, audioStart(sync)), making: null });
      else useCaptions.setState({ making: null, problem: `The words couldn't be made: ${m.message}` });
    }
  };
  worker.postMessage({ samples }, [samples.buffer]);
}

export function stopCaptions() {
  worker?.terminate();
  worker = null;
  useCaptions.setState({ making: null });
}

export function editCaption(id: string, change: Partial<Omit<Caption, "id">>) {
  useCaptions.setState((s) => ({ captions: s.captions.map((c) => (c.id === id ? { ...c, ...change } : c)) }));
}

export function removeCaption(id: string) {
  useCaptions.setState((s) => ({ captions: s.captions.filter((c) => c.id !== id) }));
}

let added = 0;

/** A line typed by hand at the replay's moment, four seconds long. */
export function addCaption(t: number) {
  const c: Caption = { id: `h${++added}`, from: t, to: t + 4, speaker: "", text: "" };
  useCaptions.setState((s) => ({ captions: [...s.captions, c].sort((a, b) => a.from - b.from) }));
}
