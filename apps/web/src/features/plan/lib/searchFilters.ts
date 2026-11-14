import type { NearestAirport } from "../../../lib/api/types";
import { clockTime } from "../../../lib/format";
import { callEngine } from "../../../lib/engine/engine";

/** A fuel a search filters by (the planner's, from NASR's fuel codes). */
export type Fuel = NonNullable<NearestAirport["fuel"]>[number];
/** A runway surface a search filters by (the planner's, from NASR's). */
export type Surface = Exclude<NonNullable<NearestAirport["runway_surfaces"]>[number], "other">;

/**
 * A search sent (Apple Maps' results for "Grocery Stores", the owner's
 * screenshots, 2026-11-10): the fields round a place, narrowed by the
 * filters the results' chips and the Filters page share. Every filter reads
 * a figure the planner's Nearest answers with (wingtip.airports nearest and
 * wingtip.field_facts: the flight category from the METAR, towered, the
 * longest open runway, the distance, public or private, the fuel sold, the
 * runways' surfaces, an instrument approach in the CIFP, and the forecast
 * category at a time from the engine's reading of the TAF); none works
 * anything out, and Public asks the engine (public_use: neither private
 * nor the armed services' own, a joint-use field public). No fuel price is offered: the app reads no price feed.
 */
export interface SearchFilters {
  /** Reporting VFR now (the METAR's flight category, AIM 7-1-7). */
  vfrNow: boolean;
  /** Forecast VFR this many hours from now (the worst the TAF that speaks
   *  for it forecasts then, AIM 7-1-7); null for not asked. */
  vfrInHours: number | null;
  /** A control tower (the FAA's airport file). */
  towered: boolean;
  /** Open to the public: a private field left out. */
  publicOnly: boolean;
  /** An instrument approach (the FAA's CIFP). */
  approach: boolean;
  /** Selling any of these fuels; none for any. */
  fuel: Fuel[];
  /** A runway of any of these surfaces; none for any. */
  surface: Surface[];
  /** The longest open runway at least this long, ft; null for any. */
  minRunwayFt: number | null;
  /** Within this far of the place searched round, nm; null for any. */
  withinNm: number | null;
}

export const NO_FILTERS: SearchFilters = {
  vfrNow: false,
  vfrInHours: null,
  towered: false,
  publicOnly: false,
  approach: false,
  fuel: [],
  surface: [],
  minRunwayFt: null,
  withinNm: null,
};

/** The runway lengths the menu offers, ft. */
export const RUNWAY_STEPS = [2000, 3000, 4000, 5000] as const;
/** The distances the menu offers, nm. */
export const WITHIN_STEPS = [10, 25, 50] as const;
/** The hours ahead "VFR at…" offers: within a TAF's 24 (FAA-H-8083-28B 27.4.1). */
export const VFR_AT_STEPS = [1, 2, 3, 6, 12] as const;
/** The fuels and surfaces offered, in the order shown. */
export const FUELS: readonly Fuel[] = ["100LL", "Jet A", "UL94"];
export const SURFACES: readonly Surface[] = ["paved", "turf", "water"];
export const SURFACE_WORDS: Record<Surface, string> = { paved: "Paved", turf: "Turf", water: "Water" };

const HOUR_MS = 3_600_000;

/** The time "VFR at…" asks the forecast for, s since 1970: the top of the
 *  hour that many hours on, so one hour's searches ask the planner once. */
export function vfrAtTime(hours: number | null, now: number = Date.now()): number | null {
  return hours == null ? null : (Math.floor(now / HOUR_MS) + hours) * 3600;
}

/** The fields a search's filters keep, in Nearest's order (nearest first). */
export function filterFields(fields: readonly NearestAirport[], f: SearchFilters): NearestAirport[] {
  return fields.filter(
    (a) =>
      (!f.vfrNow || a.flight_category === "VFR") &&
      (f.vfrInHours == null || a.forecast?.category === "VFR") &&
      (!f.towered || a.towered) &&
      (!f.publicOnly || callEngine("public_use", { private: a.private, military: a.military ?? null })) &&
      (!f.approach || a.instrument_approach === true) &&
      (f.fuel.length === 0 || f.fuel.some((k) => a.fuel?.includes(k))) &&
      (f.surface.length === 0 || f.surface.some((k) => a.runway_surfaces?.includes(k))) &&
      (f.minRunwayFt == null || (a.longest_runway_ft ?? 0) >= f.minRunwayFt) &&
      (f.withinNm == null || a.distance_nm <= f.withinNm),
  );
}

/** How many filters are on, for the filter chip's count. */
export function filtersOn(f: SearchFilters): number {
  return [
    f.vfrNow,
    f.vfrInHours != null,
    f.towered,
    f.publicOnly,
    f.approach,
    f.fuel.length > 0,
    f.surface.length > 0,
    f.minRunwayFt != null,
    f.withinNm != null,
  ].filter(Boolean).length;
}

/** What a search sent says, read for its words alone: "towered", "vfr",
 *  "public", "approach", "100ll", "jet" and "turf" turn on
 *  their filters, and "near KMSN" (or an ident alone) names the place to
 *  search round. Everything else is left as words; the fields are
 *  Nearest's either way. */
export function readQuery(text: string): { near: string | null; filters: Partial<SearchFilters> } {
  const words = text.trim().toUpperCase().split(/\s+/).filter(Boolean);
  const filters: Partial<SearchFilters> = {};
  if (words.some((w) => w.startsWith("TOWER"))) filters.towered = true;
  if (words.includes("VFR")) filters.vfrNow = true;
  if (words.includes("PUBLIC")) filters.publicOnly = true;
  if (words.some((w) => w.startsWith("APPROACH"))) filters.approach = true;
  const fuel = FUELS.filter((k) => words.includes(k.split(" ")[0]!.toUpperCase()));
  if (fuel.length) filters.fuel = fuel;
  const surface = SURFACES.filter((k) => words.includes(k.toUpperCase()) || (k === "turf" && words.includes("GRASS")));
  if (surface.length) filters.surface = surface;
  const at = words.findIndex((w) => w === "NEAR" || w === "AROUND");
  const named = at >= 0 ? words[at + 1] : words.length === 1 ? words[0] : undefined;
  const near = named && /^[A-Z0-9]{3,4}$/.test(named) && /\d|^K|^P/.test(named) ? named : null;
  return { near, filters };
}

/** The runway's and the distance's words, for a chip and a menu row. */
export const runwayWords = (ft: number | null) => (ft == null ? "Any Runway" : `Runway ≥ ${ft.toLocaleString("en-US")} ft`);
export const withinWords = (nm: number | null) => (nm == null ? "Any Distance" : `Within ${nm} nm`);

/** "VFR at…"'s words: the clock time on this device ("VFR at 15:00"),
 *  "VFR at…" while none is picked. */
export function vfrAtWords(hours: number | null, now: number = Date.now()): string {
  const clock = vfrAtClock(hours, now);
  return clock == null ? "VFR at…" : `VFR at ${clock}`;
}

/** The clock time "VFR at…" asks for, on this device ("15:00"); null for none. */
export function vfrAtClock(hours: number | null, now: number = Date.now()): string | null {
  const at = vfrAtTime(hours, now);
  return at == null ? null : clockTime(new Date(at * 1000));
}

/** "VFR at…"'s menu rows: any time, then each hour's clock time. */
export const vfrAtMenuWords = (hours: number | null) => (hours == null ? "Any Time" : vfrAtWords(hours));

/** A list's words for a chip: "Fuel" while none is picked, the one picked,
 *  or the first and how many more ("100LL +1"). */
export function listWords(picked: readonly string[], none: string): string {
  if (picked.length === 0) return none;
  return picked.length === 1 ? picked[0]! : `${picked[0]} +${picked.length - 1}`;
}
