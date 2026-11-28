/**
 * The nav log and the route's profile: its rows, totals and workings, the
 * altitude picked and advised (altitude/), the airplane's and the time's
 * inputs, a leg's card, the kneeboard and the trip's figures.
 */

export { default as ProfileCard } from "./ProfileCard";
export { clearanceAt } from "./altitude/clearance";
export { loadFlightChart } from "./loadFlightChart";
export { useLegSheet } from "./useLegSheet";
import { fromChunk } from "../../lib/fromChunk";

/** EnvelopeChart, on a chunk of its own, as its importer loads it. */
export const loadEnvelopeChart = () => import("./EnvelopeChart");

/** MiniProfile, on a chunk of its own, drawn from its module once in
 *  (fromChunk) and asked for once a route's plan is in (usePlanFpl), so
 *  the Profile opens on it, not on a fetch and a suspended first draw. */
export const { Part: MiniProfile, prefetch: prefetchMiniProfile } = fromChunk(
  () => import("./MiniProfile"),
  (m) => m.default,
);

/** PastFlightChart, on a chunk of its own, as its importer loads it. */
export const loadPastFlightChart = () => import("./PastFlightChart");

/** RouteLegCard, on a chunk of its own, as its importer loads it. */
export const loadRouteLegCard = () => import("./RouteLegCard");

/** TripFigures (with FigureStrip and the trip's figures), on a chunk of its
 *  own, drawn from its module once in (fromChunk): the strip waits for the
 *  engine anyway (FlightFoot's EngineGate), so it comes beside the .wasm,
 *  asked for at the start (main.tsx), not in the entry the page waits for
 *  (8.7 KB of it). */
export const { Part: TripFigures, prefetch: prefetchTripFigures } = fromChunk(
  () => import("./TripFigures"),
  (m) => m.default,
);
