import { callEngine } from "./engine/engine";

/** The altitude an airplane's cruise TAS and fuel burn are taken as its
 *  own at, at its cruise power on a standard day -- the engine's
 *  (`planning_figures`), from which the planner works each leg's out for
 *  the forecast air at its altitude. Said to the pilot wherever the
 *  figures are asked for or flown: the aircraft form, the altitude's
 *  reasoning and the guide. */
export const cruiseReferenceFt = (): number => callEngine("planning_figures", {}).cruise_reference_ft;
