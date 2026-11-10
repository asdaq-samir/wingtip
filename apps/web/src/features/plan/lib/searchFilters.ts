import type { NearestAirport } from "../../../lib/api/types";

/**
 * A search sent (Apple Maps' results for "Grocery Stores", the owner's
 * screenshots, 2026-11-10): the fields round a place, narrowed by the
 * filters the results' chips and the Filters page share. Every filter reads
 * a figure the planner's Nearest already answers with (wingtip.airports
 * nearest: the flight category from the METAR, towered, the longest open
 * runway, the distance, public or private); none works anything out, and
 * a filter with nothing behind it (fuel, an instrument approach, a
 * runway's surface, a seaplane base) is not offered.
 */
export interface SearchFilters {
  /** Reporting VFR now (the METAR's flight category, AIM 7-1-7). */
  vfrNow: boolean;
  /** A control tower (the FAA's airport file). */
  towered: boolean;
  /** Open to the public: a private field left out. */
  publicOnly: boolean;
  /** The longest open runway at least this long, ft; null for any. */
  minRunwayFt: number | null;
  /** Within this far of the place searched round, nm; null for any. */
  withinNm: number | null;
}

export const NO_FILTERS: SearchFilters = { vfrNow: false, towered: false, publicOnly: false, minRunwayFt: null, withinNm: null };

/** The runway lengths the menu offers, ft. */
export const RUNWAY_STEPS = [2000, 3000, 4000, 5000] as const;
/** The distances the menu offers, nm. */
export const WITHIN_STEPS = [10, 25, 50] as const;

/** The fields a search's filters keep, in Nearest's order (nearest first). */
export function filterFields(fields: readonly NearestAirport[], f: SearchFilters): NearestAirport[] {
  return fields.filter(
    (a) =>
      (!f.vfrNow || a.flight_category === "VFR") &&
      (!f.towered || a.towered) &&
      (!f.publicOnly || !a.private) &&
      (f.minRunwayFt == null || (a.longest_runway_ft ?? 0) >= f.minRunwayFt) &&
      (f.withinNm == null || a.distance_nm <= f.withinNm),
  );
}

/** How many filters are on, for the filter chip's count. */
export function filtersOn(f: SearchFilters): number {
  return [f.vfrNow, f.towered, f.publicOnly, f.minRunwayFt != null, f.withinNm != null].filter(Boolean).length;
}

/** What a search sent says, read for its words alone: "towered", "vfr",
 *  "public" turn on their filters, and "near KMSN" (or an
 *  ident alone) names the place to search round. Everything else is left
 *  as words; the fields are Nearest's either way. */
export function readQuery(text: string): { near: string | null; filters: Partial<SearchFilters> } {
  const words = text.trim().toUpperCase().split(/\s+/).filter(Boolean);
  const filters: Partial<SearchFilters> = {};
  if (words.some((w) => w.startsWith("TOWER"))) filters.towered = true;
  if (words.includes("VFR")) filters.vfrNow = true;
  if (words.includes("PUBLIC")) filters.publicOnly = true;
  const at = words.findIndex((w) => w === "NEAR" || w === "AROUND");
  const named = at >= 0 ? words[at + 1] : words.length === 1 ? words[0] : undefined;
  const near = named && /^[A-Z0-9]{3,4}$/.test(named) && /\d|^K|^P/.test(named) ? named : null;
  return { near, filters };
}

/** The runway's and the distance's words, for a chip and a menu row. */
export const runwayWords = (ft: number | null) => (ft == null ? "Any Runway" : `Runway ≥ ${ft.toLocaleString("en-US")} ft`);
export const withinWords = (nm: number | null) => (nm == null ? "Any Distance" : `Within ${nm} nm`);
