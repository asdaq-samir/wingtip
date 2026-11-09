/**
 * Whether this browser can recognise speech on the device, and nowhere
 * else: the one test every voice control asks (lib/listen, and the
 * screens through useCanListen).
 *
 * Nothing a pilot says leaves the phone or computer (the owner,
 * 2026-11-09: "I don't want anyone to get spooked that we are sending
 * their data to Google or Apple"). The Web Speech API sends audio to the
 * browser maker's servers unless the page asks for local processing:
 * Chrome 139+ takes `processLocally` on a recognizer and answers
 * `SpeechRecognition.available({ langs, processLocally: true })` with
 * "available", "downloadable", "downloading" or "unavailable", and
 * `install` fetches the language pack (the Web Speech API draft, "on-device
 * speech recognition"; Chrome's 2025 on-device launch). Safari's
 * recognizer and Firefox's have neither, and an older Chrome neither, so
 * there they cannot be told to stay on the device: voice is not offered
 * at all there, the microphone controls hidden, and a clearance is typed.
 * There is no server fallback and no setting for one.
 */
import { useEffect } from "react";
import { create } from "zustand";

/** The language the recognizer hears: US ATC phraseology (FAA Order
 *  JO 7110.65, and AIM 4-2 for the pilot's side) is spoken in English. */
export const SPEECH_LANG = "en-US";

/** What `available` answers, and "checking" before it has. */
type SpeechHere = "checking" | "available" | "downloadable" | "downloading" | "unavailable";

interface LocalOptions { langs: string[]; processLocally: boolean }

/** The recognizer's class as the browser has it: the constructor, and the
 *  two statics that make on-device recognition possible to ask for. */
interface RecognitionClass {
  new (): object;
  available?: (options: LocalOptions) => Promise<string>;
  install?: (options: LocalOptions) => Promise<boolean>;
}

const LOCAL: LocalOptions = { langs: [SPEECH_LANG], processLocally: true };

/** The browser's recognizer class, prefixed or not, where it has one. */
export function recognitionClass(): RecognitionClass | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const useSpeechHere = create<{ state: SpeechHere }>(() => ({ state: "checking" }));

let asked: Promise<SpeechHere> | null = null;

/** Asks the browser once whether it can recognise English on the device;
 *  anything but a clear answer is "unavailable". */
export function checkSpeech(): Promise<SpeechHere> {
  asked ??= (async (): Promise<SpeechHere> => {
    const Recognition = recognitionClass();
    let state: SpeechHere = "unavailable";
    if (Recognition && typeof Recognition.available === "function") {
      try {
        const answer = await Recognition.available(LOCAL);
        if (answer === "available" || answer === "downloadable" || answer === "downloading") state = answer;
      } catch {
        state = "unavailable";
      }
    }
    useSpeechHere.setState({ state });
    return state;
  })();
  return asked;
}

/** Whether voice is offered here, for a screen, which shows its
 *  microphone once the browser has answered that speech stays on the
 *  device: false until then, and where it cannot. */
export function useCanListen(): boolean {
  useEffect(() => { void checkSpeech(); }, []);
  return useSpeechHere(s => s.state === "available" || s.state === "downloadable" || s.state === "downloading");
}

/**
 * Ready to recognise on the device: at once where the language pack is
 * there, else after `install` fetches it (started from the pilot's tap,
 * which Chrome asks of a download). False where it cannot be.
 */
export async function readyLocally(): Promise<boolean> {
  const state = useSpeechHere.getState().state === "checking" ? await checkSpeech() : useSpeechHere.getState().state;
  if (state === "available") return true;
  if (state === "unavailable") return false;
  const Recognition = recognitionClass();
  try {
    const installed = (await Recognition?.install?.(LOCAL)) === true;
    if (installed) useSpeechHere.setState({ state: "available" });
    return installed;
  } catch {
    return false;
  }
}

/** Whether a start needs no wait: the pack is there already. */
export function readyNow(): boolean {
  return useSpeechHere.getState().state === "available";
}

/** For tests: forget the browser's answer, so the next check asks again. */
export function forgetSpeechCheck() {
  asked = null;
  useSpeechHere.setState({ state: "checking" });
}
