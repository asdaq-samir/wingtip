import type { Briefing, Leg, NavLogAltitude, Totals } from "../../lib/api/types";
import type { useLoad } from "../plan";
import { itwsLines, programLines } from "../../lib/liveReports";
import { riskLine, type assess } from "../../lib/frat";
import type { briefVerdict } from "../../lib/verdict";
import type { runwayChecks } from "./runwayCheck";
import { callEngine } from "../../lib/engine/engine";

type VerdictInput = NonNullable<Parameters<typeof briefVerdict>[0]["input"]>;

interface VerdictInputs {
  briefing: Briefing | null;
  failed: string | null;
  ifr: boolean;
  vnrReasons: string[];
  underMine: string[];
  icingLines: string[];
  icingError: boolean;
  hazardNames: string[];
  itwsAlerts: Parameters<typeof itwsLines>[0] | undefined;
  flowPrograms: Parameters<typeof programLines>[0] | undefined;
  routeFigures: ReturnType<typeof callEngine<"gonogo_route_figures">>;
  specialUse: VerdictInput["airspace"]["specialUse"];
  nav: NavLogAltitude | null;
  problem: string | null;
  legs: Leg[];
  checks: ReturnType<typeof runwayChecks>;
  loading: ReturnType<typeof useLoad>["loading"];
  loaded: ReturnType<typeof useLoad>["result"];
  totals: Totals | null;
  assessment: ReturnType<typeof assess> | null;
}

/** What the engine's Go / No-Go is asked (gonogo_brief): each part of the
 *  flight's facts put together by the engine (gonogo_input, the planner's
 *  very copy), the risk the page's own. Only the shapes are made here.
 *  The briefing's own reasons for VFR not recommended go in, which the
 *  engine drops under IFR as `vnrReasons` does. */
export function verdictInput({
  briefing,
  failed,
  ifr,
  vnrReasons,
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
  assessment,
}: VerdictInputs): VerdictInput {
  const s = callEngine("gonogo_input", {
    briefed: !!briefing,
    failed,
    ifr,
    weather_unavailable: briefing?.weather_unavailable ?? [],
    forecast: briefing?.forecast ?? null,
    vfr_not_recommended: vnrReasons,
    under_minimums: underMine,
    icing: icingLines,
    icing_unchecked: icingError,
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
  });
  // The engine's sections in the page's names (lib/verdict's VerdictInput).
  const { weather: w, airspace: a, altitude: h, fuel: f, runways: r, balance: b } = s;
  return {
    weather: {
      pending: !!w.pending,
      failed: w.failed ?? null,
      vfrNotRecommended: w.vfr_not_recommended ?? [],
      underMinimums: w.under_minimums ?? [],
      icing: w.icing ?? null,
      hazards: w.hazards ?? [],
      unchecked: w.unchecked ?? [],
      worst: w.worst ?? null,
      terminalAlerts: w.terminal_alerts ?? [],
      flowPrograms: w.flow_programs ?? [],
      ifr: !!w.ifr,
    },
    airspace: { pending: !!a.pending, unchecked: !!a.unchecked, inForce: a.in_force ?? [], near: a.near ?? 0, specialUse },
    altitude: {
      pending: !!h.pending,
      problem: h.problem ?? null,
      cautions: h.cautions ?? [],
      flown: h.flown ?? null,
      highestFt: h.highest_ft ?? null,
      oxygen: !!h.oxygen,
    },
    fuel: {
      pending: !!f.pending,
      marginGal: f.margin_gal ?? null,
      requiredGal: f.required_gal ?? null,
      reserveMin: f.reserve_min ?? null,
      ifr: !!f.ifr,
    },
    runways: {
      pending: !!r.pending,
      worked: !!r.worked,
      short: r.short ?? [],
      crosswind: r.crosswind ?? [],
      beyond: r.beyond ?? [],
      tailwind: r.tailwind ?? [],
      close: r.close ?? [],
      unchecked: r.unchecked ?? [],
    },
    balance: { pending: !!b.pending, worked: !!b.worked, noLoad: !!b.no_load, problems: b.problems ?? [], takeoff: b.takeoff ?? null },
    risk: assessment ? { level: assessment.level, line: riskLine(assessment) } : null,
  };
}
