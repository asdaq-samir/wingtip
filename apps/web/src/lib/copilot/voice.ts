import { say, speak } from "../speech";

/** How the copilot speaks: one line said, and the line before cut off. On
 *  the web the browser's Web Speech API (lib/speech); a shell with a voice
 *  of its own (a phone's native speech) puts its own in with
 *  `setCopilotVoice`, and the copilot never knows which it has. */
export interface CopilotVoice {
  /** Says a line after whatever is being said. */
  say: (words: string) => void;
  /** Says a line in place of whatever is being said: a warning does not
   *  wait behind a caution. */
  interrupt: (words: string) => void;
}

const browserVoice: CopilotVoice = { say, interrupt: speak };

let current: CopilotVoice = browserVoice;

export function copilotVoice(): CopilotVoice {
  return current;
}

/** Puts another voice in, or the browser's back with null. */
export function setCopilotVoice(voice: CopilotVoice | null) {
  current = voice ?? browserVoice;
}
