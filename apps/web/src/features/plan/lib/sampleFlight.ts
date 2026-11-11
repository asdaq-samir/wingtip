import type { RouteParts } from "../components/RouteBox";

/** The welcome's sample: Madison to Oshkosh, one short leg every app
 *  opens alike (the iPhone's and Android's welcome too), so a new pilot
 *  sees a route, its nav log and its Brief at once. Here, out of the
 *  welcome's hook, for FPL's "Plan a flight" too (PlanPage) without the
 *  welcome's code in the first load. */
export const SAMPLE_FLIGHT: RouteParts = { dep: "KMSN", stops: [], dest: "KOSH" };
