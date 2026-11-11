/**
 * The browser's permissions the app asks for, each said plainly before
 * the browser's own question (the ATC copilot's
 * microphone): whether the question is still to come, and asking it.
 */

/** "prompt" while the browser has its question still to ask; "unknown"
 *  where it will not say (Safari before 16 for the microphone). */
type Asked = "granted" | "denied" | "prompt" | "unknown";

export async function permissionState(name: "geolocation" | "microphone"): Promise<Asked> {
  try {
    const status = await navigator.permissions?.query({ name: name as PermissionName });
    return status?.state ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** The microphone asked for now, from the pilot's tap, and let go at once:
 *  the copilot opens its own input when it listens (lib/audioInput). */
export async function askMicrophone(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}
