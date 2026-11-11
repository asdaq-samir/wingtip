import type { RouteParts } from "../components/RouteBox";

/** The sample flight: Madison to Oshkosh, one short leg every app opens
 *  alike (the iPhone's and Android's welcome too), so a new pilot sees a
 *  route, its nav log and its Brief at once, from FPL's "Plan a flight"
 *  (PlanPage). */
export const SAMPLE_FLIGHT: RouteParts = { dep: "KMSN", stops: [], dest: "KOSH" };
