import { say, speak } from "../speech";

/** How the copilot speaks: one line said, and the line before cut off,
 *  through the browser's Web Speech API (lib/speech). */
interface CopilotVoice {
  /** Says a line after whatever is being said. */
  say: (words: string) => void;
  /** Says a line in place of whatever is being said: a warning does not
   *  wait behind a caution. */
  interrupt: (words: string) => void;
}

const browserVoice: CopilotVoice = { say, interrupt: speak };

export function copilotVoice(): CopilotVoice {
  return browserVoice;
}
