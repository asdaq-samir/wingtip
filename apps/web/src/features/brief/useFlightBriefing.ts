import { useAirplaneChosen } from "../../lib/preferences";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Briefing, Course, Leg, NavLogAltitude, Totals } from "../../lib/api/types";
import { arrivalMin, type BriefingState, useLoad, callSign, type BriefingPart } from "../plan";
import { localDay } from "../../lib/format";
import { underMinimums } from "../../lib/minimums";
import { usePreferences } from "../../lib/preferences";
import { gairmetTitle, sigmetHazard } from "../../lib/advisories";
import { useRunwayPicks, usePrinting } from "../plan/lazy";
import { useRouteAirspace } from "./useRouteAirspace";
import { runwayChecks } from "./runwayCheck";
import { briefVerdict, useVerdict } from "../../lib/verdict";
import { useGlance, type BriefGlance } from "./glance";
import { shortName } from "../../lib/aircraftChoice";
import type { FiledProcedure } from "./flightPlanForm";
import { planFormsOf } from "./planForms";
import { useAlternate, useAlternateWhere } from "./useAlternate";
import { useRouteFields } from "./useRouteFields";
import { flowQuery, itwsQuery } from "../../lib/liveReports";
import { icingFindings } from "./icing";
import { useIcingForecast } from "./useIcingForecast";
import { assess, riskLine, useRisk } from "../../lib/frat";
import { callEngine } from "../../lib/engine/engine";
import { briefingPendingMessage, windStretches } from "./briefingFigures";
import { verdictInput } from "./verdictInput";
import { buildGlance } from "./buildGlance";
import { usePublished } from "./usePublished";
import { useOwnAircraft } from "./useOwnAircraft";

const NO_STOPS: string[] = [];

interface FlightBriefingInputs {
  /** Which of the panel's tabs this is drawn in (FlightBriefingView). */
  part: BriefingPart | null;
  /** The one instance that publishes the risk, the findings and the glance. */
  publish?: boolean;
  nav: NavLogAltitude | null;
  legs: Leg[];
  dep: string;
  dest: string;
  stops?: string[];
  route?: string[];
  procedures?: { departure: FiledProcedure | null; arrival: FiledProcedure | null };
  course?: Course | null;
  totals?: Totals | null;
  depart?: string;
  briefing: BriefingState;
  problem?: string | null;
}

/**
 * The briefing's view model (FlightBriefingView): what each part of the
 * briefing reads, worked out from the plan and the briefing fetched, and
 * the risk assessment, the Go / No-Go's findings and the Brief's glance
 * published by the one instance outside the tabs (`publish`).
 */
export function useFlightBriefing({
  part,
  publish = false,
  nav,
  legs,
  dep,
  dest,
  stops = NO_STOPS,
  route = NO_STOPS,
  procedures,
  course = null,
  totals = null,
  depart = "",
  briefing: briefingState,
  problem = null,
}: FlightBriefingInputs) {
  // The load's weights, for the takeoff and landing distances.
  const { loading, saved, result: loaded } = useLoad(nav?.aircraft, totals?.fuel_gal ?? null);
  // The runways the pilot picked in FPL, checked for length (runwayFlown).
  const picks = useRunwayPicks();
  // Every airport the flight lands at, each once: a round trip's
  // departure is its destination.
  const landings = [...new Set([dep, ...stops, dest])];
  const stretches = windStretches(legs);
  // "VFR flight not recommended" (AIM 7-1-5) and its reasons are the
  // planner's call (wingtip.weather), made against 14 CFR 91.155's minimums
  // in one place; this page states them.
  const briefing = briefingState.state === "ready" ? briefingState.data : null;
  const failed = briefingState.state === "failed" ? briefingState.detail : null;
  const ifr = usePreferences((p) => p.flightRules) === "ifr";
  const unchecked = (source: Briefing["weather_unavailable"][number]) => briefing?.weather_unavailable.includes(source) ?? false;

  // Where the weather is under the pilot's own minimums (lib/minimums).
  const minimums = usePreferences((s) => s.minimums);
  const underMine = briefing ? underMinimums(minimums, briefing, landings, dest) : [];
  // The time the page was opened, for "Now" where no departure is picked.
  const [opened] = useState(() => new Date().toISOString());
  const { passAt, specialUse } = useRouteAirspace({ nav, legs, depart: depart || opened });
  // What SWIM says now at the route's airports: the ITWS alerts and,
  // under IFR, the Command Center's ground stops and delay programs, for
  // the Go / No-Go's weather finding (the engine's verdict).
  const { data: itwsNow } = useQuery(itwsQuery(landings));
  const { data: flowNow } = useQuery(flowQuery(ifr ? landings : []));
  // The call sign the radio calls use: the pilot's own airplane's
  // registration where they fly one, and its make from its profile.
  const flying = usePreferences((s) => s.aircraft);
  const make = nav?.aircraft?.type?.split(" ")[0] || "Airplane";
  const ownCallSign = callSign(make, flying.aircraftId != null ? shortName(flying.label) : null);
  // The risk assessment (lib/frat): the briefing's, the nav log's and the
  // logbook's factors, and what the pilot ticks. Published for the Save
  // button, which files it with the flight.
  const own = useOwnAircraft();
  const { currency, flownOwn } = own;
  const ticked = useRisk((s) => s.ticked);
  const setAssessment = useRisk((s) => s.setAssessment);
  const hazardNames = briefing
    ? [...briefing.hazards.map((h) => sigmetHazard(h.hazard, h.type ?? "SIGMET")), ...briefing.gairmets.map(gairmetTitle)]
    : [];
  // The route's own figures, the engine's, the planner's verdict's too
  // (gonogo_route_figures; AV-12): the fuel's; the TFRs crossed while in
  // force as the flight gets there, half an hour either way, by the
  // planner's word where it placed them on the legs (14 CFR 91.137-91.145);
  // VFR not recommended's reasons, none under IFR, whose weather check is
  // 91.169's; and the hazards the risk counts, none where both sources failed.
  const routeFigures = callEngine("gonogo_route_figures", {
    totals: totals ?? null,
    tfrs: briefing?.tfrs ?? [],
    legs: legs.map((l) => ({ distance_nm: l.distance_nm, ete_min: l.ete_min ?? null })),
    depart_us: new Date(depart || opened).getTime() * 1000,
    ifr,
    vfr_not_recommended: briefing?.vfr_not_recommended ?? [],
    hazards: hazardNames,
    weather_unavailable: briefing?.weather_unavailable ?? [],
  });
  const vnrReasons = routeFigures.vfr_not_recommended;
  const inForce = new Set(routeFigures.tfrs_in_force);
  const tfrInForce = (t: Briefing["tfrs"][number]) => inForce.has(t.notam_id);
  const tfrsCrossed = briefing?.tfrs.filter(tfrInForce) ?? [];
  const leastMarginGal = routeFigures.least_margin_gal;
  // Under IFR, the AWC's forecast icing (CIP and FIP) on each leg at the
  // altitude flown (useIcingForecast); a forecast not had is said unchecked.
  const icingForecast = useIcingForecast({ ifr, briefing, legs, depart });
  // The icing finding's lines, the engine's, in its order (lib/icing).
  const { icing, lines: icingLines } = icingFindings({
    ifr,
    nav,
    legs,
    briefing,
    fields: landings,
    forecastLine: icingForecast.data?.line,
  });
  const assessment = briefing
    ? assess({
        vfrNotRecommended: vnrReasons.length > 0,
        underMinimums: underMine,
        tfrOnRoute: tfrsCrossed.length > 0,
        hazards: routeFigures.hazard_count,
        night: totals?.night === true,
        nightPassengers: totals?.night_passengers,
        lights: totals?.lights,
        fuelMarginGal: leastMarginGal,
        ifr,
        vorCheck:
          flownOwn === undefined
            ? undefined
            : flownOwn.vorCheck
              ? { goodThrough: flownOwn.vorCheck.goodThrough, withinLimit: flownOwn.vorCheck.withinLimit }
              : null,
        inspections: flownOwn?.inspections,
        squawks: flownOwn?.openSquawks,
        currency: currency ?? null,
        day: localDay(new Date(depart || opened)),
        ticked,
      })
    : null;
  const assessmentKey = assessment ? `${assessment.level}:${assessment.score}:${assessment.factors.map((f) => f.key).join(",")}` : "";
  usePublished(assessment, assessmentKey, setAssessment, publish);
  // The runway check at each field (features/brief/runwayCheck), for the
  // Performance tab and the Go / No-Go.
  const checks = runwayChecks(nav?.aircraft, briefing, course, loaded?.takeoff.weightLb ?? null, loaded?.landing.weightLb ?? null, picks);
  // Under IFR, the alternate (AlternateSection): its ETA the nav log's.
  const etaIso = totals?.ete_min != null ? new Date(new Date(depart || opened).getTime() + totals.ete_min * 60_000).toISOString() : null;
  const alternateWhere = useAlternateWhere(dest, ifr ? etaIso : null, nav?.aircraft?.cruise_tas_kt ?? null);
  const alternateCheck = useAlternate(alternateWhere);
  // The fields the route lands at, for the Go / No-Go's fields row and the flight plan's ZZZZ.
  const fields = useRouteFields(dep, stops, dest, totals?.alternate?.ident ?? null);
  // No airplane picked: the engine judges none of an airplane's findings on one assumed (the owner, 2026-11-08).
  const airplane = useAirplaneChosen();
  // The Go / No-Go put together by the engine (gonogo_brief): the tabs' findings, the alternate's, the fields row.
  const verdict = briefVerdict({
    alternate: alternateCheck.data,
    fields: fields.uses,
    airplane,
    risk: assessment ? { level: assessment.level, line: riskLine(assessment) } : null,
    facts: verdictInput({
      briefing,
      failed,
      ifr,
      landings,
      underMine,
      icingLines,
      icingError: icingForecast.isError,
      hazardNames,
      itwsAlerts: itwsNow?.alerts,
      flowPrograms: flowNow?.programs,
      routeFigures,
      specialUse: specialUse.map(({ area, when }) => ({ name: area.name, when })),
      nav,
      problem,
      legs,
      checks,
      loading,
      loaded,
      totals,
    }),
  });
  const { items } = verdict;
  // Published once, for the tabs' marks (PlanWorkspace) and the Brief, as the risk is.
  const setVerdict = useVerdict((v) => v.set);
  const itemsKey = items.map((i) => `${i.key}:${i.finding}:${i.detail}`).join("|");
  usePublished(verdict, itemsKey, setVerdict, publish);

  // The Brief's glance (features/brief/glance): each part of the flight in a few
  // figures, from what the pages say -- the runway checks, the radio's
  // first call, the forecast at each field and along the way -- published
  // by the one instance outside the pages, as the findings are.
  const glance: BriefGlance | null = publish
    ? buildGlance({
        briefing,
        course,
        legs,
        landings,
        dep,
        dest,
        leaving: new Date(depart || opened),
        eteMin: totals?.ete_min ?? null,
        arriveMin: arrivalMin(totals),
        checks,
        picks,
        ownCallSign,
        items,
        leastMarginGal,
        loaded,
      })
    : null;
  const setGlance = useGlance((g) => g.set);
  const glanceKey = glance ? JSON.stringify(glance) : "";
  usePublished(glance, glanceKey, setGlance, publish);

  // Preflight's sections a tile opens and the paperwork, folded on screen under the
  // checks (BriefChecks), each opened by its tile or its title; on paper, laid open.
  const printing = usePrinting();
  const [folds, setFolds] = useState<string[]>([]);

  // Only for Preflight, which shows the forms.
  const planForms =
    part === "preflight"
      ? planFormsOf({
          ifr,
          dep,
          dest,
          route,
          stops,
          course,
          legs,
          totals,
          depart,
          opened,
          flying,
          nav,
          own,
          // The load the pilot saved, never the editor's sample airplane:
          // with none, item 19's endurance is left for them to fill.
          load: saved,
          icaoIds: fields.icaoIds,
          procedures,
        })
      : [];

  return {
    briefing,
    ifr,
    vnrReasons,
    briefingPendingMessage: briefingPendingMessage(briefingState),
    /** The briefing is on its way: its parts show its shape, not a line. */
    briefingComing: briefingState.state === "loading",
    unchecked,
    underMine,
    opened,
    passAt,
    tfrInForce,
    tfrsCrossed,
    specialUse,
    landings,
    stretches,
    ownCallSign,
    assessment,
    icing,
    icingForecast,
    hazardNames,
    loaded,
    items,
    line: verdict.line,
    alternateWhere,
    printing,
    folds,
    setFolds,
    planForms,
  };
}

/** The briefing's view model, as its parts read it. */
export type FlightBriefing = ReturnType<typeof useFlightBriefing>;
