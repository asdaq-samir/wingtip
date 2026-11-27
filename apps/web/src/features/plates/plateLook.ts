import { useCallback } from "react";
import { create } from "zustand";
import type { ProcedureDrawing } from "../../lib/api/types";
import { persist } from "zustand/middleware";
import { usePreferences } from "../../lib/preferences";
import { useDarkTheme } from "../../lib/map/gl/useDarkTheme";
import { CHART_LOOK } from "../../lib/tokens";

/** A d-TPP approach page's shape as the planner draws it: its room in
 *  the card beside the map before the page comes, so nothing moves. */
export const PLATE_SHAPE = "387 / 594";

/** How solid a plate's page is at first: enough to read the plate, the
 *  chart still faintly under it, as ForeFlight opens one on the map
 *  (design/tokens.json's chart-look, the phones' PlateLook's figure too). */
export const PLATE_OPACITY = CHART_LOOK.plateOpacity;
/** Never wholly clear: a page at nought would still take the map's taps
 *  with nothing on the screen to show for it. */
export const LEAST_PLATE_OPACITY = CHART_LOOK.plateLeastOpacity;

interface PlateLook {
  /** The page's opacity, clear (LEAST_PLATE_OPACITY) to solid (1). */
  opacity: number;
  /** White on black: the pilot's own choice, or null to follow the
   *  app's appearance (dark at night). */
  inverted: boolean | null;
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
      inverted: null,
      annotations: true,
      setOpacity: (opacity) => set({ opacity: Math.min(1, Math.max(LEAST_PLATE_OPACITY, opacity)) }),
      setInverted: (inverted) => set({ inverted }),
      setAnnotations: (annotations) => set({ annotations }),
    }),
    {
      name: "wingtip.plateLook",
      // Version 2: a plate follows the appearance until the pilot picks.
      // Version 1 kept "false" for every pilot who never touched the switch,
      // which drew a white plate on the night's dark map; that kept false is
      // read as no choice (the themes audit, 2026-11-27).
      version: 2,
      migrate: migratePlateLook,
      partialize: (s) => ({ opacity: s.opacity, inverted: s.inverted, annotations: s.annotations }),
    },
  ),
);

type KeptPlateLook = Pick<PlateLook, "opacity" | "inverted" | "annotations">;

/** A kept plate look read after an update (persist's migrate): before
 *  version 2 a kept "false" is read as no choice, so the plate follows
 *  the appearance (usePlateInverted). */
export function migratePlateLook(kept: unknown, version: number): KeptPlateLook {
  const was = { opacity: PLATE_OPACITY, inverted: null, annotations: true, ...(kept as Partial<KeptPlateLook> | null) };
  return version < 2 && was.inverted === false ? { ...was, inverted: null } : was;
}

/** Whether a plate is drawn white on black: the pilot's own choice, else
 *  the app's dark appearance, as the reader's pages are (useReader), so a
 *  plate at night is never a white page on the dark map, which would undo
 *  the pilot's dark adaptation (AIM 8-1-6, Vision in Flight). */
export function usePlateInverted(): boolean {
  const chosen = usePlateLook((s) => s.inverted);
  const dark = useDarkTheme();
  return chosen ?? dark;
}

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

/** Whether an approach's fixes wear its plate's tags (PlateTagsGl): its
 *  plate on the map (Approach Plates on, the plate not hidden) with Show
 *  Annotations. Its procedure's own tags then say only the pilot's own
 *  lines (ProceduresGl), so a fix is tagged once (the owner's pick,
 *  2026-11-18: the plate's tag wins where a plate is drawn). */
export function usePlateTagged(): (drawing: Pick<ProcedureDrawing, "airport" | "id" | "kind">) => boolean {
  const shown = usePreferences((s) => s.plates);
  const hidden = useHiddenPlates((s) => s.keys);
  const annotations = usePlateLook((s) => s.annotations);
  return useCallback(
    (d) => d.kind === "approach" && shown && annotations && !hidden.includes(plateKey(d.airport, d.id)),
    [shown, annotations, hidden],
  );
}
