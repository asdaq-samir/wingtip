/**
 * Listening to the radio through the phone's microphone, a transmission
 * at a time, for as long as the pilot leaves it on (lib/atcRadio): each
 * pause ends one and the next is heard afresh, so what ATC says shows as
 * it is said and a call to us can be acted on (lib/heardCall).
 *
 * The browser's Web Speech API, on the device only (lib/speechLocal):
 * each recognizer is told to process locally, and where the browser
 * cannot promise that (Safari, Firefox, an older Chrome) nothing listens
 * and a clearance is typed. Nothing a pilot says is sent to a server.
 *
 * Which input a browser's recognizer hears: the one the page hands it
 * (`track`, lib/audioInput) where it takes one -- Chrome and Edge 135+ and
 * Firefox 160 on the desktop -- and elsewhere the phone's or computer's
 * own choice, which lib/audioInput can only steer (the owner's "can the
 * mic button tune into a frequency?" and "Bluetooth is fine",
 * 2026-11-04: the radio reaches the phone from the audio panel over
 * Bluetooth or a cable, as a microphone).
 */

import { processesLocally, readyLocally, readyNow, recognitionClass, SPEECH_LANG } from "./speechLocal";

/** A transmission heard so far (`id` the same until it ends), and
 *  whether the recognizer has settled on it. */
type OnHeard = (id: number, text: string, final: boolean) => void;

/** Listening has ended: stopped, or (`error`) refused or failed. */
type OnEnded = (error?: string) => void;

/** The browser's recognizer, where it has one; Safari's and Chrome's are
 *  still prefixed. Only what is used here. */
interface WebRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  /** Chrome's on-device switch: the audio stays on the device. */
  processLocally: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  /** With a track where the browser takes one (lib/speechLocal's takesTrack); Safari's
   *  declares start() alone, so under WebIDL the extra argument is
   *  ignored there without an error. */
  start(track?: MediaStreamTrack): void;
  stop(): void;
}
type WebRecognitionClass = new () => WebRecognition;

/** No microphone could be had, and what to try, by where. A Bluetooth
 *  panel or headset may simply have gone. Safari on iOS 26.3 to 26.6
 *  loses the microphone after a media-services reset until it is opened
 *  again (WebKit bug 319706; its fix is on the 7625 line, Safari 27, not
 *  26.x), and every browser on an iPhone or iPad is WebKit; elsewhere a
 *  reload asks again. */
export function noMicrophone(): string {
  const ua = typeof navigator !== "undefined" ? (navigator.userAgent ?? "") : "";
  // iPadOS's Safari says it is a Mac; a touch screen gives it away.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
  const again = !ios
    ? "reload the page"
    : /CriOS|FxiOS|EdgiOS/.test(ua)
      ? "close the browser and open it again"
      : "close Safari and open it again";
  return `No microphone could be used. If a Bluetooth audio panel or headset was the input, check it is still connected; if it is, ${again}.`;
}

/** Why nothing listens: speech cannot be recognised on this device. */
const NOT_HERE = "Speech can't be recognised on this device; type the clearance instead.";

/** Why nothing listens: this browser's recognizer is a server's, and
 *  there is no connection to it. */
export const NEEDS_CONNECTION = "Speech needs a connection in this browser; type the clearance instead.";

/** The recognizer's refusal or failure in a pilot's words. A refusal is
 *  undone where it was given, in the browser's settings for the site: a
 *  website has no entry of its own in iOS's Settings, and words saying
 *  so sent pilots looking for one. */
function errorWords(code: string): string {
  if (code === "not-allowed" || code === "service-not-allowed" || code === "refused") {
    const ua = typeof navigator !== "undefined" ? (navigator.userAgent ?? "") : "";
    const safari = /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\//.test(ua);
    return `Microphone or speech recognition access was refused; allow it in ${safari ? "Safari's" : "the browser's"} settings for this website.`;
  }
  // Safari's recognizer is Apple's server's, not the device's: with no
  // connection it fails with "network", which was said as the device
  // being unable to (the offline audit, 2026-11-10). Said as what it is.
  if (code === "network") return NEEDS_CONNECTION;
  if (code === "language-not-supported") return NOT_HERE;
  if (code === "audio-capture") return noMicrophone();
  return code;
}

/** A listening, ended by `stop`; `renew` starts the browser's recognizer
 *  afresh, as it is after a pause, to take another input (`track`). */
interface Listening {
  stop: () => void;
  renew: () => void;
}

/**
 * Listens until `stop`, a transmission at a time. `words` and
 * `callPattern` are kept for the callers' sake: a browser's recognizer
 * takes neither (the native apps listen with their own). `track`, the input lib/audioInput holds, read afresh at each start so a
 * new choice is heard from the next.
 *
 * With the language pack on the device the recognizer starts before
 * this returns, with no await before it, straight from the tap.
 */
export async function listen(
  _words: string[],
  _callPattern: string | undefined,
  onHeard: OnHeard,
  onEnded: OnEnded,
  track?: () => MediaStreamTrack | null,
): Promise<Listening> {
  const Recognition = recognitionClass() as WebRecognitionClass | null;
  // Where the language pack is there, no await before the start; else it
  // is fetched first, from the pilot's tap; where the browser cannot keep
  // it on the device, its own recognizer (lib/speechLocal).
  if (!Recognition || !(readyNow() || (await readyLocally()))) {
    onEnded(NOT_HERE);
    return { stop: () => {}, renew: () => {} };
  }
  // A browser's recognizer ends by itself after a while, quiet or not:
  // started again until the pilot stops it, its transmissions numbered on.
  let stopped = false,
    failed: string | undefined,
    base = 0,
    seen = 0;
  const begin = () => {
    const recognition = new Recognition();
    // Stopped by `renew` to start again on another input: what it says
    // as it goes is no failure.
    let retired = false;
    if (processesLocally()) recognition.processLocally = true;
    recognition.lang = SPEECH_LANG;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]!;
        onHeard(base + i, (result[0]?.transcript ?? "").trim(), result.isFinal);
        seen = Math.max(seen, i + 1);
      }
    };
    recognition.onerror = (event) => {
      // Quiet is no failure while listening to a radio.
      if (!retired && !["aborted", "no-speech"].includes(event.error)) failed = errorWords(event.error);
    };
    recognition.onend = () => {
      if (stopped || failed) {
        onEnded(failed);
        return;
      }
      base += seen;
      seen = 0;
      current = begin();
    };
    startOn(recognition, track?.() ?? null);
    return {
      recognition,
      retire: () => {
        retired = true;
        recognition.stop();
      },
    };
  };
  let current = begin();
  return {
    stop: () => {
      stopped = true;
      current.recognition.stop();
    },
    renew: () => {
      if (!stopped) current.retire();
    },
  };
}

/** Starts a recognizer on the held input where it is live, as the Web
 *  Speech API takes one; a track it will not take (ended, not audio:
 *  InvalidStateError, as the spec and Chromium's speech_recognition.cc
 *  have it) and the default input is heard instead. */
function startOn(recognition: WebRecognition, track: MediaStreamTrack | null) {
  if (track && track.kind === "audio" && track.readyState === "live") {
    try {
      recognition.start(track);
      return;
    } catch (err) {
      if ((err as { name?: unknown } | null)?.name !== "InvalidStateError") throw err;
    }
  }
  recognition.start();
}

/**
 * One thing said, as the words so far: `text` heard under `id` put into
 * `said` and the whole read back in order. The same words again under a
 * new number, or the last words with more after them, are the last
 * result over again, not a new one: Safari's recognizer gives a finished
 * phrase again as a new result, and again after it starts itself afresh,
 * and the pill read "Plan a trip to Las Vegas Plan a trip to Las Vegas"
 * (the owner's screenshot, 2026-11-03). Both the radio heard once
 * (lib/atcListening) and the pilot's own voice (features/voice) use it.
 */
export function saidSoFar(said: Map<number, string>, id: number, text: string): string {
  const last = [...said.keys()].filter((k) => k < id).sort((a, b) => b - a)[0];
  if (last !== undefined) {
    const before = said.get(last)!.toLowerCase(),
      now = text.toLowerCase();
    if (now === before || now.startsWith(before) || before.startsWith(now)) said.delete(last);
  }
  said.set(id, text);
  return [...said.entries()]
    .sort((a, b) => a[0] - b[0])
    .map((e) => e[1])
    .join(" ");
}
