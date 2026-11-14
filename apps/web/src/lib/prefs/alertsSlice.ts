import type { AircraftAlert, AircraftAlertKind } from "../aircraftAlerts";
import type { Slice } from "./slice";

/** What is said to the pilot in the air, and what is listened through. */
export interface AlertsSlice {
  /** Whether what is ahead of own ship in the air is said over the map
   *  (lib/map/position/ahead): airspace, special-use areas and TFRs the
   *  track goes into, and the ground or an obstacle it comes near. On by default. */
  alerts: boolean;
  /** Whether those alerts are said aloud as each comes ahead
   *  (components/speak). Off by default: a phone that starts talking
   *  unasked is a surprise; turned on, it says so. */
  speakAlerts: boolean;
  /** The in-flight copilot (features/copilot): off, its one message shown,
   *  or shown and said aloud. Shown by default, said only when asked. */
  copilotMode: "off" | "on" | "spoken";
  /** What the pilot asked to be told of airplanes, from a card's Alert
   *  (lib/aircraftAlerts): each kept until it goes off or is turned off,
   *  so a reload or a phone put away and taken out again keeps watching. */
  aircraftAlerts: AircraftAlert[];
  /** The input last chosen to listen through (lib/audioInput, the Radio
   *  card's Listen through), by the browser's id for it and its name --
   *  matched by the id first and then the name, as a private window gives
   *  a device another id. A convenience: lost, the next listening hears
   *  the phone's microphone as before. */
  listenInput: { id: string; label: string } | null;
  setAlerts: (alerts: boolean) => void;
  setSpeakAlerts: (speakAlerts: boolean) => void;
  setCopilotMode: (copilotMode: "off" | "on" | "spoken") => void;
  /** One set, in place of any of its kind for the same airplane. */
  setAircraftAlert: (alert: AircraftAlert) => void;
  removeAircraftAlert: (hex: string, kind: AircraftAlertKind) => void;
}

export const ALERTS_KEPT = ["alerts", "speakAlerts", "copilotMode", "aircraftAlerts", "listenInput"] as const;

export const alertsSlice: Slice<AlertsSlice> = (set) => ({
  alerts: true,
  speakAlerts: false,
  copilotMode: "on",
  aircraftAlerts: [],
  listenInput: null,
  setAlerts: (alerts) => set({ alerts }),
  setSpeakAlerts: (speakAlerts) => set({ speakAlerts }),
  setCopilotMode: (copilotMode) => set({ copilotMode }),
  setAircraftAlert: (alert) =>
    set((s) => ({ aircraftAlerts: [...s.aircraftAlerts.filter((a) => !(a.hex === alert.hex && a.kind === alert.kind)), alert] })),
  removeAircraftAlert: (hex, kind) => set((s) => ({ aircraftAlerts: s.aircraftAlerts.filter((a) => !(a.hex === hex && a.kind === kind)) })),
});
