import type { FlowFrame } from "./useWeatherFlow";

/** A run's hour as a forecaster says it: "12Z". */
const zulu = (iso: string | null | undefined) => (iso ? `${iso.slice(11, 13)}Z` : null);

/**
 * The legend's source line: whose the picture shown is and when its run
 * was made, "AWC winds, 12Z", as the owner asked (2026-11-12) -- the
 * Aviation Weather Center's where it publishes the field, NOAA's model
 * otherwise; "in place of AWC" while AWC's is unavailable and NOAA's
 * stands in; the radar's for an hour past. The time in the caution colour
 * once its run is older than its source's cadence and a margin
 * (wingtip.weather_flow), and the last good copy is what is drawn.
 */
export function sourceLine(frame: FlowFrame | null, file: string, radar: boolean, world: boolean): { text: string; stale: boolean } {
  if (radar) return { text: "Radar, observed", stale: false };
  const source = frame?.sources?.[file];
  if (!source) return { text: "", stale: false };
  const when = zulu(source.issued);
  const name = source.fallback ? `${source.label} in place of AWC` : source.label;
  const text = [name, when].filter(Boolean).join(", ") + (world ? "; NOAA GFS beyond" : "");
  return { text, stale: source.stale };
}
