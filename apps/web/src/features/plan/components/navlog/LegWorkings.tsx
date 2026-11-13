import { useId, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "cn";
import { ListGroup, ListRow } from "../../../../components/GroupedList";
import { ResponsivePopover, ResponsivePopoverContent, ResponsivePopoverTrigger } from "../../../../components/ResponsivePopover";
import Segmented from "../../../../components/Segmented";
import { Button } from "../../../../components/ui/button";
import { NumberField } from "../../../../components/ui/number-field";
import type { Leg } from "../../../../lib/api/types";
import { ANSWERS, checks, workingsOf, written, type AnswerKey, type Phase, type Workings } from "./workings";
import { TEXT } from "../../../../lib/text";
import { FINDING_TONE } from "../../../../lib/findings";

function Worked({ workings }: { workings: Workings }) {
  return (
    <ListGroup>
      {workings.steps.map((step) => (
        <ListRow key={step.name} title={step.name} description={step.sum} value={step.result} data-testid="working-step" />
      ))}
      {/* The climb the log's time and fuel add, flown at climb speed and
          burn: a row, where it was a footnote. */}
      {workings.climb && (
        <ListRow
          title="Climb, added"
          description="At climb speed and burn"
          value={`${Math.round(workings.climb.min)} min · ${workings.climb.gal.toFixed(1)} gal`}
          data-testid="working-climb"
        />
      )}
      {workings.procedure && (
        <ListRow
          title={workings.procedure.landing ? "Pattern or approach, added" : "Departure, added"}
          description={`${workings.procedure.nm.toFixed(1)} nm more than the leg's line, at its ground speed`}
          value={`${Math.round(workings.procedure.min)} min · ${workings.procedure.gal.toFixed(1)} gal`}
          data-testid="working-procedure"
        />
      )}
    </ListGroup>
  );
}

/** The student's own figures, checked against the planner's within an
 *  E6B's accuracy (ANSWERS): each marked right, or wrong with the answer. */
function TryIt({ workings }: { workings: Workings }) {
  const id = useId();
  // The figures as typed (React Aria's NumberField, in the pilot's locale).
  const [typed, setTyped] = useState<Partial<Record<AnswerKey, number | null>>>({});
  const [checked, setChecked] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setChecked(true);
      }}
      aria-label="Work the leg out yourself"
    >
      <ListGroup>
        {ANSWERS.map((answer) => {
          const number = typed[answer.key] ?? null;
          // Only the figures typed are marked: a student works them one
          // at a time, and the rest are not given away.
          const marked = checked && number !== null && Number.isFinite(number);
          const right = marked && checks(answer.key, number, workings.answers[answer.key]);
          return (
            <ListRow
              key={answer.key}
              id={`${id}-${answer.key}`}
              title={answer.label}
              // How each is written, in its row (it was a footnote): the
              // correction signed, the time and fuel the cruise's alone.
              description={
                marked && !right
                  ? `Not quite: ${written(answer.key, workings.answers[answer.key])}`
                  : answer.key === "wca"
                    ? "+ right, − left"
                    : answer.key === "ete" || answer.key === "fuel"
                      ? workings.phase === "cruise"
                        ? "Cruise only"
                        : `The ${workings.phase}'s`
                      : undefined
              }
              data-testid={`try-${answer.key}`}
            >
              <span className="flex items-center gap-1.5">
                {marked &&
                  (right ? (
                    <Check className={cn("size-4", FINDING_TONE.ok)} aria-label="Right" />
                  ) : (
                    <X className={cn("size-4", FINDING_TONE.stop)} aria-label="Not right" />
                  ))}
                <NumberField
                  id={`${id}-${answer.key}`}
                  className="h-8 w-20"
                  inputClassName="text-right"
                  value={number}
                  data-testid={`try-${answer.key}-input`}
                  onChange={(v) => {
                    setTyped({ ...typed, [answer.key]: v });
                    setChecked(false);
                  }}
                />
                <span className={cn("w-7 text-muted-foreground", TEXT.detail)}>{answer.unit}</span>
              </span>
            </ListRow>
          );
        })}
      </ListGroup>
      <div className="flex justify-end">
        <Button type="submit" size="sm" data-testid="try-check">
          Check
        </Button>
      </div>
    </form>
  );
}

/**
 * The selected leg worked out, as a student shows it on the examiner's
 * nav log (ACS PA.I.D): the wind triangle from the true course to the
 * compass heading, the ground speed, the time and the fuel, each with
 * its sum -- or, under Try it, the student's own figures checked against
 * them. A popover from `md` up, a sheet on a phone.
 */
export default function LegWorkings({ leg, phase = "cruise" }: { leg: Leg; phase?: Phase }) {
  const workings = workingsOf(leg, phase);
  const [mode, setMode] = useState("worked");
  if (!workings) return null;
  return (
    <ResponsivePopover>
      <ResponsivePopoverTrigger asChild>
        <Button
          type="button"
          variant="link"
          size="sm"
          className={cn("h-auto p-0 text-tint", TEXT.detail)}
          onClick={(e) => e.stopPropagation()}
          data-testid="leg-workings"
        >
          Show the work
        </Button>
      </ResponsivePopoverTrigger>
      <ResponsivePopoverContent
        title={`${leg.from} to ${leg.to}, worked out`}
        className="w-[26rem] max-w-[calc(100vw-2rem)] p-3"
        align="start"
        data-testid="leg-workings-content"
      >
        <div className="space-y-3">
          <Segmented
            label="Worked out or yours"
            value={mode}
            onChange={setMode}
            options={[
              { value: "worked", label: "Worked out" },
              { value: "try", label: "Try it" },
            ]}
            testId="workings-mode"
          />
          {mode === "worked" ? <Worked workings={workings} /> : <TryIt workings={workings} />}
        </div>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  );
}
