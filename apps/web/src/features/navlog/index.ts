/**
 * The nav log and the route's profile: its rows, totals and workings, the
 * altitude picked and advised (altitude/), the airplane's and the time's
 * inputs, a leg's card, the kneeboard and the trip's figures.
 */

export { default as ProfileCard } from "./ProfileCard";
export { default as TripFigures } from "./TripFigures";
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

/** The nav log's profile chart, on a chunk of its own (the Studio draws with it too). */
export const loadProfileChart = () => import("./ProfileChart");

/** RouteLegCard, on a chunk of its own, as its importer loads it. */
export const loadRouteLegCard = () => import("./RouteLegCard");
