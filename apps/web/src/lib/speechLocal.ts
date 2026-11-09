/**
 * Whether this browser can recognise speech, and whether on the device:
 * the one test every voice control asks (lib/listen, and the screens
 * through useCanListen).
 *
 * The phones recognise speech on the device only (the owner, 2026-11-09:
 * "I don't want anyone to get spooked that we are sending their data to
 * Google or Apple"); in a browser, the owner then said, voice is offered
 * in every browser that has a recognizer, kept on the device wherever the
 * browser can promise it (privacy.md says so). The Web Speech API sends audio to the
 * browser maker's servers unless the page asks for local processing:
 * Chrome 139+ takes `processLocally` on a recognizer and answers
 * `SpeechRecognition.available({ langs, processLocally: true })` with
 * "available", "downloadable", "downloading" or "unavailable", and
 * `install` fetches the language pack (the Web Speech API draft, "on-device
 * speech recognition"; Chrome's 2025 on-device launch). Safari's
 * recognizer has neither, nor an older Chrome: there the browser's own
 * recognizer is used ("browser"), which may send the audio to its maker.
 * Where a browser has no recognizer at all (Firefox), voice is hidden and
 * a clearance is typed.
 */
import { useEffect } from "react";
import { create } from "zustand";

/** The language the recognizer hears: US ATC phraseology (FAA Order
 *  JO 7110.65, and AIM 4-2 for the pilot's side) is spoken in English. */
export const SPEECH_LANG = "en-US";

/** What `available` answers, "checking" before it has, and "browser"
 *  where there is a recognizer that cannot be kept on the device. */
type SpeechHere = "checking" | "available" | "downloadable" | "downloading" | "browser" | "unavailable";

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
 *  a recognizer that can't say so, or says not, is "browser". */
export function checkSpeech(): Promise<SpeechHere> {
  asked ??= (async (): Promise<SpeechHere> => {
    const Recognition = recognitionClass();
    let state: SpeechHere = Recognition ? "browser" : "unavailable";
    if (Recognition && typeof Recognition.available === "function") {
      try {
        const answer = await Recognition.available(LOCAL);
        if (answer === "available" || answer === "downloadable" || answer === "downloading") state = answer;
      } catch {
        state = "browser";
      }
    }
    useSpeechHere.setState({ state });
    return state;
  })();
  return asked;
}

/** Whether voice is offered here, for a screen, which shows its
 *  microphone once the browser has answered: false until then, and where
 *  there is no recognizer. */
export function useCanListen(): boolean {
  useEffect(() => { void checkSpeech(); }, []);
  return useSpeechHere(s => s.state !== "checking" && s.state !== "unavailable");
}

/** Whether the recognizer is to be told to stay on the device. */
export function processesLocally(): boolean {
  return useSpeechHere.getState().state === "available";
}

/**
 * Ready to recognise: at once where the language pack is there or the
 * browser has only its own recognizer, else after `install` fetches the
 * pack (started from the pilot's tap, which Chrome asks of a download).
 * False where there is no recognizer, or the pack would not install.
 */
export async function readyLocally(): Promise<boolean> {
  const state = useSpeechHere.getState().state === "checking" ? await checkSpeech() : useSpeechHere.getState().state;
  if (state === "available" || state === "browser") return true;
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

/** Whether a start needs no wait: the pack is there already, or the
 *  browser's own recognizer is all there is. */
export function readyNow(): boolean {
  const state = useSpeechHere.getState().state;
  return state === "available" || state === "browser";
}

/** For tests: forget the browser's answer, so the next check asks again. */
export function forgetSpeechCheck() {
  asked = null;
  useSpeechHere.setState({ state: "checking" });
}
