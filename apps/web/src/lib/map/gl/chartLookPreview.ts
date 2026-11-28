import { create } from "zustand";

/**
 * The Dimmer's and the Contrast's value while a finger moves the slider,
 * in memory alone: the chart's own raster follows it at every step
 * (useChartLook), and nothing else does. The kept preferences, which
 * write the whole store to the device's storage, take the value once, as
 * the slider commits it (Base UI's onValueCommitted: the finger lifted, a
 * key pressed), and with them the marks, lines and words over the chart
 * (ChartGl's MAP_DIM), whose global state goes over every layer reading
 * it and out to MapLibre's workers (localStorage written at each of a drag's thirty-odd
 * steps, and the marks settled by a 120 ms timer).
 * Null while no slider
 * is being moved.
 */
type Preview = { dim: number | null; contrast: number | null };

export const useChartLookPreview = create<Preview>(() => ({ dim: null, contrast: null }));

/** A slider's value as it moves, shown on the chart alone. */
export function previewChartLook(part: Partial<Preview>) {
  useChartLookPreview.setState(part);
}
