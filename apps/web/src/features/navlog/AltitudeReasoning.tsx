import { useState } from "react";
import { cn } from "cn";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../components/ui/accordion";
import { usePrinting } from "../plan/lazy";
import type { Leg, NavLogAltitude, Totals } from "../../lib/api/types";
import { TEXT } from "../../lib/text";
import { airspaceSteps, checkedStep, performanceSteps, plansStep } from "./altitudeMoreSteps";
import { ifrSteps } from "./altitudeSteps";
import { vfrSteps } from "./altitudeVfrSteps";

interface Props {
  /** The nav log's own altitude and, unless the pilot typed one, the
   *  planner's breakdown of how it chose it and the four plans. */
  nav: NavLogAltitude;
  /** The legs flown, as they stream in: each one's cruise in its own
   *  air, which the performance step says. */
  legs: Leg[];
  /** The four plans are said above the steps, as the FL chip's buttons
   *  (AltitudeGroup): their step comes after the rule, and says how
   *  they were made. Without it (the Brief) the plan flown comes first,
   *  with its time and fuel, as the answer. */
  plansAbove?: boolean;
  /** Whose winds the plans fly (the totals'), named as the nav log names them. */
  winds?: Totals["winds"];
}

/**
 * How the cruise altitude was chosen, step by step, in the planner's
 * own order (`wingtip.altitude.select_cruise_altitude` and
 * `wingtip.navlog.altitude_profiles`): the floor from terrain and
 * obstacles, the ceiling from airspace and the airplane -- leg by
 * leg, since a Class B shelf caps only the legs
 * under it -- the hemispheric rule that gives the legal altitudes in
 * between, the four plans made of them and the one being flown, the
 * airplane's performance in the day's air they were flown at, and
 * the weather that was checked but does not move the numbers. Every
 * figure is the planner's own, so the pilot can check each one against
 * the chart -- the FL chip's popover and the Brief's Cruise Altitude
 * section are both this.
 *
 * A row a step, in a list's box: its name, its reason and its figure
 * ("Floor · Terrain and obstacles, with margin · 2,600 ft"), with how it
 * was reached folded under it. In the Brief the plan flown comes first,
 * and these are the whole section, at the owner's pick of the redesign
 * (each fact said once): a list of the plan, the floor and the ceiling
 * sat over the steps, which said all three again.
 */
export default function AltitudeReasoning({ nav, legs, plansAbove = false, winds }: Props) {
  const ifr = nav.altitude_selection.rules === "ifr";
  const [open, setOpen] = useState<string[]>([]);
  const printing = usePrinting();

  // Every figure below is the planner's own, the rule's hemisphere and
  // the oxygen check included: this names them, it does not redo them.

  // Each step's conclusion is its row, the figure in it; how it was
  // reached folds under it (the stock accordion), so the steps read in a
  // glance and a pilot opens the one they doubt. They were paragraphs of
  // seven to fifteen lines each. On paper every step is open.
  const plans = plansStep(nav, plansAbove, winds);
  const steps = [
    ...(plansAbove ? [] : [plans]),
    ...(ifr ? ifrSteps(nav) : vfrSteps(nav)),
    ...(plansAbove ? [plans] : []),
    ...performanceSteps(nav, legs),
    checkedStep(nav),
    ...airspaceSteps(nav),
  ];

  return (
    // A list's box (ListGroup's), a row a step at a row's sizes (ListRow's):
    // its name in the text's colour, its reason and its figure in grey, the
    // whole row the fold's tap, 44 at the least.
    <Accordion
      multiple
      value={printing ? steps.map((step) => step.key) : open}
      onValueChange={(v) => setOpen(v as typeof open)}
      className="rounded-lg border border-border bg-card"
      data-testid="altitude-steps"
    >
      {steps.map((step) => (
        <AccordionItem key={step.key} value={step.key}>
          <AccordionTrigger className="min-h-11 items-center gap-2.5 rounded-none px-3 py-2 font-normal hover:bg-muted/50 hover:no-underline">
            <span className="min-w-0 flex-1">
              <span className={cn("block", TEXT.row)}>{step.title}</span>
              {step.detail && <span className={cn("mt-0.5 block text-muted-foreground", TEXT.detail)}>{step.detail}</span>}
            </span>
            {step.value && <span className={cn("shrink-0 text-right text-muted-foreground tabular-nums", TEXT.row)}>{step.value}</span>}
          </AccordionTrigger>
          <AccordionContent className={cn("px-3 pb-3", TEXT.prose)}>{step.body}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
