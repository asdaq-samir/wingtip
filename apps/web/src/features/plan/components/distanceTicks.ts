// The past flight's chart's distance marks (PastFlightChart), apart from
// the chart, so they are tested without drawing it.

/** The distance's marks at one round step -- 1, 2, 2.5 or 5 of a power of
 *  ten -- five at most, inside the run and none at its end. Recharts' own
 *  put its round ones and the run's end together, the one before the end
 *  dropped where they met: 350, 700, then 1270 under a 1270 nm run (the
 *  owner's screenshot, 2026-11-06). */
export function distanceTicks(from: number, to: number): number[] {
  const span = to - from;
  if (!(span > 0)) return [];
  const power = 10 ** Math.floor(Math.log10(span / 5));
  const step = [1, 2, 2.5, 5, 10].map(m => m * power).find(s => Math.floor(span / s) <= 5) ?? 10 * power;
  const ticks: number[] = [];
  // Each mark a whole number of steps from zero, not a running sum, so a
  // step like 0.25 gathers no float error.
  for (let i = Math.ceil(from / step); i * step < to - step / 4; i++) if (i * step > from) ticks.push(Number((i * step).toPrecision(12)));
  return ticks;
}
