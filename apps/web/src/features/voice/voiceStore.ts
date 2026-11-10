import { create } from "zustand";

/** Ask by voice's state (voiceInput), apart from the radio's store
 *  (lib/atcRadio), in the first load so the mic draws without the
 *  listening code. */
interface VoiceInput {
  /** Which field is being spoken into ("search", "ask"), or null. */
  field: string | null;
  /** The words so far, for the field to show as they are said. */
  words: string;
  /** Why nothing could be heard, in a pilot's words, and for which
   *  field; cleared as it next listens. */
  error: { field: string; text: string } | null;
}

export const useVoiceInput = create<VoiceInput>(() => ({ field: null, words: "", error: null }));
