import { create } from "zustand";

/**
 * What the emergency assistant draws on the map, set by its screen
 * (features/emergency/useEmergency) and drawn by EmergencyGl: the glide's
 * reach all round, wind corrected (the engine's best_fields ring), and a
 * line from own ship to the field picked. Null when the screen is shut.
 */
interface EmergencyDrawing {
  from: { lat: number; lon: number };
  to: { lat: number; lon: number; ident: string } | null;
  /** [lat, lon] every 10°, or none where no glide was worked out. */
  ring: number[][] | null;
}

export const useEmergencyLine = create<{ drawing: EmergencyDrawing | null }>(() => ({ drawing: null }));
