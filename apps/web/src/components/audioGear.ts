/**
 * Audio panels, headsets and cables, and whether each can bring the
 * airplane's radio to the phone. A phone has no airband receiver, so the
 * radio reaches it only as a microphone. That means the audio panel or
 * headset sending audio over Bluetooth, or a cable. Over Bluetooth an
 * iPhone takes audio in only on the hands-free profile (HFP): Apple calls
 * A2DP "a stereo, output-only profile" and allowBluetoothHFP the option
 * that "makes Bluetooth Hands-Free Profile (HFP) devices available for
 * audio input" (AVFAudio, AVAudioSession.CategoryOptions). So a panel or
 * headset has to put the radio on what it treats as its microphone.
 *
 * Most don't. In a phone call a panel sends the intercom's microphones,
 * and a headset sends its boom mic. A few panels have a recording mode
 * that sends everything the pilot hears. Every entry here comes from its
 * maker's own manual, read on 2026-11-04 and listed in its `sources`.
 * Where a maker documents the audio only to a camera, or not at all, the
 * entry says so ("radio-maybe", confidence "test"). It never guesses that
 * the radio comes in.
 *
 * The Radio card names the live input from its MediaStreamTrack label, so
 * each entry carries patterns for that label: the Bluetooth name its maker
 * documents, and its model as written. In Safari the label is the iOS
 * audio port's name, which is the device's Bluetooth name, and the phone's
 * own microphone is "iPhone Microphone" (WebKit's
 * AVAudioSessionCaptureDevice; Media Capture's label rules). Garmin
 * documents a Bluetooth name only for the GMA 35c (a GTN figure shows
 * "GMA Bluetooth"), so its other panels are recognised by model number
 * only.
 *
 * The catalogue is data, audioGear.json, checked against the schema below
 * as it loads; this file is the schema and the matcher. Each entry's `note`
 * is why it says what it says, and its steps and sources are written out in
 * full. The steps' common wording rests on these:
 *
 * - Airplane mode: 47 CFR 22.925, cellular telephones aboard an aircraft
 *   "must not be operated while such aircraft are airborne" and must be
 *   turned off when it leaves the ground. Airplane mode does that and keeps
 *   Bluetooth; a phone on a cable needs no Bluetooth.
 * - Other Bluetooth audio off: iOS routes to the separate Bluetooth device
 *   that connected last ("last in wins", Apple's
 *   AVAudioSessionCategoryOptions header).
 * - No phone call: a panel's call carries the intercom's microphones, not
 *   the radio. Garmin's GMA 350c guide has the headset mics "speak on the
 *   call" (p.36); PS Engineering's PAR200B and PMA8000BT guides and
 *   Avidyne's AMX240 manual (§3.5, "The telephone party does not hear ATC")
 *   say the phone doesn't hear ATC. For the GMA 345, 245, 35c and 1360 and
 *   the PMA450s, whose manuals don't say what a call carries, it follows
 *   from these. Garmin documents a call carrying the headset mics (350c
 *   p.36, 350Hc p.38) and only Recording Mode sending the radio (350c p.38,
 *   350Hc p.40).
 * - Recording Mode: the same keys turn it off again, so the step checks
 *   PILOT first (350c p.38, 350Hc p.40). On the GMA 345 and 245, held, TEL
 *   (PAIR) pairs and disconnects the device connected and PILOT toggles 3D
 *   audio, so the step presses them "momentarily" (345 PG p.29, 245 PG
 *   p.25); they hold one Bluetooth connection at a time, and the wired
 *   music inputs still play (345 PG pp.25, 29; 245 PG pp.15, 25).
 * - Cables: the NFlightCam USB-C cable is "Compatible with standard
 *   twin-plug headsets" and "Designed specifically for fixed-wing
 *   aircraft" (Sporty's 7718), so a headset with a 6-pin (Lemo or Redel) or
 *   XLR panel-power plug needs a recording cable made for that plug.
 */

import { z } from "zod";
import catalogue from "./audioGear.json";

/** What reaches the phone from it: the radio; only voices (a headset's
 *  boom mic, or the intercom's mics in a panel's phone mode); maybe the
 *  radio (documented only to a camera or a maker's own app, or untested
 *  with a phone); nothing, as it has no Bluetooth audio for a phone. */
const gives = z.enum(["radio", "voice", "radio-maybe", "none"]);

const gearSchema = z.object({
  id: z.string().min(1),
  maker: z.string(),
  model: z.string(),
  kind: z.enum(["panel", "headset", "cable"]),
  /** The name its maker says it shows in the phone's Bluetooth list, "#"
   *  standing for a digit of its serial number. Null where the maker
   *  doesn't say, or where it has no Bluetooth. */
  shows: z.string().nullable(),
  /** Recognise it in an input's label, case-insensitive: patterns, made
   *  into regular expressions as the catalogue loads. Empty for what never
   *  shows as a Bluetooth input: a panel without Bluetooth, or a cable,
   *  which shows as the phone's own wired or USB port. */
  names: z.array(z.string().transform((pattern) => new RegExp(pattern, "i"))),
  gives,
  /** Short plain sentences a pilot follows, on the ground first. */
  steps: z.array(z.string()),
  /** The one line the Radio card shows while this is the live input. */
  says: z.string(),
  /** How sure the entry is: the maker's own documents say it; it follows
   *  from a maker's sibling model or a retailer; or only a ground test can
   *  tell. */
  confidence: z.enum(["documented", "likely", "test"]),
  /** Where each statement comes from: URL, document and page, when read. */
  sources: z.array(z.string()),
  /** Why the entry says what it says, in the words of the notes it was
   *  written with. */
  note: z.string(),
});

type Gear = z.output<typeof gearSchema>;

/** What the app is hearing through the live input. */
type Hearing = "radio" | "voice" | "phone-mic" | "unknown";

/** The catalogue, in the order labels are matched: where two entries could
 *  take one label, the narrower comes first ("Delta Zulu" before "Zulu 3"). */
export const GEAR: readonly Gear[] = z.array(gearSchema).parse(catalogue);

/** A label as the browser gives it, without Chrome's "Default - " and
 *  Windows' "Communications - " in front of the system's choice. */
const bare = (label: string) => label.replace(/^(Default|Communications)\s*-\s*/i, "").trim();

/** The gear an input's label names, or null. */
export function gearFor(label: string | null | undefined): Gear | null {
  const name = bare(label ?? "");
  if (!name) return null;
  return GEAR.find((g) => g.names.some((re) => re.test(name))) ?? null;
}

/** The phone's or computer's own microphone by its label: Safari's
 *  "iPhone Microphone" and "MacBook Pro Microphone", Chrome's "(Built-in)"
 *  and its Android names for the phone's mics ("Speakerphone", "Headset
 *  earpiece", Chromium's CommunicationDeviceSelector), and a Windows
 *  laptop's "Microphone Array". As lib/audioInput tells its own from an
 *  outside input. */
const BUILT_IN = [
  /^default$/i,
  /\b(iPhone|iPad|iPod)\b.*\bMicrophone\b/i,
  /\(Built-in\)/i,
  /^(MacBook( Air| Pro)?|iMac|Mac( mini| Studio| Pro)?|Studio Display|Built-in|Internal) Microphone\b/i,
  /^Microphone Array\b/i,
  /^(Speakerphone|Headset earpiece)$/i,
];

/** What the app is hearing through the live input, by its label. It says
 *  the radio only for gear whose maker documents the radio reaching a
 *  phone; anything it can't name, or that may or may not send the radio,
 *  is unknown. With no label it is the phone's microphone: a capture that
 *  names no input mostly lands on "iPhone Microphone" even with a headset
 *  connected (WebKit bug 282939), and lib/audioInput counts a blank name
 *  as the device's own. */
export function hearing(label: string | null | undefined): Hearing {
  const name = bare(label ?? "");
  if (!name || BUILT_IN.some((re) => re.test(name))) return "phone-mic";
  const gives = gearFor(name)?.gives;
  if (gives === "radio") return "radio";
  if (gives === "voice") return "voice";
  return "unknown";
}
