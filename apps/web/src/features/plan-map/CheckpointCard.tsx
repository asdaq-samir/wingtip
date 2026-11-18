import { nm } from "../../lib/format";
import { Badge } from "../../components/ui/badge";
import { TermTable } from "../../components/CardFacts";
import { legFactRows } from "./legFactRows";
import type { Candidate } from "../../lib/api/types";
import { MapCard } from "../../lib/map/cards/MapCard";
import { inkOn, scoreColor } from "../../lib/scoreScale";
import { useRingWhileUp } from "../../lib/map/mapPick";
import type { LegFacts } from "./routeMapFacts";

/** What a checkpoint's popup says: the same small card whether the
 *  point was chosen for the route (numbered, in flight order) or is one
 *  of the candidates it was chosen from. It used to be `<b>` and `<br>`
 *  written twice, which is why the two drifted into saying the same
 *  thing two ways. */
export default function CheckpointCard({ candidate, number, leg }: { candidate: Candidate; number?: number; leg?: LegFacts }) {
  // Its ring while its card is up, a candidate's too (the one selection
  // ring; a chosen one's is the Nav Log's point's as well).
  useRingWhileUp(candidate);
  const kind = number === undefined ? "Candidate checkpoint" : `Checkpoint ${number}`;
  return (
    <MapCard
      // Its name, and what it is -- its place in the flight -- and how far
      // along under it, as every card's head (the owner, 2026-11-18); no
      // numbered dot before the name, which the head has no place for. One
      // with no name is called by its place in the flight.
      title={candidate.name || kind}
      subtitle={`${candidate.name ? `${kind} · ` : ""}${nm(candidate.along_track_nm)} along`}
    >
      {/* The score and what kind of thing it is on one line: two facts
          about the same landmark, each a few characters long, and a
          line apiece made the card twice as tall as it had any need to
          be. The score keeps the colour its own marker is drawn in, so
          the dot on the chart and the number in the card are the same
          fact twice rather than two things to reconcile. */}
      <div className="flex items-center gap-2">
        <Badge
          className="tabular-nums"
          style={{ backgroundColor: scoreColor(candidate.predicted_score), color: inkOn(scoreColor(candidate.predicted_score)) }}
        >
          {candidate.predicted_score.toFixed(2)}
        </Badge>
        <span className="text-muted-foreground">{candidate.category}</span>
      </div>
      {/* Its leg of the nav log, at the owner's ask for cards that say
          what a pilot does there (2026-10-30): the heading and altitude
          on from it, the leg to it, and when it comes. */}
      {leg && <TermTable rows={legFactRows(leg)} className="tabular-nums" />}
    </MapCard>
  );
}
