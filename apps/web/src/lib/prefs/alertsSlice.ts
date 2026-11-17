import type { Slice } from "./slice";
import type { AlertsSlice } from "./alertsTypes";

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
