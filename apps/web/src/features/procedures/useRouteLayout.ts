import { useState } from "react";
import { callEngine } from "../../lib/engine/engine";
import { legOf, type NavLogRow, type ProcedureAirport } from "../plan";
import { sameField } from "../../lib/procedures";
import { useOwnShip } from "../../lib/map/position/ownShip";
import { useFuelStops } from "./useFuelStops";
import { tanksAt } from "./routeTanks";
import { fieldsOpenAtFirst, useOpenRunwayLines, useToggledFields } from "./fieldsOpen";
import type { RouteListFlat } from "./routeProps";

/**
 * How the route list's rows are laid out (useProceduresRoute's part): the
 * points among the rows, each field open or folded, how far along the
 * route each row is, a typed point's place, the fuel in the tanks at each
 * point, and the holds the planner made.
 */
export function useRouteLayout({
  airports,
  rows,
  routePoints,
  fuel = null,
  tanks: ownTanks,
}: Pick<RouteListFlat, "airports" | "rows" | "routePoints" | "fuel" | "tanks">) {
  // Where the airplane is known (own ship, or the dry run's): Direct to
  // goes from there.
  const positioned = useOwnShip((s) => s.enabled && !!s.fix);
  // What the planner made of each hold (plan.with_holds), on the leg it is
  // flown on: its entry, minutes and fuel.
  const heldAs = (ident: string) =>
    rows.map((r) => (r.kind === "departure" ? undefined : r.leg?.hold)).find((h) => h && sameField(h.fix, ident)) ?? null;
  const toggled = useToggledFields((st) => st.toggled);
  const [openAtFirst] = useState(fieldsOpenAtFirst);
  const isOpen = (key: string) => openAtFirst !== toggled.includes(key);
  const isFuelStop = useFuelStops();
  // The runway lines opened from their fold (PatternChips), for what sits
  // beside a folded one.
  const openLines = useOpenRunwayLines((st) => st.open);
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
  return { heldAs, positioned, isOpen, openAtFirst, isFuelStop, openLines, destination, along, pointIndex, tanks, points };
}
