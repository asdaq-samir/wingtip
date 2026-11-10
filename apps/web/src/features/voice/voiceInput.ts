/**
 * Ask by voice: the pilot says one thing to the app -- a search, a route,
 * a question -- and the words appear in the field they were said for as
 * they are said, the way a phone's dictation types into a field. A
 * feature of its own, apart from listening to the radio (lib/atcListening,
 * the Comms assist pill and the captions): the owner, 2026-11-10, "the mic
 * is a speaking feature for a pilot to ask anything vs radio listening is
 * a separate feature. So they should not share animations." So nothing
 * here touches the radio's store, its pill, its log or its waveform.
 *
 * The browser's own recognizer, on the device where the browser can keep
 * it there (lib/speechLocal, the owner's rule of 2026-11-09), through
 * lib/listen. It hears the default microphone, the pilot's own voice, not
 * the audio panel the radio may be chosen through (lib/audioInput).
 */
import { listen, saidSoFar } from "../../lib/listen";
import { useAtcRadio } from "../../lib/atcRadio";
import { useVoiceInput } from "./voiceStore";

/** Once words have come, this long with no more ends it, ms: the pause
 *  at the end of a sentence, as the radio's once-listening has it. */
const PAUSE_MS = 1800;
/** With nothing said at all, it ends after this long, ms. */
const NOTHING_MS = 8000;
/** It ends after this long whatever is said, ms. */
const LONGEST_MS = 30000;

let stopping: (() => void) | null = null;
/** Asked to end before the recognizer was ready: ended as it is. */
let stopAsked = false;

/** Ends the listening now; what was said so far is what was said. */
export function stopVoice() {
  if (stopping) stopping();
  else if (useVoiceInput.getState().field) stopAsked = true;
}

/**
 * Listens for one thing said into `field`: the words in the store as they
 * come, and the whole once a pause ends them, nothing is said, or the
 * pilot taps the mic again (stopVoice). Resolves with what was said, ""
 * where nothing was. While the radio is being listened to it does not
 * start -- one recognizer at a time, as two in a page cut each other off
 * -- and says why; an ATIS being heard is stopped, the tap winning.
 */
export async function hearVoice(field: string): Promise<string> {
  if (useVoiceInput.getState().field) return "";
  if (useAtcRadio.getState().listening) {
    useVoiceInput.setState({ error: { field, text: "The radio is being listened to; stop it to ask by voice." } });
    return "";
  }
  useAtcRadio.getState().atisStop?.();
  stopAsked = false;
  useVoiceInput.setState({ field, words: "", error: null });
  const said = new Map<number, string>();
  let words = "";
  return new Promise<string>((resolve) => {
    let quiet = window.setTimeout(stopVoice, NOTHING_MS);
    const longest = window.setTimeout(stopVoice, LONGEST_MS);
    // The radio started meanwhile (Comms assist, the Radio card): it has
    // the recognizer, and this ends.
    const offRadio = useAtcRadio.subscribe((s) => {
      if (s.listening) stopVoice();
    });
    void listen(
      [],
      undefined,
      (id, text) => {
        if (!text) return;
        words = saidSoFar(said, id, text);
        useVoiceInput.setState({ words });
        window.clearTimeout(quiet);
        quiet = window.setTimeout(stopVoice, PAUSE_MS);
      },
      (error) => {
        stopping = null;
        window.clearTimeout(quiet);
        window.clearTimeout(longest);
        offRadio();
        useVoiceInput.setState({
          field: null,
          words: "",
          error: error || !words ? { field, text: error ?? "Nothing was heard. Tap the microphone and speak your question." } : null,
        });
        resolve(words);
      },
    ).then(({ stop }) => {
      // Ended before the recognizer was ready (no recognizer here): the
      // field is already let go. A tap or a timer meanwhile ends it now.
      if (useVoiceInput.getState().field !== field) return;
      if (stopAsked) stop();
      else stopping = stop;
    });
  });
}
