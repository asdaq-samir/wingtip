import type { Aircraft, AircraftProfileSummary, AircraftRequest, OwnFigures } from "../api/types";
import { FIGURE_FIELDS, type FigureKey, type OwnFigureValues } from "./figures";

/**
 * Where a pilot's own figure for an N-number is kept, worked out here and
 * sent by useSaveFigures: on their record in the account (the gateway's
 * POST /api/aircraft, PUT /api/aircraft/{id} and its /figures), or, signed
 * out, on this device (the preferences' tailFigures). A change is a
 * figure's new value, or null for "Reset to book figure".
 */
export type FigureChanges = Partial<Record<FigureKey, number | null>>;

/** The figures the record keeps in its OwnFigures (V37), each nullable:
 *  null there clears one, the type's book figure (or none) then stands. */
const RECORD_FIGURES = [
  "service_ceiling_ft",
  "climb_rate_fpm",
  "taxi_fuel_gal",
  "glide_ratio",
  "empty_weight_lb",
  "empty_moment_lb_in",
] as const;
type RecordFigure = (typeof RECORD_FIGURES)[number];
const isRecordFigure = (key: string): key is RecordFigure => (RECORD_FIGURES as readonly string[]).includes(key);

/** ICAO Doc 8643's designator for a type that has none of its own: what a
 *  record is made with where the FAA's registry names no type. */
export const NO_TYPE_DESIGNATOR = "ZZZZ";

/** The record's OwnFigures with `changes` over `figures`. */
function ownFiguresWith(figures: OwnFigures | null, changes: FigureChanges): OwnFigures {
  const out = { ...(figures ?? {}) } as Record<string, number | null>;
  for (const key of RECORD_FIGURES) {
    const field = FIGURE_FIELDS[key];
    if (key in changes) out[field] = changes[key] ?? null;
    else out[field] ??= null;
  }
  return out as unknown as OwnFigures;
}

/** Only new values, each a figure the record keeps: what PUT
 *  /api/aircraft/{id}/figures adds (the inline ask's Save), the rest
 *  unsaid; null where a change is anything else (a reset, a cruise figure). */
export function figuresOnly(changes: FigureChanges): OwnFigures | null {
  const keys = Object.keys(changes);
  if (!keys.length || keys.some((k) => !isRecordFigure(k) || changes[k as FigureKey] == null)) return null;
  return ownFiguresWith(null, changes);
}

/** A number of the change where given, the record's (or the book's) else. */
function pick(changes: FigureChanges, key: FigureKey, kept: number | null | undefined): number | null {
  return key in changes ? (changes[key] ?? null) : (kept ?? null);
}

/** The whole record again with `changes` over it (PUT /api/aircraft/{id}):
 *  a reset of the cruise speed or burn, which the record must have, puts
 *  the type's book figure back. */
export function recordWith(record: Aircraft, changes: FigureChanges, book: AircraftProfileSummary | null): AircraftRequest {
  return {
    tailNumber: record.tailNumber,
    typeDesignator: record.typeDesignator,
    cruiseTasKt: pick(changes, "cruise_tas_kt", record.cruiseTasKt) ?? book?.cruise_tas_kt ?? record.cruiseTasKt,
    fuelBurnGph: pick(changes, "fuel_burn_gph", record.fuelBurnGph) ?? book?.fuel_burn_gph ?? record.fuelBurnGph,
    usableFuelGal: pick(changes, "usable_fuel_gal", record.usableFuelGal),
    cruisePowerPct: pick(changes, "cruise_power_pct", record.cruisePowerPct),
    climbTasKt: pick(changes, "climb_tas_kt", record.climbTasKt),
    climbFuelBurnGph: pick(changes, "climb_fuel_burn_gph", record.climbFuelBurnGph),
    descentIasKt: pick(changes, "descent_ias_kt", record.descentIasKt),
    descentFuelBurnGph: pick(changes, "descent_fuel_burn_gph", record.descentFuelBurnGph),
    equipment: record.equipment,
    surveillance: record.surveillance,
    colour: record.colour,
    figures: ownFiguresWith(record.figures, changes),
  };
}

/** A new record for an N-number the pilot has none for, its first figure
 *  set: the type's book figures under it, theirs over them (the owner,
 *  2026-11-09); null where neither gives the cruise speed and burn a
 *  record must have -- they are then asked for first. */
export function newRecord(
  tail: string,
  typeDesignator: string | null,
  book: AircraftProfileSummary | null,
  device: OwnFigureValues | undefined,
  changes: FigureChanges,
): AircraftRequest | null {
  const all: FigureChanges = { ...fromDevice(device), ...changes };
  const cruise = all.cruise_tas_kt ?? book?.cruise_tas_kt ?? null;
  const burn = all.fuel_burn_gph ?? book?.fuel_burn_gph ?? null;
  if (cruise == null || burn == null) return null;
  return {
    tailNumber: tail.toUpperCase(),
    typeDesignator: typeDesignator || book?.name.toUpperCase() || NO_TYPE_DESIGNATOR,
    cruiseTasKt: cruise,
    fuelBurnGph: burn,
    usableFuelGal: all.usable_fuel_gal ?? null,
    cruisePowerPct: all.cruise_power_pct ?? null,
    climbTasKt: all.climb_tas_kt ?? null,
    climbFuelBurnGph: all.climb_fuel_burn_gph ?? null,
    descentIasKt: all.descent_ias_kt ?? null,
    descentFuelBurnGph: all.descent_fuel_burn_gph ?? null,
    equipment: null,
    surveillance: null,
    colour: null,
    figures: ownFiguresWith(null, all),
  };
}

/** The device's figures for an N-number by the engine's names. */
export function fromDevice(device: OwnFigureValues | undefined): Partial<Record<FigureKey, number>> {
  const out: Partial<Record<FigureKey, number>> = {};
  for (const [key, field] of Object.entries(FIGURE_FIELDS) as [FigureKey, keyof OwnFigureValues][]) {
    if (device?.[field] != null) out[key] = device[field];
  }
  return out;
}

/** The device's figures for an N-number with `changes` over them: a reset
 *  takes the pilot's figure away, the book's then standing. */
export function deviceWith(device: OwnFigureValues | undefined, changes: FigureChanges): OwnFigureValues {
  const out: OwnFigureValues = { ...(device ?? {}) };
  for (const [key, value] of Object.entries(changes) as [FigureKey, number | null][]) {
    if (value == null) delete out[FIGURE_FIELDS[key]];
    else out[FIGURE_FIELDS[key]] = value;
  }
  return out;
}
