import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { useQueries } from "@tanstack/react-query";
import { callEngine } from "../../lib/engine/engine";
import { useWindPicks, legOf, type NavLogRow, type Landing, type ProcedureAirport, type ProcedureKind } from "../plan";
import type { ProcedureList, ProcedureSummary } from "../../lib/api/types";
import { plateQuery, proceduresQuery } from "../../lib/queryClient";
import { approachRunway, sameField, type PickedProcedure } from "../../lib/procedures";
import { useOwnShip } from "../../lib/map/position/ownShip";
import { useFuelStops } from "./useFuelStops";
import { cycleDate } from "./procedureWords";
import { useRouteSheets } from "./useRouteSheets";
import { useFieldWinds } from "./useFieldWinds";
import { tanksAt } from "./routeTanks";
import type { ProceduresAt, ProceduresRouteProps } from "./routeProps";

type Kind = ProcedureKind;

/** The FAA's chart codes in a field's d-TPP for each kind (its card's
 *  terminal charts, wingtip.publications, as the d-TPP metafile's chart_code
 *  has them): an instrument approach procedure, a STAR ("STR"), a
 *  departure procedure (a SID or a graphic obstacle departure) or a
 *  textual one. */
const CHART_CODES: Record<Kind, string[]> = { approach: ["IAP"], arrival: ["STR"], departure: ["DP", "ODP"] };

/** A day, min: the longest time on the ground at a stop the planner takes. */
export const DAY_MIN = 24 * 60;

/** The runway lines opened from their fold (PatternChips), by field
 *  ("KMSN:" and the line's label): open until folded, by their head or a
 *  runway picked, or with their field (toggleField), at the owner's ask
 *  ("Keep the routes and runway opened until folded … fold them when the
 *  whole airport is collapsed", 2026-10-28), where they folded after two
 *  seconds untouched. */
export const useOpenRunwayLines = create<{ open: string[] }>(() => ({ open: [] }));

/** A runway line opened or folded, by its key: in the list once at most. */
export const setRunwayLine = (key: string, open: boolean) =>
  useOpenRunwayLines.setState((s) => ({
    open: open ? (s.open.includes(key) ? s.open : [...s.open, key]) : s.open.filter((k) => k !== key),
  }));

/** The route's fields toggled from how they start -- folded to one row --
 *  by their part and field ("Stop:KMSN"): kept while the page is, as the
 *  list is drawn again. A field folded folds its runway lines with it
 *  (`ident`), so it opens again with its runway picked showing. */
const useToggledFields = create<{ toggled: string[] }>(() => ({ toggled: [] }));
export const toggleField = (key: string, ident: string, opening: boolean) => {
  useToggledFields.setState((s) => ({ toggled: s.toggled.includes(key) ? s.toggled.filter((k) => k !== key) : [...s.toggled, key] }));
  if (!opening) useOpenRunwayLines.setState((s) => ({ open: s.open.filter((k) => !k.startsWith(`${ident}:`)) }));
};

/** Whether the fields start opened: the browser specs' (localStorage
 *  "wingtip.fieldsOpen", as the signed-in session they share keeps it), which
 *  work on the steps' runways and procedures. Folded otherwise. */
function fieldsOpenAtFirst(): boolean {
  try {
    return globalThis.localStorage?.getItem("wingtip.fieldsOpen") === "1";
  } catch {
    return false;
  }
}

/**
 * FPL's route list's view model (ProceduresRoute): the procedures sheet's
 * place and page, the dialogs open, each field's procedures, card and
 * forecast wind asked for, the runways picked into the wind for the pilot,
 * and the fuel in the tanks at each point. The list itself is drawn by
 * ProceduresRoute and its parts (features/procedures).
 */
export function useProceduresRoute(props: ProceduresRouteProps) {
  const {
    airports,
    rows,
    depart,
    picked,
    onPick,
    onPreselect,
    takeoffs,
    onPreselectTakeoff,
    autoPicked,
    procedures,
    inRoute,
    onProcedures,
    at,
    onAt,
    directTo = null,
    askHold = null,
    holds,
    routePoints,
    stopsFull = false,
    fuel = null,
    tanks: ownTanks,
    routeLine = null,
  } = props;
  // The procedure on its own page in the sheet, over its kind's list.
  const [page, setPage] = useState<{ at: ProceduresAt; procedure: ProcedureSummary } | null>(null);
  // What the sheet shows, kept as it eases away: its title went back to
  // "Procedures" and its page to nothing as it was put away.
  const [kept, setKept] = useState<ProceduresAt>(at);
  if (at && at !== kept) setKept(at);
  const on = at ?? kept;
  const procedure = page && page.at === on ? page.procedure : null;
  // The sheets the list opens over it, one at a time (useRouteSheets).
  const sheets = useRouteSheets({ holds, rows, askHold });
  // Where the airplane is known (own ship, or the dry run's): Direct to
  // goes from there.
  const positioned = useOwnShip((s) => s.enabled && !!s.fix);
  // What the planner made of each hold (plan.with_holds), on the leg it is
  // flown on: its entry, minutes and fuel.
  const heldAs = (ident: string) =>
    rows.map((r) => (r.kind === "departure" ? undefined : r.leg?.hold)).find((h) => h && sameField(h.fix, ident)) ?? null;
  // Each field's procedures, asked for as its kind's sheet opens -- not
  // with the route: the FAA's file is 53 MB, fetched on its first ask --
  // and said in the list from then on.
  // Asked for as a field's menu opens too (ProcedureMenu).
  const [asked, setAsked] = useState<ReadonlySet<string>>(() => new Set());
  const ask = (ident: string) => {
    if (!asked.has(ident)) setAsked(new Set([...asked, ident]));
  };
  const lists = useQueries({
    queries: airports.map((a) => ({
      ...proceduresQuery(a.ident),
      enabled: (at != null && sameField(at.ident, a.ident)) || asked.has(a.ident),
    })),
  });
  // Each field's wind, reported or forecast for when the airplane is there
  // (useFieldWinds).
  const winds = useFieldWinds({ airports, rows, depart });
  const { cards, forecastFor, forecasts, windOf } = winds;
  // Each field's approach in the route, and whether its plate publishes
  // circling minimums -- the one plate the map draws (PlatesGl).
  const approachesIn = inRoute.filter((p) => p.kind === "approach");
  const plates = useQueries({ queries: approachesIn.map((p) => plateQuery(p.ident, p.id)) });
  const landingOf = (ident: string): Landing | null => {
    const i = approachesIn.findIndex((p) => sameField(p.ident, ident));
    return i < 0 ? null : { runway: approachesIn[i]!.runway, circling: plates[i]?.data?.circling, name: approachesIn[i]!.label };
  };
  const listOf = (ident: string): ProcedureList | undefined => lists[airports.findIndex((a) => sameField(a.ident, ident))]?.data;
  // Whether a field has procedures of a kind: by its procedures once they
  // are in (its kind's sheet opened), else by the FAA's charts its card
  // lists (d-TPP), which come with the route -- the CIFP's 53 MB is not
  // fetched for that. Not yet known, not offered: no room taken for a
  // kind a field does not have (the owner's cleanup).
  const hasKind = (ident: string, kind: Kind): boolean => {
    const i = airports.findIndex((a) => sameField(a.ident, ident));
    // Either says so: the list coming in as a menu opens takes no menu
    // away from under the finger where the CIFP has none the FAA charts.
    return (
      !!lists[i]?.data?.procedures.some((p) => p.kind === kind) ||
      (cards[i]?.data?.procedures.some((c) => CHART_CODES[kind].includes(c.kind)) ?? false)
    );
  };
  const kindOf = (p: PickedProcedure) => listOf(p.ident)?.procedures.find((q) => q.id === p.id)?.kind;
  const pickOf = (ident: string, kind: Kind) => procedures.find((p) => sameField(p.ident, ident) && kindOf(p) === kind) ?? null;
  // One of a kind at a field: a new pick there takes the old one's place.
  const pick = (ident: string, kind: Kind, next: { id: string; transition: string | null; direct?: string | null } | null) => {
    const kept = procedures.filter((p) => !(sameField(p.ident, ident) && kindOf(p) === kind));
    const made = next ? { ident, ...next } : null;
    onProcedures(made ? [...kept, made] : kept, made);
    // An approach picked lands on its own runway: the field's runway chip
    // goes to it, kept in step with the approach (at the owner's ask);
    // another only by circling (PatternChips).
    const name = next && kind === "approach" ? listOf(ident)?.procedures.find((q) => q.id === next.id)?.name : undefined;
    const runway = name ? approachRunway(name) : null;
    if (runway) onPick(ident, runway);
  };
  const close = () => onAt(null);
  // The runway picked at a field, and a stop's to leave from.
  const chosenAt = (ident: string) => picked.get(ident) ?? null;
  const takeoffAt = (ident: string) => takeoffs.get(ident) ?? null;
  // Each field of the route, its runway picked into the wind until the
  // pilot picks one or none, at the owner's ask ("a preselected runway into
  // the wind", "Departing runway should also be pre selected"): most fly
  // the runway ATC gives them with no approach, so no approach is picked.
  // Once a field, so a runway picked and taken back is not picked again
  // under the pilot's finger.
  const preselected = useRef(new Set<string>());
  const toggled = useToggledFields((st) => st.toggled);
  const [openAtFirst] = useState(fieldsOpenAtFirst);
  const isOpen = (key: string) => openAtFirst !== toggled.includes(key);
  const isFuelStop = useFuelStops();
  // The runway lines opened from their fold (PatternChips), for what sits
  // beside a folded one.
  const openLines = useOpenRunwayLines((st) => st.open);
  // A field listed twice (a round trip) picks its landing's runway once.
  const preselectedLand = (a: ProcedureAirport) => airports.findIndex((b) => sameField(b.ident, a.ident)) !== airports.indexOf(a);
  const intoWind = airports
    .flatMap((a, i) => {
      // A forecast still coming is waited for, not picked past on the wind now.
      if (forecastFor[i] != null && forecasts[i]?.isPending) return [];
      const wind = windOf(a.ident);
      // Calm, the runway in use or the longest (windPick), as the owner asked.
      if (!wind || !wind.ident) return [];
      // One picked into the wind before, and not by the pilot since, goes to
      // the runway the wind now favours (`autoPicked`).
      const free = (which: string, now: string | undefined) =>
        now === undefined || (autoPicked.has(`${which}:${a.ident}`) && now !== wind.ident);
      return [
        ...(!free("land", picked.get(a.ident)) || landingOf(a.ident) || preselectedLand(a) ? [] : [`land:${a.ident}:${wind.ident}`]),
        // A stop's runway to leave from, into the wind as its landing's.
        ...((a.role !== "Stop" &&
          !(a.role === "Departure" && airports.some((b) => b !== a && b.role === "Destination" && sameField(b.ident, a.ident)))) ||
        !free("takeoff", takeoffs.get(a.ident))
          ? []
          : [`takeoff:${a.ident}:${wind.ident}`]),
      ];
    })
    .join(",");
  // Save waits while a field's wind is still coming (features/plan/windPicks): its
  // runway is picked into it as it comes, and the route planned again.
  const windComing = airports.some((_, i) => (forecastFor[i] != null ? forecasts[i]?.isPending : cards[i]?.isPending) ?? false);
  useEffect(() => () => useWindPicks.setState({ pending: false }), []);
  useEffect(() => {
    let picking = false;
    for (const pick of intoWind ? intoWind.split(",") : []) {
      const [which, ident, end] = pick.split(":") as [string, string, string];
      // Once a field, and once more each time the wind turns a runway
      // picked into it: never again where the pilot took one back.
      const once = autoPicked.has(`${which}:${ident}`) ? `${which}:${ident}:${end}` : `${which}:${ident}`;
      if (preselected.current.has(once)) continue;
      preselected.current.add(once);
      picking = true;
      if (which === "land") onPreselect(ident, end);
      else onPreselectTakeoff(ident, end);
    }
    // Still pending while a pick just made is on its way into the address,
    // so Save does not keep the plan from before it (features/plan/windPicks);
    // the render that brings it runs this again. Never held for good: a
    // pick that does not land lets go after a second.
    useWindPicks.setState({ pending: windComing || picking });
    if (!picking) return;
    const letGo = window.setTimeout(() => useWindPicks.setState({ pending: false }), 1000);
    return () => window.clearTimeout(letGo);
  }, [intoWind, autoPicked, onPreselect, onPreselectTakeoff, windComing, picked, takeoffs]);
  const destination = airports.find((a) => a.role === "Destination");
  // How far along the route each row is, nm: what its line under its name
  // says, as mock A of the owner's rows has it ("Stop · 241 nm").
  // The running sum of the rows' miles is the engine's (nm_along).
  const sums = callEngine("nm_along", { legs_nm: rows.map((r) => legOf(r)?.distance_nm ?? null) });
  const alongNm = new Map(rows.map((r, i) => [r.key, sums[i] ?? 0]));
  const along = (row: NavLogRow | undefined) => {
    const nm = row ? alongNm.get(row.key) : undefined;
    return nm ? ` · ${Math.round(nm)} nm` : "";
  };
  // A field's place among the typed points, for its grip and Add a Stop
  // After: the departure first, the destination last (a round trip's
  // field is both, by its role), a stop its own place between them.
  const pointIndex = (ident: string, role: ProcedureAirport["role"]) => {
    if (!routePoints.length) return undefined;
    if (role === "Departure") return 0;
    if (role === "Destination") return routePoints.length - 1;
    const found = routePoints.findIndex((p, j) => j > 0 && j < routePoints.length - 1 && sameField(p, ident));
    return found >= 0 ? found : undefined;
  };
  const tanks = tanksAt(rows, fuel, ownTanks);
  const points = rows.filter((r) => r.kind !== "checkpoint" && r.kind !== "toc" && r.kind !== "tod");
  const field = on ? airports.find((a) => sameField(a.ident, on.ident)) : undefined;
  const list = on ? listOf(on.ident) : undefined;
  const chosen = on ? pickOf(on.ident, on.kind) : null;
  // The procedure asked for by voice, its page once the field's list is
  // in: the first of that kind whose name starts as the approach does, on
  // the runway said where one was. Set as the sheet renders, as `kept`
  // is above; once set, the page is this address's and it is not again.
  const wanted =
    on?.pick && list && !(page && page.at === on)
      ? (list.procedures
          .filter((p) => p.kind === on.kind && p.name.toUpperCase().startsWith(on.pick!.approach))
          .find((p) => !on.pick!.runway || p.runway === on.pick!.runway) ?? null)
      : null;
  if (wanted && on) setPage({ at: on, procedure: wanted });
  const stale = list?.stale ? `Out of date: the ${cycleDate(list.cycle)} cycle, as the current one could not be had` : null;

  return {
    ...props,
    directTo,
    askHold,
    stopsFull,
    fuel,
    routeLine,
    page,
    setPage,
    on,
    procedure,
    ...sheets,
    heldAs,
    positioned,
    lists,
    ...winds,
    ask,
    landingOf,
    hasKind,
    pickOf,
    pick,
    close,
    chosenAt,
    takeoffAt,
    isOpen,
    openAtFirst,
    isFuelStop,
    openLines,
    destination,
    along,
    pointIndex,
    tanks,
    points,
    field,
    list,
    chosen,
    stale,
  };
}

/** FPL's route list's view model, as its parts read it. */
export type ProceduresRouteModel = ReturnType<typeof useProceduresRoute>;
