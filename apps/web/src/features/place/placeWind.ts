import { windLine } from "../plan";

/** A report's wind as the airport card writes it everywhere in it: the
 *  app's one wind (features/plan/format's windText), true as a METAR's
 *  is and marked so -- "250°T 3 kt", "VRB 4 kt", "240°T 12G20 kt",
 *  "Calm", "Not reported" -- so it is never read against a runway's
 *  magnetic number by mistake. */
export const placeWind = windLine;
