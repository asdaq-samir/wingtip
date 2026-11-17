import { nm } from "../../lib/format";
import { Badge } from "../../components/ui/badge";
import { TermTable } from "../../components/CardFacts";
import { legFactRows } from "./legFactRows";
import type { Candidate } from "../../lib/api/types";
import { MapCard } from "../../lib/map/cards/MapCard";
import { inkOn, scoreColor } from "../../lib/scoreScale";
import type { LegFacts } from "./routeMapFacts";

/** What a checkpoint's popup says: the same small card whether the
 *  point was chosen for the route (numbered, in flight order) or is one
 *  of the candidates it was chosen from. It used to be `<b>` and `<br>`
 *  written twice, which is why the two drifted into saying the same
 *  thing two ways. */
export default function CheckpointCard({ candidate, number, leg }: { candidate: Candidate; number?: number; leg?: LegFacts }) {
  const fill = scoreColor(candidate.predicted_score);
  return (
    <MapCard
      // Its dot as the map draws it, numbered in flight order where it is
      // one of the route's, before its name.
      media={
        <span
          // The number is the checkpoint's place in the flight, which the
          // title no longer carries, so a screen reader hears it here; an
          // unnumbered candidate has nothing to say.
          role={number === undefined ? undefined : "img"}
          aria-label={number === undefined ? undefined : `Checkpoint ${number}`}
          aria-hidden={number === undefined ? true : undefined}
          className="grid size-7 shrink-0 place-items-center rounded-full border-[2.5px] border-background text-(length:--type-caption) leading-[0.8125rem] font-bold shadow-mark outline outline-1 outline-(color:--chart-shade)/45"
          style={{ backgroundColor: fill, color: inkOn(fill) }}
        >
          {number ?? ""}
        </span>
      }
      // The number on its dot, not again before its name.
      title={candidate.name || "(unnamed)"}
      subtitle={`${nm(candidate.along_track_nm)} along`}
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
