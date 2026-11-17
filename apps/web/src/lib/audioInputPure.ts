import { create } from "zustand";
import { noMicrophone } from "./listen";

/** One input, as enumerateDevices lists it once the page may see names. */
export interface Input {
  id: string;
  label: string;
  outside: boolean;
}

/** An input chosen, as preferences keep it: by id, then by name. */
export interface InputChoice {
  id: string;
  label: string;
}

/** The device's own microphone by its name in Safari ("iPhone Microphone",
 *  "MacBook Pro Microphone"), Chrome ("… (Built-in)", "Default") and
 *  Firefox; a Windows laptop's "Microphone Array". */
const BUILT_IN = [
  /^$/,
  /^default$/i,
  /\b(iPhone|iPad|iPod)\b.*\bMicrophone\b/i,
  /\(Built-in\)/i,
  /^(MacBook( Air| Pro)?|iMac|Mac( mini| Studio| Pro)?|Studio Display|Built-in|Internal) Microphone\b/i,
  /^Microphone Array\b/i,
];

/** Whether an input is not the phone's or the computer's own microphone:
 *  a Bluetooth panel or headset, a cable's. */
export function isOutside(label: string): boolean {
  const name = label.replace(/^Default\s*-\s*/i, "").trim();
  return !BUILT_IN.some((re) => re.test(name));
}

/** The level of a block of samples, 0 to 1: its RMS from -60 to 0 dBFS,
 *  so a full-scale sine reads 0.95 and silence 0. */
export function levelOf(samples: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  if (!(rms > 0)) return 0;
  return Math.min(1, Math.max(0, (20 * Math.log10(rms) + 60) / 60));
}

/** The input in a list that a choice names: by its id, else its name
 *  (Chrome's "Default - " taken off), as a private window gives a device
 *  another id. */
export function matchInput(inputs: Input[], want: InputChoice | null): Input | null {
  if (!want) return null;
  const bare = (label: string) => label.replace(/^Default\s*-\s*/i, "").trim();
  return (
    inputs.find((i) => i.id === want.id) ??
    inputs.find((i) => i.label === want.label) ??
    inputs.find((i) => bare(i.label) === bare(want.label)) ??
    null
  );
}

/** The device's own microphone asks for the voice processing listening
 *  always had: on iOS a new capture takes the shared unit's state as it
 *  stands (WebKit's CoreAudioCaptureUnit; the research's claim 28), which
 *  an outside input opened before has turned off. */
export function constraintsFor(target: InputChoice | null, outside: boolean): MediaTrackConstraints {
  if (!target) return { echoCancellation: true };
  return outside
    ? { deviceId: { exact: target.id }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    : { deviceId: { exact: target.id }, echoCancellation: true };
}

/** Why a capture was refused, in a pilot's words. Only ever in a browser
 *  (canPickInput), where a website has no entry of its own in iOS's
 *  Settings: the browser's own settings for the site allow it. */
export function failWords(err: unknown, label: string | null): string {
  const { name, message } = (err ?? {}) as { name?: unknown; message?: unknown };
  if (typeof message === "string" && /AVAudioSessionCaptureDevice/.test(message)) return noMicrophone();
  if (name === "NotAllowedError" || name === "SecurityError") {
    const ua = navigator.userAgent ?? "";
    const safari = /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\//.test(ua);
    return `Microphone access was refused; allow it in ${safari ? "Safari's" : "the browser's"} settings for this website.`;
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return `${label ?? "The microphone"} could not be found; check it is connected.`;
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return `${label ?? "The microphone"} could not be used; another app may have it.`;
  }
  return noMicrophone();
}

export function settingsId(track: MediaStreamTrack): string {
  try {
    return track.getSettings?.().deviceId ?? "";
  } catch {
    return "";
  }
}

/**
 * What the picker shows: whether this page load may list the inputs by
 * name yet (`found`; Safari lists them only after a capture has been
 * granted in the same page load, WebKit's ExposeCaptureDevicesAfterCapture,
 * not after the site's stored permission), the inputs, the one the held
 * track is on, and why a choice could not be had.
 */
export const useInputs = create<{ found: boolean; inputs: Input[]; chosen: string | null; problem: string | null }>(() => ({
  found: false,
  inputs: [],
  chosen: null,
  problem: null,
}));

export interface Held {
  stream: MediaStream;
  track: MediaStreamTrack;
  /** The input chosen, as asked for: its name stays what was picked once
   *  the track's own changes. */
  id: string;
  label: string;
  outside: boolean;
  detach: () => void;
}
