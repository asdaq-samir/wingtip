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

/** EnvelopeChart, on a chunk of its own, as its importer loads it. */
export const loadEnvelopeChart = () => import("./EnvelopeChart");

/** MiniProfile, on a chunk of its own, as its importer loads it. */
export const loadMiniProfile = () => import("./MiniProfile");

/** PastFlightChart, on a chunk of its own, as its importer loads it. */
export const loadPastFlightChart = () => import("./PastFlightChart");

/** RouteLegCard, on a chunk of its own, as its importer loads it. */
export const loadRouteLegCard = () => import("./RouteLegCard");
