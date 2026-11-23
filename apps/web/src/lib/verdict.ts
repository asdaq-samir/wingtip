/**
 * The Brief's Go / No-Go: every tab's own finding about the flight in one
 * list, each a row that opens where it was found -- the weather, the
 * airspace on the route, the altitude, the fuel, the runways, the loading
 * and the risk -- and one line over them saying what they come to. What
 * the pilot reads first on opening the Brief, as a flight service
 * briefer opens with adverse conditions and whether VFR is recommended
 * (AIM 7-1-5(b)(1), (b)(2)).
 * The findings are the planner's; the decision is the pilot in command's
 * (14 CFR 91.3), and the line says so.
 *
 * Worked out and put together by the shared engine (gonogo_brief, engine/crates/brief/src/gonogo/brief.rs,
 * through lib/engine), the very code behind the planner's POST
 * /api/go-no-go and the phones' `call`: the rules, their words and
 * their sources live there. Only the shapes are made here.
 */
import { create } from "zustand";
import { callEngine, type EngineInput } from "./engine/engine";
import type { Finding } from "./findings";

/** Where a finding is shown in full: a tab of the planning panel, and a
 *  section of it by its title. */
export interface Where {
  tab: "preflight" | "depart" | "enroute" | "arrive";
  section?: string;
}

export interface VerdictItem extends Where {
  key: "weather" | "airspace" | "altitude" | "oxygen" | "fuel" | "runways" | "balance" | "risk" | "fields";
  label: string;
  finding: Finding;
  /** What was found, in a line. */
  detail: string;
}

export interface VerdictInput {
  weather: {
    /** The briefing is still being fetched, or failed (its words). */
    pending: boolean;
    failed: string | null;
    /** AIM 7-1-5's "VFR flight not recommended", its reasons. */
    vfrNotRecommended: string[];
    /** Under the pilot's own minimums (lib/minimums). */
    underMinimums: string[];
    /** Under IFR, icing possible at an altitude flown (features/brief/icing), in a
     *  line. */
    icing?: string | null;
    /** The SIGMETs and G-AIRMETs along the route, by name. */
    hazards: string[];
    /** The sources that did not answer, by name. */
    unchecked: string[];
    /** The worst the forecast says along the route, in words. */
    worst: string | null;
    /** The ITWS alerts in force now at the route's airports, each in its
     *  words with its airport (lib/liveReports). */
    terminalAlerts?: string[];
    /** The Command Center's programs at the route's airports, in words:
     *  a finding under IFR only (`ifr`). */
    flowPrograms?: string[];
    ifr?: boolean;
  };
  airspace: {
    pending: boolean;
    /** tfr.faa.gov did not answer. */
    unchecked: boolean;
    /** TFRs the route goes through while in force when it gets there. */
    inForce: string[];
    /** TFRs near the route that are not. */
    near: number;
    /** Special-use areas the legs cross, as their times of use read for
     *  the pass (features/plan/passTimes), or as SFDPS says they are now
     *  (active-now, cold-now: lib/liveReports). */
    specialUse: { name: string; when: "active" | "not-scheduled" | "by-notam" | "unknown" | "active-now" | "cold-now" }[];
  };
  altitude: {
    pending: boolean;
    /** No VFR altitude fits, in a line. */
    problem: string | null;
    /** A pilot's own altitude's broken rules (AltitudeCaution). */
    cautions: string[];
    /** The altitude flown, as the FL chip says it. */
    flown: string | null;
    /** The highest the nav log flies, feet MSL, for the engine's oxygen
     *  finding (14 CFR 91.211(a)); null before it. */
    highestFt?: number | null;
    /** The airplane carries oxygen or a pressurised cabin. */
    oxygen?: boolean;
  };
  fuel: {
    pending: boolean;
    /** The least the tanks hold over the fuel and its reserve, any flight
     *  of the route; null where the usable fuel is not known. */
    marginGal: number | null;
    requiredGal: number | null;
    reserveMin: number | null;
    /** Under IFR: the reserve is 14 CFR 91.167's, not 91.151's. */
    ifr?: boolean;
  };
  runways: {
    pending: boolean;
    /** Not worked out: no POH tables for this airplane. */
    worked: boolean;
    short: string[];
    crosswind: string[];
    /** Fields whose distances were read past the POH's table. */
    beyond: string[];
    /** Fields whose distances could not be held to the runway: its length
     *  or the field's elevation not known. */
    unchecked: string[];
  };
  balance: {
    pending: boolean;
    worked: boolean;
    /** The airplane has a POH loading but the pilot set no load: the
     *  engine's no_load, "give your load" (14 CFR 91.9(a), 91.103). */
    noLoad?: boolean;
    problems: string[];
    takeoff: string | null;
  };
  risk: { level: "low" | "caution" | "high"; line: string } | null;
}

/** The input as the engine reads it, the planner's VerdictInput in
 *  snake_case. */
function engineInput({ weather, airspace, altitude, fuel, runways, balance, risk }: VerdictInput) {
  return {
    weather: {
      pending: weather.pending,
      failed: weather.failed,
      vfr_not_recommended: weather.vfrNotRecommended,
      under_minimums: weather.underMinimums,
      icing: weather.icing ?? null,
      hazards: weather.hazards,
      unchecked: weather.unchecked,
      worst: weather.worst,
      terminal_alerts: weather.terminalAlerts ?? [],
      flow_programs: weather.flowPrograms ?? [],
      ifr: weather.ifr ?? false,
    },
    airspace: {
      pending: airspace.pending,
      unchecked: airspace.unchecked,
      in_force: airspace.inForce,
      near: airspace.near,
      special_use: airspace.specialUse,
    },
    altitude: {
      pending: altitude.pending,
      problem: altitude.problem,
      cautions: altitude.cautions,
      flown: altitude.flown,
      highest_ft: altitude.highestFt ?? null,
      oxygen: altitude.oxygen ?? false,
    },
    fuel: {
      pending: fuel.pending,
      margin_gal: fuel.marginGal,
      required_gal: fuel.requiredGal,
      reserve_min: fuel.reserveMin,
      ifr: fuel.ifr ?? false,
    },
    runways,
    balance: {
      pending: balance.pending,
      worked: balance.worked,
      no_load: balance.noLoad ?? false,
      problems: balance.problems,
      takeoff: balance.takeoff,
    },
    risk,
  };
}

/** What the Go / No-Go comes to: the findings and the line over them. */
export interface Verdict {
  items: VerdictItem[];
  line: { finding: Finding; words: string };
}

/**
 * The Brief's Go / No-Go put together by the engine (gonogo_brief): each
 * tab's finding in the order a pilot goes through them, the IFR
 * alternate's in the weather's (`alternate`, /api/alternate's answer,
 * undefined while it is awaited), the fields row for a closed, private or
 * military-only field (`fields`, useRouteFields), the airplane's findings
 * left out where none is picked, and the line over them.
 */
export function briefVerdict({
  input,
  alternate,
  fields,
  airplane,
}: {
  input: VerdictInput;
  alternate?: EngineInput<"gonogo_brief">["alternate"];
  fields?: EngineInput<"gonogo_brief">["fields"];
  airplane: boolean;
}): Verdict {
  // The engine's items are plain strings; its keys, tabs and findings are
  // the ones VerdictItem names (gonogo/verdict.rs verdict_items).
  return callEngine("gonogo_brief", {
    verdict: engineInput(input),
    alternate: alternate ?? null,
    fields: fields ?? null,
    airplane,
  }) as Verdict;
}

/** The findings for the flight on screen, published once (as the risk
 *  is, lib/frat) for the tabs' marks. */
export const useVerdict = create<{ items: VerdictItem[]; line: Verdict["line"] | null; set: (verdict: Verdict | null) => void }>((set) => ({
  items: [],
  line: null,
  set: (verdict) => set({ items: verdict?.items ?? [], line: verdict?.line ?? null }),
}));
