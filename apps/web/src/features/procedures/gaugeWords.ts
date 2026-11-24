/** The gauge's gallons as it writes them: past empty the gallons short
 *  with a minus, "−31 gal" (the engine's fuel_in_tanks, below nought), in
 *  the short's red where the gauge draws it (the owner, 2026-11-24:
 *  "Instead of saying gal short, just put - and the number"). Rounded the
 *  same way down, so never fewer short than there are. */
export function gaugeWords(gal: number): string {
  const whole = Math.floor(gal);
  return whole < 0 ? `−${-whole} gal` : `${whole} gal`;
}
