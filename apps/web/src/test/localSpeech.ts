/**
 * A stand-in for a browser recognizer that can keep speech on the device,
 * as Chrome's answers (lib/speechLocal): `available` says "available" for
 * English processed locally, `install` succeeds, and each recognizer has
 * the `processLocally` switch. Tests extend it for their recognizers; one
 * without it is a browser that cannot promise the device (Safari,
 * Firefox), where voice is not offered.
 */
import { checkSpeech, forgetSpeechCheck } from "../lib/speechLocal";

export class LocalSpeech {
  static available = async () => "available";
  static install = async () => true;
  processLocally = false;
}

/** The browser asked afresh, as a page load would, once a test has put its
 *  recognizer in place: the screens then show (or hide) their microphones
 *  on the first render. */
export async function speechAnswered() {
  forgetSpeechCheck();
  await checkSpeech();
}
