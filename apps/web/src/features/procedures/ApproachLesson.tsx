import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import CloseButton from "../../components/CloseButton";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { ResponsivePopover, ResponsivePopoverAnchor, ResponsivePopoverContent } from "../../components/ResponsivePopover";
import Segmented from "../../components/Segmented";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { useIsMobile } from "../../hooks/use-mobile";
import { approachBrief, coachingSteps, lessonPath, pathBetween, type LessonInput } from "../../lib/approachLesson";
import { useGeo } from "../../lib/geo";
import { endLessonMap, useLessonMap } from "../../lib/map/route/lessonMap";
import type { PickedProcedure } from "../../lib/procedures";
import { airportQuery, procedureQuery } from "../../lib/queryClient";
import { FINDING_TONE } from "../../lib/findings";
import { TEXT } from "../../lib/text";
import { FieldError } from "../../components/ui/field";
import { InstructorNote, Progress, type FromInstructor } from "./LessonParts";
import { LessonProfile } from "./LessonProfile";
import { QuizPage } from "./LessonQuiz";

/** The lesson's one safety line, its subtitle: the plate, not this, is
 *  what is flown (CLAUDE.md's safety principle, kept off the pilot's
 *  screens as a footnote at the owner's word, 2026-10-16). */
const AID = "Training aid — fly the FAA plate";

type Page = "brief" | "fly" | "quiz";
const PAGES = [
  { value: "brief", label: "Brief" },
  { value: "fly", label: "Fly" },
  { value: "quiz", label: "Quiz" },
];
/** Ground speeds to fly the final at, kt: a discrete setting, a segmented
 *  control (the app's iOS rules), its descent rate and time worked from
 *  the one picked. 90 to start, a light airplane's approach speed or near
 *  it in still air -- the pilot's to change, said on the control. */
const SPEEDS = [70, 90, 120] as const;

/**
 * An approach taught, at the owner's ask ("do it all", 2026-10-30), from
 * a picked approach's Learn This Approach (ProcedureMenu): Brief, Fly and
 * Quiz, a segmented control at the card's head. The brief walks the
 * approach as an instructor has it briefed, a Got It a step; Fly takes the
 * airplane fix by fix along it on the map with a coaching word at each and
 * the approach from the side; the quiz asks it back from its own data. Each
 * step rings its fix or draws over its part on the chart (LessonGl). A
 * card in the map's panel on a phone, as the hold's is; its subtitle the
 * one line that says it is a training aid.
 */
export default function ApproachLesson({
  at,
  onClose,
  from,
}: {
  at: PickedProcedure | null;
  onClose: () => void;
  /** Set by an instructor (AssignedLesson); none from a picked approach's menu. */
  from?: FromInstructor;
}) {
  const isMobile = useIsMobile();
  const { data: drawing, error, isPending } = useQuery({ ...procedureQuery(at ?? { ident: "", id: "", transition: null }), enabled: !!at });
  const { data: field } = useQuery({ ...airportQuery(at?.ident ?? ""), enabled: !!at });
  // The lesson off the chart as it is put away, whichever way.
  useEffect(() => (at ? endLessonMap : undefined), [at]);
  const input = useMemo<LessonInput | null>(
    () => (drawing ? { drawing, frequencies: field?.frequencies ?? null } : null),
    [drawing, field],
  );
  return (
    <ResponsivePopover
      open={!!at}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <ResponsivePopoverAnchor asChild>
        <span aria-hidden="true" className="pointer-events-none fixed top-16 left-1/2 size-0" />
      </ResponsivePopoverAnchor>
      <ResponsivePopoverContent
        title={drawing?.name ?? "Approach Lesson"}
        description={AID}
        side="bottom"
        align="center"
        className="flex max-h-[34rem] w-80 flex-col gap-3 overflow-y-auto p-3"
        data-testid="approach-lesson"
        action={<CloseButton onClick={onClose} data-testid="approach-lesson-close" />}
      >
        {/* The popover shows no subtitle: the line at its top there. */}
        {!isMobile && <p className={cn("text-muted-foreground", TEXT.note)}>{AID}</p>}
        {error ? (
          <FieldError className={cn(FINDING_TONE.stop, TEXT.prose)}>The approach could not be had: {error.message}</FieldError>
        ) : isPending || !input ? (
          <div role="status" className="flex flex-col gap-2 py-1">
            <span className="sr-only">Fetching the approach…</span>
            <Skeleton aria-hidden className="h-4 w-3/5" />
            <Skeleton aria-hidden className="h-3 w-2/5" />
          </div>
        ) : (
          <Lesson key={`${input.drawing.airport}:${input.drawing.id}:${input.drawing.transition ?? ""}`} input={input} from={from} />
        )}
      </ResponsivePopoverContent>
    </ResponsivePopover>
  );
}

function Lesson({ input, from }: { input: LessonInput; from?: FromInstructor }) {
  const [page, setPage] = useState<Page>("brief");
  const [gs, setGs] = useState<number>(90);
  // The approach on the chart while the lesson is open; each page says what of it its step shows (its effects run before this one).
  useEffect(() => {
    useLessonMap.setState({ drawing: input.drawing });
  }, [input.drawing]);
  return (
    <>
      <Segmented
        label="Lesson step"
        value={page}
        onChange={(v) => setPage(v as Page)}
        options={PAGES}
        className="w-full [&>*]:flex-1"
        testId="approach-lesson-steps"
      />
      {from?.problem && <FieldError className={cn(FINDING_TONE.stop, TEXT.note)}>{from.problem}</FieldError>}
      {page === "brief" && (
        <BriefPage
          input={input}
          from={from}
          onDone={() => {
            from?.onBriefed();
            setPage("fly");
          }}
        />
      )}
      {page === "fly" && <FlyPage input={input} from={from} gs={gs} onGs={setGs} onDone={() => setPage("quiz")} />}
      {page === "quiz" && <QuizPage input={input} from={from} gs={gs} />}
    </>
  );
}

function BriefPage({ input, from, onDone }: { input: LessonInput; from?: FromInstructor; onDone: () => void }) {
  const items = useMemo(() => approachBrief(input), [input]);
  const [at, setAt] = useState(0);
  const item = items[Math.min(at, items.length - 1)]!;
  useEffect(() => {
    useLessonMap.setState({ focus: item.focus, flight: null });
  }, [item]);
  const last = at >= items.length - 1;
  return (
    <div className="space-y-3" data-testid="approach-brief">
      <Progress at={at} of={items.length} />
      <ListGroup title={item.title}>
        {item.lines.map((line) => (
          <ListRow key={line} title={line} />
        ))}
        <InstructorNote from={from} fix={item.focus.fix} />
      </ListGroup>
      <Button className="w-full" onClick={() => (last ? onDone() : setAt(at + 1))} data-testid="approach-brief-next">
        {last ? "Fly It" : "Got It"}
      </Button>
    </div>
  );
}

function FlyPage({
  input,
  from,
  gs,
  onGs,
  onDone,
}: {
  input: LessonInput;
  from?: FromInstructor;
  gs: number;
  onGs: (gs: number) => void;
  onDone: () => void;
}) {
  const steps = useMemo(() => coachingSteps(input, gs), [input, gs]);
  // Where each step is and what it shows, alike at any speed: the airplane stays put.
  const places = useMemo(() => coachingSteps(input, SPEEDS[1]).map((s) => ({ at: s.at, focus: s.focus })), [input]);
  const path = useMemo(() => lessonPath(input.drawing), [input.drawing]);
  const [at, setAt] = useState(0);
  const step = steps[Math.min(at, steps.length - 1)];
  const geo = useGeo();
  // The airplane flown from the last step's place to this one's, along the
  // approach's line; at the first, put at it.
  useEffect(() => {
    const place = places[at];
    if (!place) return;
    const from = at > 0 ? (places[at - 1]?.at ?? null) : null;
    const to = place.at;
    const way = to ? (from ? pathBetween(path, from, to) : [to]) : [];
    const a = way.at(-2),
      b = way.at(-1);
    useLessonMap.setState((s) => ({
      focus: place.focus,
      flight: way.length
        ? { path: way, track: geo && a && b ? geo.bearingDeg(a, b) : (s.flight?.track ?? null), id: (s.flight?.id ?? 0) + 1 }
        : s.flight,
    }));
  }, [at, path, places, geo]);
  // Flown to its last step: the instructor told, once a lesson.
  const flownToEnd = steps.length > 0 && at >= steps.length - 1;
  const onFlown = from?.onFlown;
  useEffect(() => {
    if (flownToEnd) onFlown?.();
  }, [flownToEnd, onFlown]);
  if (!step) return <p className={cn("text-muted-foreground", TEXT.prose)}>See the plate</p>;
  const last = at >= steps.length - 1;
  return (
    <div className="space-y-3" data-testid="approach-fly">
      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-muted-foreground", TEXT.note)}>Ground speed</span>
        <Segmented
          label="Ground speed"
          value={String(gs)}
          onChange={(v) => onGs(Number(v))}
          options={SPEEDS.map((s) => ({ value: String(s), label: `${s} kt` }))}
          testId="approach-fly-speed"
        />
      </div>
      <Progress at={at} of={steps.length} />
      <ListGroup title={step.title}>
        <ListRow
          title={
            <span className={cn("block font-medium", TEXT.prose)} data-testid="approach-coach">
              {step.say}
            </span>
          }
          description={step.why ?? undefined}
        />
        <InstructorNote from={from} fix={step.focus.fix} />
      </ListGroup>
      <LessonProfile drawing={input.drawing} steps={steps} at={at} />
      <div className="flex gap-2">
        {last ? (
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setAt(0)}>
              Fly It Again
            </Button>
            <Button className="flex-1" onClick={onDone}>
              Quiz Me
            </Button>
          </>
        ) : (
          <Button className="w-full" onClick={() => setAt(at + 1)} data-testid="approach-fly-next">
            Next Fix
          </Button>
        )}
      </div>
    </div>
  );
}
