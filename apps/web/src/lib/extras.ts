import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { usePreferences } from "./preferences";
import { browserStorage, keptAsIs } from "./storage";

/**
 * The parked features' switches, Settings' Extras group (the feature
 * review, docs/store/feature-review.md, taken by the owner 2026-11-21): a
 * feature parked stays in the code, its tests running, but is off until
 * its switch here is on, and out of the store listing. Off, it is not
 * offered, not fetched and not drawn, and a setting inside it saved "on"
 * before (Comms Assist, ATC alerts, a model weather field, 3D) acts as off
 * until the switch is on again. Kept on this device, as the inner settings
 * are.
 */
type Extra = "atcCopilot" | "modelWeather" | "threeD" | "trainingTools";

/** Each switch's row in Settings' Extras, in the order shown. */
export const EXTRAS: { key: Extra; title: string; description: string }[] = [
  { key: "atcCopilot", title: "ATC Copilot", description: "Comms Assist, ATC alerts and the clearance readback check" },
  { key: "modelWeather", title: "Model Weather", description: "Wind and weather fields on the map's Weather menu" },
  { key: "threeD", title: "3D", description: "The map's 3D button: terrain and airspace stood up" },
  { key: "trainingTools", title: "Training Tools", description: "Flash cards, holding entries and lost comms practice" },
];

type Extras = Record<Extra, boolean> & { set: (key: Extra, on: boolean) => void };

const ALL_OFF: Record<Extra, boolean> = { atcCopilot: false, modelWeather: false, threeD: false, trainingTools: false };

export const useExtras = create<Extras>()(
  persist((set) => ({ ...ALL_OFF, set: (key, on) => set({ [key]: on } as Partial<Extras>) }), {
    name: "wingtip.extras",
    storage: createJSONStorage(() => browserStorage),
    version: 0,
    migrate: keptAsIs,
    partialize: (s) => Object.fromEntries((Object.keys(ALL_OFF) as Extra[]).map((k) => [k, s[k]])) as Record<Extra, boolean>,
  }),
);

/** Whether a parked feature's switch is on. */
export const useExtra = (key: Extra): boolean => useExtras((s) => s[key]);

/** The map stood up in 3D as the app reads it: the pilot's 3D button
 *  (lib/preferences' threeD), flat while 3D is parked, whatever was saved. */
export function useThreeD(): boolean {
  const parked = !useExtra("threeD");
  const on = usePreferences((s) => s.threeD);
  return on && !parked;
}
