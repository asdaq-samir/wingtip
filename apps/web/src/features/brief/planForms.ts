import { isAirwayToken } from "../../lib/identSchema";
import { shortName } from "../../lib/aircraftChoice";
import type { AircraftChoice, Course, Leg, NavLogAltitude, Totals } from "../../lib/api/types";
import type { useLoad } from "../plan";
import { flightPlanForms, type FiledProcedure } from "./flightPlanForm";
import type { useOwnAircraft } from "./useOwnAircraft";

interface PlanFormsInputs {
  ifr: boolean;
  dep: string;
  dest: string;
  route: string[];
  stops: string[];
  course: Course | null;
  legs: Leg[];
  totals: Totals | null;
  depart: string;
  opened: string;
  flying: Pick<AircraftChoice, "aircraftId" | "label">;
  nav: NavLogAltitude | null;
  own: ReturnType<typeof useOwnAircraft>;
  load: ReturnType<typeof useLoad>["load"];
  icaoIds: Parameters<typeof flightPlanForms>[0]["icaoIds"];
  procedures: { departure: FiledProcedure | null; arrival: FiledProcedure | null } | undefined;
}

/** The flight plan's forms (item by item), as Preflight shows them. */
export function planFormsOf({
  ifr,
  dep,
  dest,
  route,
  stops,
  course,
  legs,
  totals,
  depart,
  opened,
  flying,
  nav,
  own,
  load,
  icaoIds,
  procedures,
}: PlanFormsInputs) {
  const { pilot, flownOwn } = own;
  // The flight plan's airplane: the pilot's own by its registration and
  // the type designator they gave it, or a stock profile's type; item 9's
  // wake category from the profile's maximum takeoff weight only where
  // the profile is that type's. Only for Preflight, which shows the forms.
  const ownType = flying.aircraftId != null ? (flying.label.split(" · ")[1] ?? null) : null;
  const profileType = nav?.aircraft?.designator ?? null;
  const planType = flying.aircraftId != null ? ownType : profileType;
  return flightPlanForms({
    rules: ifr ? "ifr" : "vfr",
    dep,
    dest,
    route,
    landings: stops,
    isAirway: (stop) => isAirwayToken(stop) && !course?.stops?.some((s) => s.ident === stop),
    legs,
    totals,
    depart: depart ? new Date(depart) : null,
    now: new Date(opened),
    aircraft: {
      ident: flying.aircraftId != null ? shortName(flying.label) : null,
      type: planType,
      maxTakeoffLb: planType && planType === profileType ? (nav?.aircraft?.loading?.max_takeoff_lb ?? null) : null,
      // Items 10 and 19's colour, from the pilot's own airplane's page.
      equipment: flownOwn?.equipment ?? null,
      surveillance: flownOwn?.surveillance ?? null,
      colour: flownOwn?.colour ?? null,
      // Item 19's endurance where no leg is flown at cruise.
      cruiseBurnGph: nav?.aircraft?.fuel_burn_gph ?? null,
    },
    // Item 19's pilot in command, from their own page (Pilot details, in Setup).
    pilot: pilot ? { name: pilot.fullName ?? null, phone: pilot.phone ?? null, homeBase: pilot.homeBase ?? null } : null,
    fuelGal: load?.fuelGal ?? null,
    alternate: totals?.alternate?.ident ?? null,
    icaoIds,
    departureProcedure: procedures?.departure,
    arrivalProcedure: procedures?.arrival,
  });
}
