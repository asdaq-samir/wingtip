import { gearFor, hearing } from "../lib/audioGear";

// What the input guide (InputGuide) says of the input heard, apart from
// how it draws it.

/** One input at a time: iOS routes to the Bluetooth device that connected
 *  last ("last in wins", Apple's AVAudioSessionCategoryOptions header), so
 *  a headset paired to the phone takes the input over from the panel. */
export const ONE_AT_A_TIME = "One input at a time: a headset paired to the phone takes the input over from the panel.";

/** What the guide says of the input heard: the radio; maybe the radio,
 *  which only a ground test tells; or a voice with the way to the radio.
 *  Nothing where the catalogue can't tell (lib/audioGear), the phone's own
 *  microphone included. */
export interface Guide {
  hears: "radio" | "maybe" | "voice";
  line: string;
  /** Under a tap: for a voice the way to the radio, for a maybe how to
   *  test it -- the gear's own steps, on the ground first, then the
   *  one-input note where they don't already say it. */
  steps: string[];
  /** The tap's words. */
  how: string | null;
}

const withNote = (steps: readonly string[]) =>
  steps.some(step => /last one to connect|takes the input/i.test(step)) ? [...steps] : [...steps, ONE_AT_A_TIME];

export function guideFor(label: string | null | undefined): Guide | null {
  const hears = hearing(label);
  if (hears === "radio") return { hears, line: "Hears the radio", steps: [], how: null };
  const gear = gearFor(label);
  if (hears === "voice") return { hears, line: "Hears your voice, not the radio", steps: withNote(gear?.steps ?? []), how: "How to hear the radio" };
  // Documented only to a camera or the maker's own app, or not at all
  // (lib/audioGear's "radio-maybe"): never said to hear the radio.
  if (gear?.gives === "radio-maybe") return { hears: "maybe", line: "May hear the radio: test it on the ground", steps: withNote(gear.steps), how: "How to test it" };
  return null;
}
