import { useEffect } from "react";
import { useCanListen } from "../../lib/speechLocal";
import { useVoiceInput } from "./voiceStore";

/** The listening code, its own chunk, fetched once a field with a mic is
 *  drawn so the tap starts listening at once: Safari lets a page listen
 *  only straight from the tap. */
let voice: typeof import("./voiceInput") | null = null;
const load = () => import("./voiceInput").then((m) => (voice = m));

/** The listening code could not be fetched (offline, its chunk gone with a
 *  new release): said under the field, in place, and nothing listening. A
 *  tap did nothing and said nothing (the web audit's WEB-35). */
const unloaded = (field: string) =>
  useVoiceInput.setState({
    field: null,
    words: "",
    error: { field, text: "Ask by voice could not be loaded. Check your connection and try again." },
  });

/**
 * Ask by voice for one field: whether a mic is offered here (on-device
 * speech, lib/speechLocal), whether it is listening, the words so far for
 * the field to show in place of what was typed, the placeholder while
 * nothing is said yet, why nothing was heard, and the tap -- a second one
 * ends it. `onSaid` gets what was said once a pause ends it.
 */
export function useVoice(field: string, onSaid: (words: string) => void) {
  const offered = useCanListen();
  const listening = useVoiceInput((s) => s.field === field);
  const words = useVoiceInput((s) => (s.field === field ? s.words : ""));
  const error = useVoiceInput((s) => (s.error?.field === field ? s.error.text : null));
  useEffect(() => {
    // Fetched ahead; a failure here is said only if the mic is tapped.
    if (offered) load().catch(() => {});
  }, [offered]);
  const press = () => {
    if (listening) {
      voice?.stopVoice();
      return;
    }
    const hear = (m: typeof import("./voiceInput")) =>
      void m.hearVoice(field).then((said) => {
        if (said) onSaid(said);
      });
    if (voice) hear(voice);
    else load().then(hear, () => unloaded(field));
  };
  return {
    offered,
    listening,
    words,
    error,
    /** The field's placeholder while it listens and nothing is said yet. */
    prompt: "Speak your question",
    press,
  };
}
