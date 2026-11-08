import { callEngine } from "./engine/engine";

/** The altitude an airplane's cruise TAS and fuel burn are taken as its
 *  own at, at its cruise power on a standard day -- the engine's
 *  (wingtip_flight::performance REFERENCE_ALTITUDE_FT, 6,000 ft), which
 *  works each leg's out from there for the forecast air at its altitude.
 *  Said to the pilot wherever the figures are asked for or flown: the
 *  aircraft form, the altitude's reasoning and the guide. */
export function cruiseReferenceFt(): number {
  return callEngine("performance_reference_ft", {});
}
