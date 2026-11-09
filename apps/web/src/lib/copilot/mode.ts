import { usePreferences } from "../preferences";
import { copilotVoice } from "./voice";

/** The in-flight copilot as one choice, as the alerts are (lib/alertMode):
 *  off, its message shown, or shown and said aloud. */
export type CopilotMode = "off" | "on" | "spoken";

export const COPILOT_MODES: { value: CopilotMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "on", label: "On" },
  { value: "spoken", label: "Spoken" },
];

export function useCopilotMode(): [CopilotMode, (mode: CopilotMode) => void] {
  const mode = usePreferences(s => s.copilotMode);
  const set = (next: CopilotMode) => {
    usePreferences.getState().setCopilotMode(next);
    // Said once as it is turned on, from the tap, which on an iPhone is
    // what lets the page speak at all later in the flight.
    if (next === "spoken" && mode !== "spoken") copilotVoice().say("The copilot will speak.");
  };
  return [mode, set];
}
