/// <reference lib="webworker" />
import { pipeline } from "@huggingface/transformers";
import type { HeardWord } from "../../../lib/replay/captions";

/**
 * Speech to words on this device, off the page's thread: transformers.js
 * (Apache-2.0) running OpenAI's Whisper base (onnx-community/whisper-base,
 * Apache-2.0) on the GPU through WebGPU where the browser has it, on the
 * CPU (WebAssembly) where not. The recording never leaves the device: the
 * model's weights are fetched once and kept by the browser, the audio is
 * not sent anywhere (the owner's on-device speech rule). Each word comes
 * back with its time in the recording (`return_timestamps: "word"`), the
 * long recording read in 30 s windows with 5 s of overlap.
 *
 * Not a model trained on ATCO2: its data is for research only.
 */
export type TranscribeIn = { samples: Float32Array };
export type TranscribeOut =
  | { kind: "progress"; phase: "model" | "words"; done: number }
  | { kind: "words"; words: HeardWord[]; device: "webgpu" | "wasm" }
  | { kind: "error"; message: string };

const MODEL = "onnx-community/whisper-base";

const post = (m: TranscribeOut) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = async (e: MessageEvent<TranscribeIn>) => {
  try {
    const device = "gpu" in navigator && navigator.gpu ? "webgpu" : "wasm";
    const files = new Map<string, number>();
    const asr = await pipeline("automatic-speech-recognition", MODEL, {
      device,
      // The encoder at full precision on the GPU (its 4-bit form loses
      // words), the decoder at 4 bits; 8-bit on the CPU.
      dtype: device === "webgpu" ? { encoder_model: "fp32", decoder_model_merged: "q4" } : "q8",
      progress_callback: (p: { status: string; file?: string; progress?: number }) => {
        if (p.status !== "progress" || !p.file) return;
        files.set(p.file, (p.progress ?? 0) / 100);
        const all = [...files.values()];
        post({ kind: "progress", phase: "model", done: all.reduce((a, b) => a + b, 0) / all.length });
      },
    });
    post({ kind: "progress", phase: "words", done: 0 });
    const heard = await asr(e.data.samples, {
      return_timestamps: "word",
      chunk_length_s: 30,
      stride_length_s: 5,
      language: "english",
      task: "transcribe",
    });
    const one = Array.isArray(heard) ? heard[0] : heard;
    const words = (one?.chunks ?? []).map((c: { text: string; timestamp: [number, number | null] | number[] }) => ({
      text: c.text,
      timestamp: c.timestamp as [number, number | null],
    }));
    post({ kind: "words", words, device });
  } catch (err) {
    post({ kind: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
