import type { AltitudeBreakdown, Briefing } from "../../../lib/api/types";
import { callEngine } from "../../../lib/engine/engine";

/**
 * Under IFR, whether the flight is planned into icing: a leg flown at or
 * above the freezing level, where the moisture icing needs is forecast --
 * cloud along the route, or an icing AIRMET or SIGMET over it (the
 * planner's `icing_possible`, wingtip.altitude) -- with the pilot reports of
 * icing near the route. Under VFR the flight stays clear of cloud (14 CFR
 * 91.155), and the freezing level is the altitude reasoning's line alone.
 * The rule and its line are the shared engine's
 * (engine/crates/brief/src/gonogo/icing.rs, through lib/engine).
 */
interface IcingAtAltitude {
  /** The highest altitude flown at or above the freezing level. */
  altitudeFt: number;
  freezingLevelFt: number;
  /** The forecast is below freezing at its lowest altitude. */
  atOrBelow: boolean;
  /** Pilot reports of icing near the route, of any intensity but none. */
  reports: number;
}

export function icingAtAltitude(selection: AltitudeBreakdown, flownFt: number[], pireps: Briefing["pireps"]): IcingAtAltitude | null {
  const found = callEngine("gonogo_icing", {
    selection: {
      freezing_level_ft: selection.freezing_level_ft ?? null,
      icing_possible: selection.icing_possible ?? null,
      freezing_level_at_or_below: selection.freezing_level_at_or_below ?? null,
    },
    flown_ft: flownFt,
    pireps: pireps.map((p) => ({ icing: p.icing ?? null })),
  });
  return (
    found && {
      altitudeFt: found.altitude_ft,
      freezingLevelFt: found.freezing_level_ft,
      atOrBelow: found.at_or_below,
      reports: found.reports,
    }
  );
}

/** In a line, for the Go / No-Go. */
export function icingLine(icing: IcingAtAltitude): string {
  return callEngine("gonogo_icing_line", {
    icing: {
      altitude_ft: icing.altitudeFt,
      freezing_level_ft: icing.freezingLevelFt,
      at_or_below: icing.atOrBelow,
      reports: icing.reports,
    },
  });
}

/** Under IFR, icing that could not be checked: icing possible at the
 *  altitudes flown but the freezing level not known (the engine's
 *  gonogo_icing_unchecked, FAA-H-8083-28B ch. 20): "Icing not checked:
 *  freezing level not known", or null. */
function icingUncheckedLine(selection: AltitudeBreakdown, flownFt: number[]): string | null {
  return callEngine("gonogo_icing_unchecked", {
    selection: {
      freezing_level_ft: selection.freezing_level_ft ?? null,
      icing_possible: selection.icing_possible ?? null,
      freezing_level_at_or_below: selection.freezing_level_at_or_below ?? null,
    },
    flown_ft: flownFt,
  });
}

/** Freezing rain or drizzle (FZRA, FZDZ) in the METAR or TAF of a field
 *  the flight takes off from or lands at, on any flight, VFR too: it
 *  falls clear of cloud (AIM 7-1-20; the engine's freezing_precip). Its
 *  line, or null. */
function freezingPrecipLine(briefing: Briefing, fields: string[]): string | null {
  return callEngine("freezing_precip", {
    fields: fields.map((ident) => ({
      ident,
      metar: briefing.metars[ident]?.raw ?? null,
      taf: briefing.forecast.stations.find((s) => s.icaoId === ident)?.raw ?? null,
    })),
  }).line;
}

/** The Go / No-Go's icing finding, its lines in engine/README.md's order:
 *  under IFR, icing at the altitude flown (gonogo_icing) or that it could
 *  not be checked (gonogo_icing_unchecked), then the AWC's forecast icing;
 *  freezing rain or drizzle at the route's fields on any flight
 *  (freezing_precip). The icing at the altitude too. */
export function icingFindings(a: {
  ifr: boolean;
  nav: { altitude_selection: AltitudeBreakdown } | null | undefined;
  legs: { altitude_ft: number }[];
  briefing: Briefing | null | undefined;
  forecastLine: string | null | undefined;
  /** The route's fields, for their reports' freezing rain or drizzle. */
  fields: string[];
}): { icing: IcingAtAltitude | null; lines: string[] } {
  const flown = a.legs.map((l) => l.altitude_ft);
  const icing = a.ifr && a.nav && a.briefing ? icingAtAltitude(a.nav.altitude_selection, flown, a.briefing.pireps) : null;
  const lines = [
    icing && icingLine(icing),
    a.ifr && a.nav ? icingUncheckedLine(a.nav.altitude_selection, flown) : null,
    a.ifr ? a.forecastLine : null,
    a.briefing ? freezingPrecipLine(a.briefing, a.fields) : null,
  ].filter((l): l is string => !!l);
  return { icing, lines };
}
