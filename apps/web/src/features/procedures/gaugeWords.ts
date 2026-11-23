/** The gauge's gallons as it writes them: past empty the gallons short,
 *  "31 gal short" (the engine's fuel_in_tanks, below nought), in the
 *  short's red where the gauge draws it. It was "−31 gal" (the owner,
 *  2026-11-20: "Instead of showing 0 gal, can you show negative gal"),
 *  which read as a figure gone wrong at a destination a leg could not
 *  reach (the owner's iPhone, 2026-11-23: KORD at "−31 gal"). Rounded the
 *  same way down, so never fewer short than there are. */
export function gaugeWords(gal: number): string {
  const whole = Math.floor(gal);
  return whole < 0 ? `${-whole} gal short` : `${whole} gal`;
}
