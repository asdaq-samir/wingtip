import type { Map as GlMap } from "maplibre-gl";
import { isDropped } from "../../lib/api/client";
import { reportOf, sendReport } from "../../lib/errorReports";
import { clearProblem, raiseProblem } from "../../lib/problems";

/** The map's one problem line (lib/problems): one id however many of its
 *  requests fail. */
export const MAP_PROBLEM = "map";

/** What the map says when something it needs to draw failed: a style, a
 *  source, the overlay archive, a glyph or a sprite. */
const MAP_PROBLEM_TITLE = "Part of the map could not be drawn";

/**
 * Whether a map error is the chart working as meant, not one to say: a
 * tile the source has none of (a terminal sheet's 404, left blank), a
 * request cut off as the map moved on, or one with no network under it
 * (in the air most of a flight; the service worker draws what it kept).
 */
export function quietMapError(error: unknown, online = globalThis.navigator?.onLine !== false): boolean {
  if (!online || isDropped(error)) return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  const status = (error as { status?: unknown } | null)?.status;
  return status === 404 || status === 0;
}

/**
 * The map's errors, where MapLibre had them swallowed whole by an empty
 * listener: a tile 404 stays quiet, as before; anything else is said on
 * the problem line beside the map's buttons and sent to the owner as the
 * page's other errors are (lib/errorReports). The line goes at the first
 * rest the map reaches with nothing failed since the one before, so a
 * pan that draws cleanly takes it away. (A listener also stops MapLibre's
 * own console.error, which nobody reads on a phone.)
 */
export function watchMapErrors(map: Pick<GlMap, "on">): void {
  let failedSinceRest = false;
  map.on("error", (e: { error?: unknown }) => {
    if (quietMapError(e.error)) return;
    failedSinceRest = true;
    sendReport(reportOf("error", e.error ?? "map error"));
    raiseProblem({ id: MAP_PROBLEM, title: MAP_PROBLEM_TITLE });
  });
  map.on("idle", () => {
    if (!failedSinceRest) clearProblem(MAP_PROBLEM);
    failedSinceRest = false;
  });
}
