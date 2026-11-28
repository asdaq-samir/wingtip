import { callEngine } from "../../lib/engine/engine";
import { z } from "./formSchema";

/** The airplane form's own: its fields and their checks, apart from the
 *  panels that draw it (AccountPanels, SpeedAndBurnGroups). */
const AIRCRAFT_FIELDS = [
  "tailNumber",
  "typeDesignator",
  "cruiseTasKt",
  "fuelBurnGph",
  "cruisePowerPct",
  "climbTasKt",
  "climbFuelBurnGph",
  "descentIasKt",
  "descentFuelBurnGph",
  "usableFuelGal",
  "equipment",
  "surveillance",
  "colour",
] as const;
/** Its category, class and gear (14 CFR 61.5(b), 61.57(a)(1)(ii)): menus,
 *  "" where not said; none of the engine's aircraft_problems. */
const KIND_FIELDS = ["category", "aircraftClass", "gear"] as const;

// The fields stay strings through validation (what a plain <input> holds),
// each checked by the engine's aircraft_problems -- the gateway's own
// AircraftRequest limits, the same on every app -- so a bad value is caught
// before the round trip, its words under its field. The numbers are made
// once, building the request body in onSubmit below.
export const aircraftSchema = z
  .object(
    Object.fromEntries([...AIRCRAFT_FIELDS, ...KIND_FIELDS].map((f) => [f, z.string()])) as Record<
      (typeof AIRCRAFT_FIELDS)[number] | (typeof KIND_FIELDS)[number],
      z.ZodString
    >,
  )
  .superRefine((form, ctx) => {
    const problems = callEngine("aircraft_problems", Object.fromEntries(AIRCRAFT_FIELDS.map((f) => [f, form[f]])));
    for (const field of AIRCRAFT_FIELDS) {
      const message = problems[field];
      if (message) ctx.addIssue({ code: "custom", path: [field], message });
    }
  });
export type AircraftFormValues = z.infer<typeof aircraftSchema>;
export const EMPTY_AIRCRAFT_FORM: AircraftFormValues = {
  tailNumber: "",
  typeDesignator: "",
  cruiseTasKt: "",
  fuelBurnGph: "",
  cruisePowerPct: "",
  climbTasKt: "",
  climbFuelBurnGph: "",
  descentIasKt: "",
  descentFuelBurnGph: "",
  usableFuelGal: "",
  equipment: "",
  surveillance: "",
  colour: "",
  category: "",
  aircraftClass: "",
  gear: "",
};
