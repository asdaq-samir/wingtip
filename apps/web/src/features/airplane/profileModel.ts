import type { Aircraft, AircraftRegistration } from "../../lib/api/types";
import type { AirplaneFigure, FigureKey } from "../../lib/airplane/figures";
import type { FigureChanges } from "../../lib/airplane/saveFigures";

/**
 * The airplane profile's words and shapes, worked out of what the view
 * model has: no figure is worked out here (the engine's airplane_figures
 * gives each with its source).
 */

/** Where a figure comes from, as the profile labels it. */
export function sourceWords(source: AirplaneFigure["source"]): string {
  if (source === "pilot") return "You";
  if (source === "handbook") return "Handbook photo";
  if (source === "book") return "Book";
  return "Missing";
}

/** Whether "Reset to book figure" is offered: the figure is the pilot's or
 *  the photographed page's, and the book has one to put back. */
export function resettable(figure: AirplaneFigure): boolean {
  return figure.source != null && figure.source !== "book" && figure.book != null;
}

/** The pilot's own figures with `changes` over them: a figure given kept,
 *  one reset (null) taken out so the book's stands -- what the profile
 *  shows while the change is saved. */
export function ownWith(own: Partial<Record<FigureKey, number>>, changes: FigureChanges): Partial<Record<FigureKey, number>> {
  const next = { ...own };
  for (const [key, value] of Object.entries(changes) as [FigureKey, number | null][]) {
    if (value == null) delete next[key];
    else next[key] = value;
  }
  return next;
}

/** The pilot's own figures on their record, by the engine's names: the
 *  cruise figures it always carries and its OwnFigures (V37). The handbook
 *  page's are the engine's `handbook`, apart. */
export function ownOfRecord(record: Aircraft): Partial<Record<FigureKey, number>> {
  const all: Partial<Record<FigureKey, number | null>> = {
    cruise_tas_kt: record.cruiseTasKt,
    fuel_burn_gph: record.fuelBurnGph,
    cruise_power_pct: record.cruisePowerPct,
    usable_fuel_gal: record.usableFuelGal,
    climb_tas_kt: record.climbTasKt,
    climb_fuel_burn_gph: record.climbFuelBurnGph,
    descent_ias_kt: record.descentIasKt,
    descent_fuel_burn_gph: record.descentFuelBurnGph,
    climb_rate_fpm: record.figures.climbRateFpm,
    service_ceiling_ft: record.figures.serviceCeilingFt,
    taxi_fuel_gal: record.figures.taxiFuelGal,
    glide_ratio: record.figures.glideRatio,
    empty_weight_lb: record.figures.emptyWeightLb,
    empty_moment_lb_in: record.figures.emptyMomentLbIn,
  };
  return Object.fromEntries(Object.entries(all).filter(([, v]) => v != null)) as Partial<Record<FigureKey, number>>;
}

/** The airplane's type as the profile says it: the record's designator,
 *  else the FAA registry's maker and model ("Piper PA-28-181") and year,
 *  else the stock profile's type; null where none knows it. */
export function typeWords(
  record: Aircraft | null,
  registered: Pick<AircraftRegistration, "manufacturer" | "model" | "year"> | null | undefined,
  bookType: string | null | undefined,
): string | null {
  if (record) return record.typeDesignator;
  const made = [registered?.manufacturer, registered?.model].filter(Boolean).join(" ");
  if (made) return registered?.year ? `${made}, ${registered.year}` : made;
  return bookType ?? null;
}

const TENTH: Intl.NumberFormatOptions = { useGrouping: false, maximumFractionDigits: 1 };
const RATIO: Intl.NumberFormatOptions = { useGrouping: false, minimumFractionDigits: 1, maximumFractionDigits: 1 };

/** How a figure's field writes it (React Aria's NumberField, in the
 *  pilot's locale): to a tenth, a glide ratio to one place ("9.0"). */
export function figureFormat(key: FigureKey): Intl.NumberFormatOptions {
  return key === "glide_ratio" ? RATIO : TENTH;
}
