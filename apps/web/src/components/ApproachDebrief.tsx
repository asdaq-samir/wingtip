import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Check, TriangleAlert, X } from "lucide-react";
import { cn } from "cn";
import { ListGroup, ListRow } from "./GroupedList";
import { FieldError } from "./ui/field";
import { NumberField } from "./ui/number-field";
import { WHOLE } from "./ui/numberFormats";
import { procedureQuery, proceduresQuery } from "../lib/queryClient";
import type { ProcedureDrawing, ProcedureList } from "../lib/api/types";
import { approachesQuery, transitionQuery, withMinimums, type ApproachDebrief as Debriefed, type Tone } from "./approachDebriefModel";
import { clockTime } from "../lib/format";
import { sameField, transitionWords, type PickedProcedure } from "../lib/procedures";
import { FINDING_TONE } from "../lib/findings";
import { TEXT } from "../lib/text";
import type { TrackPoint } from "../lib/track";
import { PlanView, ProfileView } from "./ApproachDebriefViews";

/** None picked, one array for every render, so the search is not made
 *  again at each one. */
const NO_PICKS: PickedProcedure[] = [];

/** A finding's mark, as the debrief's tolerances are marked (FlightPage). */
function Mark({ tone }: { tone: Tone }) {
  if (tone === "stop") return <X className={cn("size-4", FINDING_TONE.stop)} aria-label="Outside" />;
  if (tone === "caution") return <TriangleAlert className={cn("size-4", FINDING_TONE.caution)} aria-label="To look at" />;
  if (tone === "ok") return <Check className={cn("size-4", FINDING_TONE.ok)} aria-label="Within" />;
  return <span className="size-4" aria-hidden />;
}

/**
 * The approaches a track flew, each debriefed against its procedure
 * (components/approachDebriefModel): of the fields' approaches in the FAA's CIFP, the
 * one whose final the track came down, the one picked for the flight
 * where it fits as well, and then its transition. Nothing where none was
 * flown. For the pilot's own flight (FlightPage) and an airplane followed
 * (PastFlightCard), so an instructor can debrief a student's; and for a
 * lesson an instructor set (LessonAssign), `only` its approach's id, and
 * `none` said where the track did not fly it.
 */
export default function ApproachDebriefs({
  fields,
  points,
  picked = NO_PICKS,
  only,
  none,
}: {
  fields: string[];
  points: TrackPoint[];
  picked?: PickedProcedure[];
  only?: string;
  none?: string;
}) {
  const lists = useQueries({ queries: fields.map((f) => proceduresQuery(f)) });
  // Each field's approaches, from vectors to final -- the one picked with
  // its transition -- to find which final the track came down.
  const wanted = fields.flatMap((ident, k) => {
    const list = lists[k]?.data;
    if (!list) return [];
    return list.procedures
      .filter((p) => p.kind === "approach")
      .map((p) => {
        const pick = picked.find((q) => sameField(q.ident, ident) && q.id === p.id);
        return { ident, id: p.id, transition: pick?.transition ?? null };
      });
  });
  const drawings = useQueries({
    queries: wanted.map((w) => procedureQuery(w)),
    combine: (results) => ({ drawn: results.flatMap((r) => (r.data ? [r.data] : [])), pending: results.some((r) => r.isPending) }),
  });
  const listsPending = lists.some((l) => l.isPending);
  const [minimums, setMinimums] = useState<Record<string, number | null>>({});
  // Each field's approaches looked for in the track, the planner's
  // (approach_find), once every one of them is drawn.
  const byField = useMemo(() => {
    if (drawings.pending) return [];
    const by = new Map<string, ProcedureDrawing[]>();
    for (const d of drawings.drawn) by.set(d.airport, [...(by.get(d.airport) ?? []), d]);
    return [...by].map(([airport, ds]) => approachesQuery(ds, points, picked.find((q) => sameField(q.ident, airport))?.id ?? null));
  }, [drawings, points, picked]);
  const searched = useQueries({
    queries: byField,
    combine: (results) => ({
      found: results.flatMap((r) => r.data ?? []),
      pending: results.some((r) => r.isPending),
      error: results.find((r) => r.error)?.error ?? null,
    }),
  });
  const found = searched.found;

  // The transition it came in by, where it was not picked: each of the
  // found approaches' transitions drawn, and the one the track flew kept.
  const summaries = (d: Debriefed) => lists.flatMap((l) => (l.data ? [l.data] : [])).find((l) => sameField(l.airport, d.airport));
  const transitionsOf = (d: Debriefed, list: ProcedureList | undefined) =>
    d.transition ? [] : (list?.procedures.find((p) => p.id === d.id)?.transitions ?? []);
  const more = found.flatMap((d) => transitionsOf(d, summaries(d)).map((t) => ({ d, t })));
  const transitions = useQueries({
    queries: more.map(({ d, t }) => procedureQuery({ ident: d.airport, id: d.id, transition: t })),
    combine: (results) => ({ drawn: results.flatMap((r) => (r.data ? [r.data] : [])), pending: results.some((r) => r.isPending) }),
  });
  // Each found with the transition it came in by, the planner's
  // (approach_transition); from vectors where it has none drawn, or until
  // the planner says.
  const owned = found.map((d) => transitions.drawn.filter((t) => t.airport === d.airport && t.id === d.id));
  const flown = useQueries({
    queries: found.map((d, k) => ({ ...transitionQuery(d, owned[k]!, points), enabled: owned[k]!.length > 0 })),
    combine: (results) => found.map((d, k) => results[k]?.data ?? d),
  });

  if (listsPending || drawings.pending || searched.pending) {
    return fields.length ? (
      <p role="status" className={cn("px-1 text-muted-foreground", TEXT.note)}>
        Looking for an approach in the track…
      </p>
    ) : null;
  }
  const shown = only ? flown.filter((d) => d.id === only) : flown;
  if (searched.error && shown.length === 0) {
    return (
      <FieldError className={cn("px-1", FINDING_TONE.stop, TEXT.prose)}>
        The track could not be read against the approaches: {searched.error.message}
      </FieldError>
    );
  }
  if (shown.length === 0) {
    return none ? <p className={cn("px-1 text-muted-foreground", TEXT.prose)}>{none}</p> : null;
  }
  return (
    <div className="space-y-4" data-testid="approach-debrief">
      {shown.map((d) => {
        const key = `${d.airport}:${d.id}:${d.fafAt}`;
        return (
          <ApproachSection
            key={key}
            d={d}
            minimumsFt={minimums[key] ?? null}
            onMinimums={(ft) => setMinimums((m) => ({ ...m, [key]: ft }))}
          />
        );
      })}
    </div>
  );
}

/** One approach flown: its name and when, its plan view and profile, the
 *  findings, and the pilot's minimums from the plate to hold it to. */
function ApproachSection({
  d: given,
  minimumsFt,
  onMinimums,
}: {
  d: Debriefed;
  minimumsFt: number | null;
  onMinimums: (ft: number | null) => void;
}) {
  // The findings again with the minimums typed: the CIFP has none, and
  // the lowest before the MAP is only measured without them.
  const d = useMemo(() => withMinimums(given, minimumsFt), [given, minimumsFt]);
  return (
    <>
      {/* GPS altitude is not the altimeter's, and a ground track is not a
          needle: the title says what the figures are measured from. */}
      <ListGroup title="Approach · GPS Track">
        <ListRow
          title={d.name}
          description={[
            `${d.airport} · ${transitionWords("approach", d.transition)}`,
            d.alsoFits.length ? `The same final as the ${d.alsoFits.join(", the ")}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          value={clockTime(new Date(d.fafAt))}
          data-testid="approach-name"
        />
        <PlanView d={d} />
        {d.hasAltitude && <ProfileView d={d} />}
        <ListRow title={<label htmlFor={`mins-${d.fafAt}`}>Your Minimums</label>} description="The DA or MDA you flew to, from the plate">
          {/* Read in the pilot's locale, the findings again as typed. */}
          <NumberField
            id={`mins-${d.fafAt}`}
            defaultValue={minimumsFt}
            onTyped={onMinimums}
            formatOptions={WHOLE}
            minValue={0}
            maxValue={99999}
            placeholder="ft"
            aria-label="Your minimums, feet MSL"
            className="h-9 w-20"
            inputClassName="text-right"
            data-testid="approach-minimums"
          />
        </ListRow>
      </ListGroup>
      <ListGroup title="Findings">
        {d.findings.map((f, i) => (
          <ListRow key={i} media={<Mark tone={f.tone} />} title={f.text} data-testid="approach-finding" />
        ))}
      </ListGroup>
    </>
  );
}
