import { useEffect } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { clearProblem, raiseProblem } from "../../problems";
import { chartRole } from "./glStyle";

/** The map's line for a chart tile neither kept nor to be had. */
export const CHART_MISSED_ID = "chart-not-kept";
export const CHART_MISSED = "Chart not kept for this area: it needs a connection";

/** Whether a map error is a chart tile that could not be had for want of
 *  a connection: one of the chart's sources (glStyle's chartRole) with the
 *  browser offline. */
export function chartTileMissed(e: { sourceId?: string; tile?: unknown }, online: boolean): boolean {
  return !online && !!e.tile && chartRole(e.sourceId) !== null;
}

/**
 * A chart tile the worker did not keep and the network cannot give says
 * so (lib/problems' line beside the map's buttons) rather than leaving a
 * blank square with nothing to tell it from a chart that has nothing
 * there: Keep for the Air keeps a route's tiles, and a pan off it in the
 * air reaches tiles never kept (the offline audit of 2026-11-21; owner
 * recs, item 48). Cleared as the connection comes back or a chart tile
 * is drawn again.
 */
export function useChartMissed(map: MlMap) {
  useEffect(() => {
    const failed = (e: { sourceId?: string; tile?: unknown }) => {
      if (chartTileMissed(e, navigator.onLine)) raiseProblem({ id: CHART_MISSED_ID, title: CHART_MISSED });
    };
    const drawn = (e: { sourceId?: string; tile?: unknown }) => {
      if (navigator.onLine && e.tile && chartRole(e.sourceId) !== null) clearProblem(CHART_MISSED_ID);
    };
    const back = () => clearProblem(CHART_MISSED_ID);
    map.on("error", failed);
    map.on("sourcedata", drawn);
    window.addEventListener("online", back);
    return () => {
      map.off("error", failed);
      map.off("sourcedata", drawn);
      window.removeEventListener("online", back);
      clearProblem(CHART_MISSED_ID);
    };
  }, [map]);
}
