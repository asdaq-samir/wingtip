import type { Briefing, Leg, NavLogAltitude, Totals } from "../../lib/api/types";
import { ceilingAndVisibility, PLAN_NAME, type useLoad } from "../plan";
import { flightLevel, grouped } from "../../lib/format";
import { armText } from "../../lib/weightBalance";
import { itwsLines, programLines } from "../../lib/liveReports";
import { riskLine, type assess } from "../../lib/frat";
import type { briefVerdict } from "../../lib/verdict";
import { altitudeRange, WEATHER_SOURCE_LABEL } from "./briefingFigures";
import type { runwayChecks } from "./runwayCheck";
import { callEngine } from "../../lib/engine/engine";

type VerdictInput = Parameters<typeof briefVerdict>[0]["input"];

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
  specialUse: NonNullable<VerdictInput>["airspace"]["specialUse"];
  tfrsUnchecked: boolean;
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
 *  flight's facts as the tabs read them. */
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
  tfrsUnchecked,
  nav,
  problem,
  legs,
  checks,
  loading,
  loaded,
  totals,
  assessment,
}: VerdictInputs): VerdictInput {
  const leastMarginGal = routeFigures.least_margin_gal;
  const chosen = nav?.options.find((o) => o.kind === nav.flown);
  return {
    weather: {
      pending: !briefing && !failed,
      failed,
      vfrNotRecommended: vnrReasons,
      underMinimums: underMine,
      icing: icingLines.length ? icingLines.join("; ") : null,
      hazards: hazardNames,
      unchecked: [
        ...(briefing?.weather_unavailable ?? []).filter((w) => w !== "tfrs").map((w) => WEATHER_SOURCE_LABEL[w]),
        ...(ifr && icingError ? ["the forecast icing"] : []),
      ],
      worst:
        briefing && (briefing.forecast.min_ceiling_ft != null || briefing.forecast.min_visibility_sm != null)
          ? ceilingAndVisibility(briefing.forecast.min_ceiling_ft, briefing.forecast.min_visibility_sm)
          : null,
      terminalAlerts: itwsLines(itwsAlerts ?? []),
      flowPrograms: programLines(flowPrograms ?? []),
      ifr,
    },
    airspace: {
      pending: !briefing && !failed,
      unchecked: !!failed || tfrsUnchecked,
      inForce: routeFigures.tfrs_in_force,
      near: routeFigures.tfrs_near,
      specialUse: specialUse,
    },
    altitude: {
      pending: !nav,
      problem,
      cautions: nav?.cautions.flatMap((c) => c.reasons) ?? [],
      flown: !nav
        ? null
        : nav.flown === "custom"
          ? `${flightLevel(nav.altitude_ft)}, your own`
          : `${altitudeRange(nav)}${chosen ? ` · ${PLAN_NAME[chosen.kind]} plan` : ""}`,
      // The engine's oxygen finding (14 CFR 91.211(a)): the highest leg, and the airplane's oxygen.
      highestFt: legs.length ? Math.max(...legs.map((leg) => leg.altitude_ft)) : null,
      oxygen: !!(nav?.aircraft?.supplemental_oxygen || nav?.aircraft?.pressurized),
    },
    fuel: {
      pending: !totals,
      marginGal: leastMarginGal,
      requiredGal: routeFigures.required_gal,
      reserveMin: routeFigures.reserve_min,
      ifr,
    },
    // The fields each runway finding names, the engine's one copy the
    // planner's Go / No-Go asks too.
    runways: callEngine("gonogo_runway_findings", {
      planned: !!nav,
      briefed: !!briefing,
      aircraft: nav?.aircraft ?? null,
      checks: checks.map((c) => ({
        ident: c.field.ident,
        headwind_kt: c.headwindKt,
        crosswind_over: c.crosswindOver,
        unchecked: c.unchecked,
        distances: c.distances,
      })),
    }),
    balance: {
      pending: !nav,
      worked: !!loading && !!loaded,
      // A POH loading with no load the pilot set: "give your load", never
      // the POH's sample airplane as the flight's (14 CFR 91.9(a), 91.103).
      noLoad: !!loading && !loaded,
      problems: loaded?.problems ?? [],
      takeoff: loaded ? `${grouped(loaded.takeoff.weightLb)} lb at ${armText(loaded.takeoff)}` : null,
    },
    risk: assessment ? { level: assessment.level, line: riskLine(assessment) } : null,
  };
}
