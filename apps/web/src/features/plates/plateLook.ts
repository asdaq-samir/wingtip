import { create } from "zustand";
import { persist } from "zustand/middleware";
import { usePreferences } from "../../lib/preferences";

/** How solid a plate's page is at first: enough to read the plate, the
 *  chart still faintly under it, as ForeFlight opens one on the map
 *  (the iPhone's and Android's PlateLook, the same figure). */
export const PLATE_OPACITY = 0.85;
/** Never wholly clear: a page at nought would still take the map's taps
 *  with nothing on the screen to show for it. */
export const LEAST_PLATE_OPACITY = 0.1;

interface PlateLook {
  /** The page's opacity, clear (LEAST_PLATE_OPACITY) to solid (1). */
  opacity: number;
  /** White on black, for the night. */
  inverted: boolean;
  /** The tags on the approach's fixes and its final segment marked. */
  annotations: boolean;
  setOpacity: (opacity: number) => void;
  setInverted: (inverted: boolean) => void;
  setAnnotations: (annotations: boolean) => void;
}

/**
 * How the plates on the map are drawn, from the plate's card (ForeFlight's
 * plate settings, the owner's screenshot, 2026-11-11): kept on this
 * device, as the map's other settings are, in a store of its own beside
 * lib/preferences (which is at its file's size allowance).
 */
export const usePlateLook = create<PlateLook>()(
  persist(
    (set) => ({
      opacity: PLATE_OPACITY,
      inverted: false,
      annotations: true,
      setOpacity: (opacity) => set({ opacity: Math.min(1, Math.max(LEAST_PLATE_OPACITY, opacity)) }),
      setInverted: (inverted) => set({ inverted }),
      setAnnotations: (annotations) => set({ annotations }),
    }),
    {
      name: "wingtip.plateLook",
      version: 1,
      partialize: (s) => ({ opacity: s.opacity, inverted: s.inverted, annotations: s.annotations }),
    },
  ),
);

/** A plate's key, its field and its procedure: "KOSH:I36". */
export const plateKey = (airport: string, id: string) => `${airport}:${id}`;

interface HiddenPlates {
  keys: string[];
  hide: (key: string) => void;
  /** The approaches on the route now against those before: a plate whose
   *  approach was not there before (picked again) comes back. */
  picked: (now: string[], before: string[]) => void;
}

/**
 * The plates taken off the map from their card (Hide Plate), by their key:
 * the procedure stays on the route. Held for the visit, not kept: a hidden
 * plate comes back when its approach is picked again or when the Map
 * menu's Approach Plates is turned on (the spec, 2026-11-11), as on the
 * iPhone (HiddenPlates).
 */
export const useHiddenPlates = create<HiddenPlates>()((set) => ({
  keys: [],
  hide: (key) => set((s) => (s.keys.includes(key) ? s : { keys: [...s.keys, key] })),
  picked: (now, before) =>
    set((s) => {
      const fresh = now.filter((k) => !before.includes(k));
      return fresh.some((k) => s.keys.includes(k)) ? { keys: s.keys.filter((k) => !fresh.includes(k)) } : s;
    }),
}));

// The Map menu's Approach Plates turned on brings every hidden plate back.
usePreferences.subscribe((s, before) => {
  if (s.plates && !before.plates) useHiddenPlates.setState({ keys: [] });
});
