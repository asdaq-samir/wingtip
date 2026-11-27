import type { Briefing, Leg, NavLogAltitude, Totals } from "../../lib/api/types";
import type { useLoad } from "../plan";
import { itwsLines, programLines } from "../../lib/liveReports";
import type { VerdictFacts } from "../../lib/verdict";
import type { runwayChecks } from "./runwayCheck";
import type { callEngine } from "../../lib/engine/engine";

interface VerdictInputs {
  briefing: Briefing | null;
  failed: string | null;
  ifr: boolean;
  /** Every field the flight lands at, each once: whose METAR's ceiling
   *  with no height the engine says unchecked. */
  landings: string[];
  underMine: string[];
  icingLines: string[];
  icingError: boolean;
  hazardNames: string[];
  itwsAlerts: Parameters<typeof itwsLines>[0] | undefined;
  flowPrograms: Parameters<typeof programLines>[0] | undefined;
  routeFigures: ReturnType<typeof callEngine<"gonogo_route_figures">>;
  specialUse: VerdictFacts["special_use"];
  nav: NavLogAltitude | null;
  problem: string | null;
  legs: Leg[];
  checks: ReturnType<typeof runwayChecks>;
  loading: ReturnType<typeof useLoad>["loading"];
  loaded: ReturnType<typeof useLoad>["result"];
  totals: Totals | null;
}

/** The flight's facts the engine's Go / No-Go is put together from
 *  (gonogo_brief's `facts`, which it builds with gonogo_input, the
 *  planner's very copy): the briefing's, the nav log's and the page's own
 *  answers as they are, in the engine's names. The engine drops VFR not
 *  recommended under IFR and finds the ceilings with no height in the
 *  METARs and the forecast (14 CFR 91.169, 91.103). */
export function verdictInput({
  briefing,
  failed,
  ifr,
  landings,
  underMine,
  icingLines,
  icingError,
  hazardNames,
  itwsAlerts,
  flowPrograms,
  routeFigures,
  specialUse,
  nav,
  problem,
  legs,
  checks,
  loading,
  loaded,
  totals,
}: VerdictInputs): VerdictFacts {
  return {
    briefed: !!briefing,
    failed,
    ifr,
    weather_unavailable: briefing?.weather_unavailable ?? [],
    forecast: briefing?.forecast ?? null,
    vfr_not_recommended: briefing?.vfr_not_recommended ?? [],
    under_minimums: underMine,
    icing: icingLines,
    icing_unchecked: icingError,
    landings,
    metars: briefing?.metars ?? null,
    hazards: hazardNames,
    terminal_alerts: itwsLines(itwsAlerts ?? []),
    flow_programs: programLines(flowPrograms ?? []),
    route_figures: routeFigures,
    special_use: specialUse,
    nav,
    problem,
    legs_ft: legs.map((leg) => leg.altitude_ft),
    totals: !!totals,
    aircraft: nav?.aircraft ?? null,
    runway_checks: checks.map((c) => ({
      ident: c.field.ident,
      headwind_kt: c.headwindKt,
      crosswind_over: c.crosswindOver,
      unchecked: c.unchecked,
      distances: c.distances,
    })),
    loading: !!loading,
    loaded: loaded ? { takeoff: { weight_lb: loaded.takeoff.weightLb, arm_in: loaded.takeoff.armIn }, problems: loaded.problems } : null,
  };
}
