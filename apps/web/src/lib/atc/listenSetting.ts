import { keptStore } from "../storage";

/**
 * Whether the ATC copilot listens to the radio on its own while flying
 * (features/atc): off unless the pilot turns it on, from Settings' ATC
 * page (ATC Alerts) beside the copilot. Kept on this device; it hears through
 * the input lib/audioInput holds, an audio panel's Bluetooth recording
 * mode or a cable (the owner, 2026-11-04: "Bluetooth is fine").
 */
export type AtcListen = "off" | "flying";

export const ATC_LISTEN_MODES: { value: AtcListen; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "flying", label: "While Flying" },
];

export const useAtcListen = keptStore<AtcListen>("wingtip.atcListen", "off");

export function setAtcListen(value: AtcListen) {
  useAtcListen.setState({ value });
}
