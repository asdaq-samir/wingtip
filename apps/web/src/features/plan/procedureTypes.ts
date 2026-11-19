import type { ProcedureSummary, Runway } from "../../lib/api/types";

// The procedures sheet's small shared types, apart from the hook and the
// parts that use them so none of them imports another for a type.

export type ProcedureKind = ProcedureSummary["kind"];

export interface ProcedureAirport {
  ident: string;
  role: "Departure" | "Stop" | "Destination";
  runways: Runway[] | null;
  patternAltitudeFt: number | null;
  /** The field's elevation, for its runways' distances (runwayFit). */
  elevationFt: number | null;
}

/** How the route lands at a field it flies an approach to: the
 *  approach's runway (none for one circling only), whether its plate
 *  publishes circling minimums (undefined until the plate is in), and the
 *  approach as the route's box names it. */
export interface Landing {
  runway: string | null;
  circling: boolean | undefined;
  name: string;
}
