/** The gauge's gallons as it writes them: past empty the gallons short,
 *  with a minus (the engine's fuel_in_tanks; the owner, 2026-11-20:
 *  "Instead of showing 0 gal, can you show negative gal"), rounded the
 *  same way down, so never fewer short than there are. */
export function gaugeWords(gal: number): string {
  const whole = Math.floor(gal);
  return `${whole < 0 ? "\u2212" : ""}${Math.abs(whole)} gal`;
}
