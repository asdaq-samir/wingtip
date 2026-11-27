import { useEffect, useState } from "react";
import { chartBrightness } from "../chartLook";
import { mapDimOf } from "./mapDim";

/** How long the Dimmer stands still before what is drawn on the chart
 *  follows it: a drag's steps come some 16 ms apart, its pauses longer. */
const SETTLE_MS = 120;

/**
 * The share of light what is drawn on the chart takes at night (mapDimOf),
 * from the Dimmer once it has stood still: the chart's own raster follows
 * the slider at every step (ChartSources' paint), the marks, lines and
 * words a moment after, as a slider's committed value. Each change of the
 * global state goes over every layer reading it and out to MapLibre's
 * workers, at each of a drag's thirty-odd steps. A change of the theme or
 * of sunlight is taken at once, the Dimmer's value with it: the night's
 * marks are never drawn at the day's light for a moment.
 */
export function useSettledMapDim(night: boolean, sunlight: boolean, dim: number): number {
  const [settled, setSettled] = useState({ night, sunlight, dim });
  const same = settled.night === night && settled.sunlight === sunlight;
  useEffect(() => {
    if (same && settled.dim === dim) return;
    const id = setTimeout(() => setSettled({ night, sunlight, dim }), same ? SETTLE_MS : 0);
    return () => clearTimeout(id);
  }, [same, settled.dim, night, sunlight, dim]);
  return mapDimOf(night, chartBrightness(same ? settled.dim : dim, sunlight, night));
}
