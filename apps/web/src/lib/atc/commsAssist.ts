import { keptStore } from "../storage";

/**
 * Whether Comms assist's radio button is on the map (and so the radio
 * can be listened to from it or from a shortcut): off unless turned on,
 * from Settings' ATC page (the owner, 2026-11-13: "make it a
 * setting instead"). Kept on this device, as the copilot's own switch is
 * (listenSetting). Its own store: lib/preferences is at its size.
 */
export const useCommsAssist = keptStore<boolean>("wingtip.commsAssist", false);

export function setCommsAssist(value: boolean) {
  useCommsAssist.setState({ value });
}
