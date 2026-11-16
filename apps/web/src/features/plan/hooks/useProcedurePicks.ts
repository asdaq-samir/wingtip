import { useCallback, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { Address, SetAddress } from "../../../lib/address";
import type { ProcedureDrawing } from "../../../lib/api/types";
import { altitudesOf, altitudesParam } from "../../../lib/identSchema";
import { feel } from "../../../lib/haptics";
import { showError } from "../../../lib/problems";
import {
  approachRunway,
  proceduresOf,
  proceduresParam,
  sameField,
  transitionWords,
  typedProcedure,
  type PickedProcedure,
  type TypedProcedure,
} from "../../../lib/procedures";
import { procedureQuery, proceduresQuery, queryClient } from "../../../lib/queryClient";
import type { TrafficPattern } from "../../../lib/trafficPattern";
import type { OpenFix } from "../components/FixCard";
import type { ProcedureAirport, ProceduresAt } from "../components/ProceduresRoute";
import type { RouteProcedure } from "../components/RouteBox";
import { routeBeforeDirect, type PlannedRoute } from "./planAddress";

/** The procedures drawn, the queries that have answered. */
export const drawnOnly = (results: { data?: ProcedureDrawing }[]) => results.flatMap((r) => (r.data ? [r.data] : []));

/**
 * The instrument procedures picked for the route's fields
 * (usePlanWorkspace), kept in the address ("KBUR:I08-Y:LAX",
 * lib/procedures): picked, typed in the route box, drawn, previewed in
 * their sheet, a fix's card opened with its Direct to and its crossing
 * altitude, and those filed in the flight plan.
 */
export function useProcedurePicks({
  planned,
  address,
  setAddress,
  procedureAirports,
  crossings,
  patterns,
}: {
  planned: PlannedRoute;
  address: Address;
  setAddress: SetAddress;
  procedureAirports: ProcedureAirport[];
  /** The altitudes ATC gave to cross the procedures' fixes at (`cross`). */
  crossings: Record<string, number>;
  /** The patterns drawn at the route's fields (useFieldPatterns). */
  patterns: TrafficPattern[];
}) {
  // The instrument procedures picked for the route's fields, kept in the
  // address too: "KBUR:I08-Y:LAX" (lib/procedures).
  const procedureParam = address.procs;
  const pickedProcedures = useMemo(() => proceduresOf(procedureParam), [procedureParam]);
  // The procedure just picked, for the map to go to it once it is drawn.
  const [procedureFocus, setProcedureFocus] = useState<string | null>(null);
  const pickProcedures = useCallback(
    // The picks, or how to make them from the address's as they are now.
    (picks: PickedProcedure[] | ((now: PickedProcedure[]) => PickedProcedure[]), picked: PickedProcedure | null) => {
      if (picked) setProcedureFocus(`${proceduresParam([picked])}@${Date.now()}`);
      void setAddress((prev) => {
        const next = typeof picks === "function" ? picks(proceduresOf(prev.procs)) : picks;
        // One direct at a time: sent direct to a procedure's fix, a Direct to
        // a point of the route is given back (directToPoint).
        const undo = next.some((p) => p.direct) ? routeBeforeDirect(prev) : {};
        return { ...undo, procs: next.length ? proceduresParam(next) : null };
      });
    },
    [setAddress],
  );
  // A SID or a STAR typed in the route box among its points ("KMSP BAEE1
  // BAE ... OSHH2 KATW", as a clearance or a filed route is written):
  // picked as its field's departure or arrival, by its transition where the
  // point beside it is one, in place of that field's pick of the kind; one
  // neither field publishes said in an alert, as a failed tap is.
  const typeProcedures = useCallback(
    async (typed: TypedProcedure[], route: { dep: string; dest: string }) => {
      const list = (ident: string) => queryClient.fetchQuery(proceduresQuery(ident));
      const found = await Promise.all(typed.map((t) => typedProcedure(t, route, list)));
      // Onto the picks as the address has them once the lists are in.
      const hits = found.flatMap((hit) => (hit ? [hit] : []));
      const last = hits.at(-1)?.picked ?? null;
      const withHits = (now: PickedProcedure[]) =>
        hits.reduce((next, hit) => {
          const kindOf = (id: string) => hit.list.procedures.find((p) => p.id === id)?.kind;
          return [...next.filter((p) => !(sameField(p.ident, hit.picked.ident) && kindOf(p.id) === hit.kind)), hit.picked];
        }, now);
      if (last) pickProcedures(withHits, last);
      const missed = typed.filter((_, i) => !found[i]).map((t) => t.name);
      if (missed.length) {
        showError(
          `${missed.join(" and ")} ${missed.length > 1 ? "are" : "is"} not a departure from ${route.dep || "the departure"} or an arrival into ${route.dest || "the destination"}`,
          "A SID is typed after the departure and a STAR before the destination, as in a filed route.",
        );
      }
    },
    [pickProcedures],
  );
  // Theirs as the planner draws them (wingtip.procedures), for the route's
  // fields alone: a pick kept from a route since changed is not drawn.
  const procedureDrawings = useQueries({
    queries: pickedProcedures.filter((p) => procedureAirports.some((a) => a.ident === p.ident)).map(procedureQuery),
    combine: drawnOnly,
  });
  // Those drawn, said in the route's box after their fields (RouteBox's
  // chips), each a tap from the Procedures it was picked in.
  // Its fixes to be sent direct to: the procedure's own, not its missed
  // approach's or a runway threshold.
  const routeProcedures = useMemo<RouteProcedure[]>(
    () =>
      procedureDrawings.map((d) => {
        const direct = pickedProcedures.find((p) => sameField(p.ident, d.airport) && p.id === d.id)?.direct ?? null;
        return {
          ident: d.airport,
          kind: d.kind,
          id: d.id,
          runway: d.kind === "approach" ? approachRunway(d.name) : null,
          label: `${d.name.replace(/ RWY /, " ")}${direct ? ` · direct ${direct}` : d.transition ? ` · ${d.transition}` : ""}`,
          spoken: `${d.name}, ${direct ? `direct ${direct}` : transitionWords(d.kind, d.transition ?? null, true)}`,
          direct,
          fixes: d.fixes
            .filter((f) => !f.missed && !/^RW\d/.test(f.ident))
            .map((f) => ({ ...f, turn: d.holds.some((h) => h.fix === f.ident && h.kind === "procedure turn") })),
        };
      }),
    [procedureDrawings, pickedProcedures],
  );
  // A procedure's fix opened -- from its branch in FPL's list or a tap on
  // it on the map -- its card (FixCard): Direct to it, and the altitude to
  // cross it at, at the owner's pick (the fix canvas's option 4).
  const [openFixAt, setOpenFixAt] = useState<{ field: string; kind: RouteProcedure["kind"]; fix: string } | null>(null);
  const openFix = useMemo<OpenFix | null>(() => {
    if (!openFixAt) return null;
    const at = routeProcedures.find((p) => sameField(p.ident, openFixAt.field) && p.kind === openFixAt.kind);
    const fix = at?.fixes?.find((f) => f.ident === openFixAt.fix);
    return at && fix
      ? {
          field: at.ident,
          kind: at.kind,
          procedure: at.label.replace(/ · direct \S+$/, ""),
          fix,
          direct: at.direct === fix.ident,
          own: crossings[fix.ident] ?? null,
        }
      : null;
  }, [openFixAt, routeProcedures, crossings]);
  const mapDirects = routeProcedures
    .filter((r) => r.direct)
    .map((r) => `${r.ident}:${r.id}:${r.direct}`)
    .join(",");
  const showFix = useCallback((field: string, kind: RouteProcedure["kind"], fix: string) => setOpenFixAt({ field, kind, fix }), []);
  const setCrossing = useCallback(
    (fix: string, feet: number | null) => {
      void setAddress((prev) => {
        const own = altitudesOf(prev.cross);
        if (feet == null) delete own[fix];
        else own[fix] = feet;
        return { cross: altitudesParam(own) || null };
      });
    },
    [setAddress],
  );
  const directTo = useCallback(
    (open: OpenFix, direct: boolean) => {
      const at = routeProcedures.find((r) => sameField(r.ident, open.field) && r.kind === open.kind);
      if (!at) return;
      if (direct) feel("directTo");
      pickProcedures(
        pickedProcedures.map((p) =>
          sameField(p.ident, at.ident) && p.id === at.id ? { ...p, direct: direct ? open.fix.ident : null } : p,
        ),
        null,
      );
    },
    [routeProcedures, pickedProcedures, pickProcedures],
  );
  // The patterns flown: none at a field the route lands at by an
  // approach, whose runway chip then says the runway landed on, straight
  // in or circled to -- a circle to land is flown at the plate's circling
  // minimums, not at pattern altitude (AIM 5-4-20), so no pattern is
  // drawn for it.
  const flownPatterns = useMemo(
    () => patterns.filter((p) => !routeProcedures.some((r) => r.kind === "approach" && sameField(r.ident, p.ident))),
    [patterns, routeProcedures],
  );
  // The departure and the arrival picked at the route's ends, filed in
  // the flight plan's route (features/plan/lib/flightPlanForm).
  const filedProcedures = useMemo(() => {
    const at = (ident: string, kind: "departure" | "arrival") => {
      const d = procedureDrawings.find((p) => p.kind === kind && sameField(p.airport, ident));
      return d ? { id: d.id, transition: d.transition ?? null } : null;
    };
    return { departure: at(planned.dep, "departure"), arrival: at(planned.dest, "arrival") };
  }, [procedureDrawings, planned.dep, planned.dest]);
  // The Procedures' sheet, open at one kind of a field's (ProceduresRoute):
  // from its row in FPL's route, or a procedure's chip in the route's box.
  const [proceduresAt, setProceduresAt] = useState<ProceduresAt>(null);
  // The procedure on its own page in the Procedures, drawn on the map and
  // brought in above the sheet before it is added to the route, as
  // ForeFlight's Procedure Advisor previews one (the owner's pick); the
  // route's own of its kind at that field left off the map meanwhile.
  const [procedurePreview, setProcedurePreview] = useState<PickedProcedure | null>(null);
  const previewProcedure = useCallback((p: PickedProcedure | null) => {
    setProcedurePreview(p);
    if (p) setProcedureFocus(`${proceduresParam([p])}@${Date.now()}`);
  }, []);
  // The one procedure query (lib/queryClient), the sheet's page's too: one
  // request for both, where an inline copy of it could drift (WEB-28).
  const { data: previewDrawing } = useQuery({
    ...procedureQuery(procedurePreview ?? { ident: "", id: "", transition: null }),
    enabled: !!procedurePreview,
  });
  const mapProcedures = useMemo(() => {
    const preview = procedurePreview ? previewDrawing : undefined;
    return preview
      ? [...procedureDrawings.filter((d) => !(d.kind === preview.kind && sameField(d.airport, preview.airport))), preview]
      : procedureDrawings;
  }, [procedureDrawings, procedurePreview, previewDrawing]);
  const setProceduresShown = useCallback((at: ProceduresAt) => {
    setProceduresAt(at);
    if (at === null) setProcedurePreview(null);
  }, []);
  const openProcedures = useCallback((p: RouteProcedure) => setProceduresShown({ ident: p.ident, kind: p.kind }), [setProceduresShown]);
  return {
    pickedProcedures,
    procedureFocus,
    pickProcedures,
    typeProcedures,
    routeProcedures,
    openFix,
    setOpenFixAt,
    mapDirects,
    showFix,
    setCrossing,
    directTo,
    flownPatterns,
    filedProcedures,
    proceduresAt,
    setProceduresShown,
    openProcedures,
    previewProcedure,
    mapProcedures,
  };
}
