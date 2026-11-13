import type { Aircraft, AircraftChoice, AircraftProfileSummary } from "./api/types";
import { OWN_AIRPLANE, figureValue, figuresOfChoice } from "./airplane/figures";
import { callEngine } from "./engine/engine";

/** One value per choice: a pilot's own by id, a stock profile by name.
 *  The nav log's picker keys its options on it, and the Library's Aircraft
 *  ticks the one it matches. */
export function aircraftKey(a: AircraftChoice): string {
  return a.none ? "none" : a.aircraftId != null ? `mine:${a.aircraftId}` : a.tail ? `tail:${a.tail}` : `profile:${a.profile}`;
}

/** An N-number as a pilot types one, as 14 CFR 47.15(b) shapes it: N,
 *  then up to five figures, four and a letter, or three and two letters,
 *  the first figure 1 to 9 and never the letters I or O. The shared
 *  engine's test (engine/crates/pilot/src/aircraft), the iPhone's too, asked as
 *  a pattern's `test` was. */
export const N_NUMBER = { test: (text: string): boolean => callEngine("n_number", { text }) };

/** The registration as a pilot types it into a search, the N first, in
 *  the FAA's capitals, where it is one (N_NUMBER); null where not. */
export function tailTyped(typed: string): string | null {
  const t = typed.trim().toUpperCase().replace(/\s+/g, "");
  return N_NUMBER.test(t) ? (t.startsWith("N") ? t : `N${t}`) : null;
}

/** The stock profile an airplane the FAA's registry names flies on, by its
 *  maker, model and year, each from its type's handbook (data/aircraft):
 *  any other none, its speed and burn the pilot's to give (Setup's
 *  Airplanes) rather than a guess. The shared engine's list
 *  (engine/crates/pilot/src/aircraft/registry.rs), which the iPhone's
 *  Registered asks too. */
export function profileOfRegistered(registered: {
  manufacturer?: string | null;
  model?: string | null;
  year?: number | null;
}): string | null {
  return callEngine("registered_profile", {
    manufacturer: registered.manufacturer ?? null,
    model: registered.model ?? null,
    year: registered.year ?? null,
  });
}

/** A pilot's own airplane rides on the stock profile whose name
 *  matches its type designator (a C172 on c172); null for a type with none. */
function baseProfile(typeDesignator: string, profiles: AircraftProfileSummary[]): string | null {
  const wanted = typeDesignator.toLowerCase().replace(/[^a-z0-9]/g, "");
  return profiles.find((p) => p.name === wanted)?.name ?? null;
}

/** A pilot's own airplane as the nav log flies it: on the stock profile of
 *  its type with its record's figures over it, or, of a type with none, on
 *  its record's figures alone (OWN_AIRPLANE): never another airplane's
 *  (the owner, 2026-11-09). One place for the picker under the route and
 *  the Library's Aircraft, which both choose it. Its confirmed handbook
 *  page's glide ratio, climb rate and empty weight stand where the pilot
 *  gave none of their own. */
export function choiceOf(a: Aircraft, profiles: AircraftProfileSummary[]): AircraftChoice {
  const own = a.figures;
  const hb = a.handbook;
  const choice: AircraftChoice = {
    profile: baseProfile(a.typeDesignator, profiles) ?? OWN_AIRPLANE,
    label: `${a.tailNumber} · ${a.typeDesignator}`,
    cruiseTasKt: a.cruiseTasKt,
    fuelBurnGph: a.fuelBurnGph,
    usableFuelGal: a.usableFuelGal ?? undefined,
    cruisePowerPct: a.cruisePowerPct ?? undefined,
    climbTasKt: a.climbTasKt ?? undefined,
    climbFuelBurnGph: a.climbFuelBurnGph ?? undefined,
    descentIasKt: a.descentIasKt ?? undefined,
    descentFuelBurnGph: a.descentFuelBurnGph ?? undefined,
    serviceCeilingFt: own.serviceCeilingFt ?? undefined,
    climbRateFpm: own.climbRateFpm ?? hb?.climb_rate_fpm ?? undefined,
    taxiFuelGal: own.taxiFuelGal ?? undefined,
    glideRatio: own.glideRatio ?? hb?.glide_ratio ?? undefined,
    emptyWeightLb: own.emptyWeightLb ?? hb?.empty_weight_lb ?? undefined,
    emptyMomentLbIn: own.emptyMomentLbIn ?? undefined,
    aircraftId: a.id,
  };
  // Left out where not set, so a choice kept is the same choice.
  for (const key of Object.keys(choice) as (keyof AircraftChoice)[]) if (choice[key] === undefined) delete choice[key];
  return choice;
}

/** The airplane's type as a logbook writes it: its type designator, for an
 *  own airplane of no stock type the one its label carries. */
export function typeOf(a: AircraftChoice): string | null {
  if (a.none) return null;
  return a.profile === OWN_AIRPLANE ? (a.label.split(" · ")[1] ?? null) : a.profile.toUpperCase() || null;
}

/** An airplane's short name: what comes before the " · " in its label
 *  ("C172 · Cessna 172", "N12345 · C172"). */
export function shortName(label: string): string {
  return label.split(" · ")[0] ?? label;
}

/** The true airspeed an airplane cruises at: its own where the pilot set
 *  one, else its stock profile's; null while the profiles load and the
 *  pilot gave none. The planner's figures before its nav log comes, and
 *  the map's ruler, which times a line at it. */
export function cruiseTasOf(a: AircraftChoice, profiles: AircraftProfileSummary[] | undefined): number | null {
  if (a.none) return null;
  return a.cruiseTasKt ?? profiles?.find((p) => p.name === a.profile)?.cruise_tas_kt ?? null;
}

/** The picked airplane's still-air glide ratio (the engine's
 *  airplane_figures: its own, else its type's POH figure, Section 3); null
 *  with no airplane or none in its figures -- no glide is then worked out,
 *  never another airplane's (the owner, 2026-11-09). */
export function glideRatioOf(a: AircraftChoice, profiles: AircraftProfileSummary[] | undefined): number | null {
  return figureValue(figuresOfChoice(a, profiles), "glide_ratio");
}

/** The picked airplane's own fuel for start, taxi and takeoff, gal (its
 *  POH's Section 5 note, or the pilot's); null with none, which is then
 *  left out rather than taken from another airplane. */
export function taxiFuelOf(a: AircraftChoice, profiles: AircraftProfileSummary[] | undefined): number | null {
  return figureValue(figuresOfChoice(a, profiles), "taxi_fuel_gal");
}

/** The picked airplane's N-number: its own, or its label's where that is
 *  one; null for a stock profile picked by name, or none. */
export function tailOf(a: AircraftChoice): string | null {
  if (a.none) return null;
  if (a.tail) return a.tail.toUpperCase();
  const name = shortName(a.label).toUpperCase();
  return N_NUMBER.test(name) ? name : null;
}

/** An airplane the FAA's registry has, picked by its N-number -- in the
 *  picker under the route, or its profile's Fly This Airplane: flown on its
 *  type's stock profile, none where its type has none (its own figures
 *  then, never another airplane's), named by its N-number, with the
 *  figures the pilot set for it on this device over the book's. */
export function tailChoice(tail: string, profile: string, kept?: Partial<AircraftChoice>): AircraftChoice {
  const label = profile ? `${tail} · ${profile.toUpperCase()}` : tail;
  return { profile, label, tail, ...kept };
}
