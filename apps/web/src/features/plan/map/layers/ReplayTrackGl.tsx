import { useMemo } from "react";
import type { ReplayPoint } from "../../../../lib/replay/clock";
import { useGlLines, type GlRun } from "../../../../lib/map/gl/useGlLines";
import { CHART } from "../../../../lib/tokens";
import { colourRuns } from "../traffic";
import { useGlFit } from "../useGlFit";
import { ReplayGl } from "./TracksGl";

const CASING = { colour: CHART.casing, width: 6, opacity: 0.85 };

/**
 * A replayed track on the map, as a past flight's is drawn (PastFlightGl):
 * its path in its heights' colours, fitted once, and the replay's airplane
 * flown along it (ReplayGl, which steps the map's one replay clock) -- but
 * in runs of reports, none drawn across a gap (a report marked `gap`),
 * where nothing was heard. The Studio's (features/studio), on its own
 * chunk.
 */
export default function ReplayTrackGl({ id, points }: { id: string; points: ReplayPoint[] }) {
  const runs = useMemo<GlRun[]>(() => {
    const pieces: ReplayPoint[][] = [[]];
    for (const p of points) {
      if (p.gap) pieces.push([]);
      pieces.at(-1)!.push(p);
    }
    return pieces.flatMap((piece) =>
      colourRuns(piece.map((p) => ({ lat: p.lat, lon: p.lon, altFt: p.alt_ft ?? null }))).map((r) => ({
        points: r.points,
        colour: r.colour,
        width: 3,
      })),
    );
  }, [points]);
  useGlLines("replay-track", "route", runs, CASING);
  useGlFit(points, id, 12);
  return <ReplayGl />;
}
