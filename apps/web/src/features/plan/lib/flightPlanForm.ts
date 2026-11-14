import type { FlightPlanFilingRequest, Leg, Totals } from "../../../lib/api/types";
import { utcFigures } from "../../../lib/format";
import { callEngine } from "../../../lib/engine/engine";
import { feet } from "../../../lib/format";

/**
 * The FAA's flight plan form filled in from a plan: FAA Form 7233-4, the
 * International Flight Plan, which a domestic IFR flight files and every
 * civil VFR flight plan is filed on (AIM 5-1-5, 5-1-6), each item written
 * as AIM Appendix 4 has it. A route that lands on the way is one form a
 * flight, as AIM 5-1-5 recommends for a stopover and an IFR flight plan
 * is filed, airport to airport.
 *
 * The plan's figures, with what the app keeps of the airplane (its
 * equipment, item 10, and its colour, item 19) and of the pilot (their
 * name, number and home base, item 19) and the persons on board the
 * pilot types in the Brief (`withPersonsOnBoard`): item 19's minimum for
 * a domestic flight is the endurance, the persons on board, the pilot's
 * name and contact information and the airplane's colour (AIM Appendix
 * 4). A null is an item the pilot has not said.
 */

interface FormItem {
  /** The form's item: "7", "15". */
  item: string;
  key: string;
  label: string;
  /** As it is written on the form; null where the plan cannot say. */
  value: string | null;
  note?: string;
}

export interface FlightPlanForm {
  departure: string;
  destination: string;
  items: FormItem[];
  /** The form as Flight Service is sent it (FlightServiceController),
   *  where the plan says every item it needs; null where it does not. */
  filing: FlightPlanFilingRequest | null;
}

/** A departure (SID) or an arrival (STAR) picked in the route's
 *  Procedures: its coded identifier, as filed, and its enroute
 *  transition's fix. */
export interface FiledProcedure {
  id: string;
  transition: string | null;
}

export interface FormInput {
  rules: "vfr" | "ifr";
  dep: string;
  dest: string;
  /** The stops as typed, airways among them, in order. */
  route: string[];
  /** Those of the stops landed at. */
  landings: string[];
  /** Whether a stop is an airway (V191) rather than a place. */
  isAirway: (stop: string) => boolean;
  legs: Leg[];
  totals: Totals | null;
  /** The departure picked; null where none was. */
  depart: Date | null;
  now: Date;
  aircraft: {
    ident: string | null;
    type: string | null;
    maxTakeoffLb: number | null;
    /** Item 10a's equipment and 10b's surveillance, and item 19's colour
     *  and markings, where the pilot's own airplane says them. */
    equipment?: string | null;
    surveillance?: string | null;
    colour?: string | null;
  };
  /** The pilot in command, item 19 C/: their name as their certificate
   *  gives it, their telephone number and home base, where they said. */
  pilot?: { name: string | null; phone: string | null; homeBase: string | null } | null;
  /** The fuel aboard at the first departure, where Weight & Balance says
   *  it; the tanks' usable fuel otherwise, and at every stop. */
  fuelGal: number | null;
  /** Under IFR, the alternate filed, for the last flight. */
  alternate: string | null;
  /** NASR's ICAO_ID by ident where the field's card was had (null: none
   *  listed); an ident not in it is read by the engine. */
  icaoIds?: Record<string, string | null>;
  /** Under IFR, the departure procedure picked at the departure and the
   *  arrival at the destination. */
  departureProcedure?: FiledProcedure | null;
  arrivalProcedure?: FiledProcedure | null;
}

/** Item 15's cruising speed, "N0450" (AIM Appendix 4): the engine's
 *  `filed_speed`, as the iPhone's form writes it. */
export const cruisingSpeed = (tasKt: number): string => callEngine("filed_speed", { tas_kt: tasKt });

/** Item 15's level, "F350" at and above 18,000 ft and "A080" below it
 *  (14 CFR 91.121(a)(2), AIM Appendix 4): the engine's `filed_level`. */
export const cruisingLevel = (altitudeFt: number): string => callEngine("filed_level", { ft: altitudeFt });

/** Hours and minutes in four figures, HHMM (items 16 and 19), the minutes
 *  rounded first: the engine's `filed_duration`. Its callers round up the
 *  time en route and down the endurance before, to err on the safe side
 *  of each. */
export const hhmmForm = (minutes: number): string => callEngine("filed_duration", { minutes });

/** Item 15's route between the departure and the destination: airways
 *  between the fixes they are joined and left at, and DCT between two
 *  fixes flown direct; a departure procedure first, with the fix its
 *  transition leaves it at, and an arrival last, after the fix its
 *  transition joins it at (AIM Appendix 4: "DALL3 EIC V18 MEI LGC4",
 *  "FLACK DCT IRW"); DCT alone for a flight direct from one to the
 *  other. The engine's `filed_route`. */
export function routeItem(
  stops: string[],
  isAirway: (stop: string) => boolean,
  departure: FiledProcedure | null = null,
  arrival: FiledProcedure | null = null,
): string {
  return callEngine("filed_route", { stops, airways: stops.filter(isAirway), departure, arrival });
}

/** ZZZZ's note, where a field has no ICAO four-letter location indicator
 *  (the engine's `filed_zzzz`, AIM Appendix 4: by NASR's ICAO_ID where
 *  the card had it -- IL11 none, Z13 PFZK -- else by the ident, one with
 *  a figure in it, C81). */
function zzzz(ident: string, slot: "DEP" | "DEST" | "ALTN", icaoIds: FormInput["icaoIds"]): string | undefined {
  return callEngine("filed_zzzz", icaoIds && ident in icaoIds ? { ident, icao_id: icaoIds[ident] } : { ident })
    ? `Where a filing service takes only four-letter indicators: ZZZZ, and ${slot}/${ident} in item 18 (AIM Appendix 4).`
    : undefined;
}

/** The route's flights, landing to landing, with the stops each flies
 *  through and the legs that fly it. */
function flights(input: FormInput) {
  const ends = [input.dep, ...input.landings, input.dest];
  const out: { departure: string; destination: string; via: string[]; legs: Leg[] }[] = [];
  let at = 0;
  let stop = 0;
  for (let i = 0; i < ends.length - 1; i++) {
    const destination = ends[i + 1]!;
    const via: string[] = [];
    while (stop < input.route.length && (i === ends.length - 2 || input.route[stop] !== destination)) via.push(input.route[stop++]!);
    stop++;
    const legs: Leg[] = [];
    while (at < input.legs.length) {
      const leg = input.legs[at++]!;
      legs.push(leg);
      if (leg.to === destination && i < ends.length - 2) break;
    }
    out.push({ departure: ends[i]!, destination, via, legs });
  }
  return out;
}

export function flightPlanForms(input: FormInput): FlightPlanForm[] {
  const ifr = input.rules === "ifr";
  const hops = flights(input);
  return hops.map((hop, i) => {
    const totals = hops.length > 1 ? (input.totals?.hops?.[i]?.totals ?? null) : input.totals;
    const first = hop.legs[0];
    const last = i === hops.length - 1;
    const items: FormItem[] = [];
    const add = (item: string, key: string, label: string, value: string | null, note?: string) =>
      items.push({ item, key, label, value, ...(note ? { note } : {}) });

    add("8", "rules", "Flight rules", ifr ? "IFR" : "VFR");
    add("7", "ident", "Aircraft identification", input.aircraft.ident);
    // Item 9's wake turbulence category, the engine's (`filed_wake`: L up
    // to 15,500 lb, AIM Appendix 4); said only where the airplane's is known.
    const category = callEngine("filed_wake", { max_takeoff_lb: input.aircraft.maxTakeoffLb });
    const wake = category ? `/${category}` : "";
    add("9", "type", "Type of aircraft", input.aircraft.type ? `${input.aircraft.type}${wake}` : null);
    // Item 10a: S for VHF radio, VOR and ILS, N for none, and TBL 4-2's
    // letters for the rest (G for GNSS); 10b: TBL 4-3's, C for a
    // transponder with Mode C, B1 or U1 for ADS-B Out, N for none (AIM
    // Appendix 4). The airplane's own, from its page.
    const where = input.aircraft.ident ? "Your airplane's, from Airplanes in Setup." : undefined;
    add("10a", "equipment", "Equipment", input.aircraft.equipment || null, input.aircraft.equipment ? undefined : where);
    add("10b", "surveillance", "Surveillance", input.aircraft.surveillance || null, input.aircraft.surveillance ? undefined : where);

    add("13", "departure", "Departure", hop.departure, zzzz(hop.departure, "DEP", input.icaoIds));
    // Item 13's time is UTC, four figures; a later flight's is when the
    // airplane leaves the stop, which the plan does not know.
    const depart = i === 0 ? input.depart : null;
    add(
      "13",
      "time",
      "Departure time (UTC)",
      depart ? utcFigures(depart) : null,
      i > 0 ? `When you leave ${hop.departure}.` : depart ? undefined : "No departure time picked.",
    );

    add("15", "speed", "Cruising speed", first?.tas_kt != null ? cruisingSpeed(first.tas_kt) : null);
    // The level of the flight's first leg; a plan that steps says where.
    // Under IFR the next is asked of ATC on the way: the FAA's systems
    // neither process nor show a change filed in item 15 (AIM Appendix 4).
    const step = first ? hop.legs.find((leg) => leg.altitude_ft !== first.altitude_ft) : undefined;
    add(
      "15",
      "level",
      "Cruising level",
      first ? cruisingLevel(first.altitude_ft) : null,
      step ? `Then ${feet(step.altitude_ft)} from ${step.from}${ifr ? ", asked of ATC on the way" : ""}.` : undefined,
    );

    // A T route, or a Q route, asks for GNSS and RNAV 2 (the engine's
    // `filed_rnav`, AIM Appendix 4 TBL 4-13): filed only where the airplane
    // is equipped and approved.
    const rnav = callEngine("filed_rnav", { airways: hop.via.filter(input.isAirway) });
    const departure = ifr && i === 0 ? (input.departureProcedure ?? null) : null;
    const arrival = ifr && last ? (input.arrivalProcedure ?? null) : null;
    const procedures = [departure?.id, arrival?.id].filter(Boolean);
    add(
      "15",
      "route",
      "Route",
      routeItem(hop.via, input.isAirway, departure, arrival),
      [
        procedures.length ? `${procedures.join(" and ")} as picked in the route's Procedures.` : "",
        rnav ? "A T or Q route asks for G and R in item 10a and PBN/C2 in item 18, where the airplane has them (AIM Appendix 4)." : "",
      ]
        .filter(Boolean)
        .join(" ") || undefined,
    );

    add("16", "destination", "Destination", hop.destination, zzzz(hop.destination, "DEST", input.icaoIds));
    add("16", "eet", "Total EET", totals?.ete_min != null ? hhmmForm(Math.ceil(totals.ete_min)) : null);
    const alternate = ifr && last ? input.alternate : null;
    if (alternate) add("16", "alternate", "Alternate", alternate, zzzz(alternate, "ALTN", input.icaoIds));

    // Item 18's date of flight, where it is not today: the engine's
    // `filed_dof` (AIM Appendix 4, TBL 4-1, the UTC date).
    const dof = depart ? callEngine("filed_dof", { depart: depart.toISOString(), today: input.now.toISOString() }) : null;
    if (dof) add("18", "other", "Other information", dof);

    // Item 19's endurance: the fuel aboard at the cruise burn, to the
    // minute below (the engine's `filed_endurance`).
    const fuel = i === 0 ? (input.fuelGal ?? totals?.usable_fuel_gal ?? null) : (totals?.usable_fuel_gal ?? null);
    const burn = first?.fuel_burn_gph;
    const enduranceMinutes = fuel != null && burn ? callEngine("filed_endurance", { fuel_gal: fuel, burn_gph: burn }) : null;
    add(
      "19",
      "endurance",
      "Endurance",
      enduranceMinutes != null ? hhmmForm(enduranceMinutes) : null,
      fuel != null && burn ? `${Math.round(fuel * 10) / 10} gal at ${Math.round(burn * 10) / 10} gph.` : undefined,
    );

    // Item 19's persons on board (P/), the pilot's to type in the Brief
    // (withPersonsOnBoard); the airplane's colour and markings (A/); and
    // the pilot in command (C/), with contact information "including
    // telephone number" valid at the ETA, for search and rescue (AIM
    // Appendix 4), and the home base the domestic form asks beside them
    // (FAA Form 7233-1, block 14).
    add("19", "persons", "Persons on board", null);
    add("19", "colour", "Color and markings", input.aircraft.colour || null, input.aircraft.colour ? undefined : where);
    const pic = input.pilot;
    const contact = [pic?.name, pic?.phone, pic?.homeBase ? `home base ${pic.homeBase}` : null].filter(Boolean).join(", ");
    add(
      "19",
      "pilot",
      "Pilot in command",
      contact || null,
      pic?.name && pic.phone ? undefined : "Your name and a phone number good at your ETA, from Pilot details in Setup.",
    );

    const value = (key: string) => items.find((f) => f.key === key)?.value ?? null;
    const needed = ["ident", "type", "speed", "level", "route"].map(value);
    const eetMinutes = totals?.ete_min != null ? Math.ceil(totals.ete_min) : null;
    const filing: FlightPlanFilingRequest | null =
      depart && eetMinutes && enduranceMinutes && needed.every(Boolean)
        ? {
            rules: ifr ? "IFR" : "VFR",
            aircraftId: value("ident")!,
            aircraftType: value("type")!,
            departure: hop.departure,
            departureTime: depart.toISOString(),
            cruisingSpeed: value("speed")!,
            cruisingLevel: value("level")!,
            route: value("route")!,
            destination: hop.destination,
            eetMinutes,
            alternate: value("alternate"),
            otherInformation: value("other"),
            enduranceMinutes,
            personsOnBoard: null,
          }
        : null;
    return { departure: hop.departure, destination: hop.destination, items, filing };
  });
}

/** Item 19's persons on board, as the pilot types them for the flight:
 *  a count from 1 to 999, the filing request's own limits; anything else
 *  is not said, and the item stays blank. */
export function personsOnBoard(typed: string): number | null {
  const n = /^\s*\d{1,3}\s*$/.test(typed) ? Number(typed) : NaN;
  return n >= 1 && n <= 999 ? n : null;
}

/** A form with its persons on board filled in, on the form and in what
 *  Flight Service is sent. */
export function withPersonsOnBoard(form: FlightPlanForm, persons: number | null): FlightPlanForm {
  return {
    ...form,
    items: form.items.map((f) => (f.key === "persons" ? { ...f, value: persons != null ? String(persons) : null } : f)),
    filing: form.filing ? { ...form.filing, personsOnBoard: persons } : null,
  };
}

/** A form as text, an item to a line ("Item 15  Route: BAE V191 OSH"),
 *  to paste into a filing service or read out. */
export function formText(form: FlightPlanForm): string {
  return [`${form.departure} to ${form.destination}`, ...form.items.map((f) => `Item ${f.item}  ${f.label}: ${f.value ?? "—"}`)].join("\n");
}
