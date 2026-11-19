import { inputLevel } from "./atcRadio";
import { levelOf } from "./audioInputPure";

let context: AudioContext | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let meter: ReturnType<typeof setInterval> | null = null;

export function startContext() {
  const Context =
    (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return;
  try {
    if (!context || context.state === "closed") context = new Context();
    void context.resume?.().catch(() => {});
  } catch {
    context = null;
  }
}

/** Ten readings a second of the held stream, through an AnalyserNode that
 *  goes nowhere: nothing is played back or kept. */
export function meterOn(stream: MediaStream) {
  if (!context) return;
  try {
    source?.disconnect();
    source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    if (meter) clearInterval(meter);
    meter = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      inputLevel.emit(levelOf(samples));
    }, 100);
  } catch {
    // No meter: the bars keep their own rise and fall.
  }
}

export function setSession(type: "play-and-record" | "playback" | "auto") {
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (!session) return;
  try {
    session.type = type;
  } catch {
    // Safari 16.4+ only; elsewhere the session is the browser's.
  }
}

/** The meter and its context shut, nothing left running. */
export function stopMeter() {
  if (meter) clearInterval(meter);
  meter = null;
  try {
    source?.disconnect();
  } catch {
    // already gone
  }
  source = null;
  if (context) void context.close?.().catch(() => {});
  context = null;
}
