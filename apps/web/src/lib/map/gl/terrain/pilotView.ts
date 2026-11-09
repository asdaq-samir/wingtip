import { create } from "zustand";

/**
 * Whether the dry run is seen from the pilot's seat (PilotCamera) rather
 * than the chart from above: turned on and off from the dry run's own
 * controls (DryRunControls), off as they go. Its own small store, so the
 * dry run's controls carry none of the 3D code, which loads only once it
 * is asked for (useTerrainView, TerrainGl).
 */
export const usePilotView = create<{ on: boolean }>(() => ({ on: false }));

export function setPilotView(on: boolean) {
  usePilotView.setState({ on });
}
