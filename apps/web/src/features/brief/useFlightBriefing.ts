import { useState } from "react";
import { usePrinting } from "../plan/lazy";
import type { BriefingPart } from "../plan";
import { planFormsOf } from "./planForms";
import { useBriefModel, type FlightBriefingInputs } from "./useBriefingModel";

const NO_STOPS: string[] = [];

/**
 * A page of the Brief's view model (FlightBriefingView): the briefing as
 * the publishing instance worked it out once (useBriefingModel), with the
 * page's own -- its folds, the printing, and Preflight's forms. Null until
 * that instance has worked it out.
 */
export function useFlightBriefing({
  part,
  dep,
  dest,
  stops = NO_STOPS,
  route = NO_STOPS,
  procedures,
  course = null,
  totals = null,
  depart = "",
  nav,
  legs,
}: FlightBriefingInputs & { part: BriefingPart | null }) {
  const model = useBriefModel((b) => b.model);
  // Preflight's sections a tile opens and the paperwork, folded on screen under the
  // checks (BriefChecks), each opened by its tile or its title; on paper, laid open.
  const printing = usePrinting();
  const [folds, setFolds] = useState<string[]>([]);
  if (!model) return null;
  // Only for Preflight, which shows the forms.
  const planForms =
    part === "preflight"
      ? planFormsOf({
          ifr: model.ifr,
          dep,
          dest,
          route,
          stops,
          course,
          legs,
          totals,
          depart,
          opened: model.opened,
          flying: model.flying,
          nav,
          own: model.own,
          // The load the pilot saved, never the editor's sample airplane:
          // with none, item 19's endurance is left for them to fill.
          load: model.saved,
          icaoIds: model.icaoIds,
          procedures,
        })
      : [];
  return { ...model, printing, folds, setFolds, planForms };
}

/** The briefing's view model, as its parts read it. */
export type FlightBriefing = NonNullable<ReturnType<typeof useFlightBriefing>>;
