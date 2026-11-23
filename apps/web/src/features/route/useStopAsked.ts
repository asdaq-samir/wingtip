import { departureOf, stopOf } from "../../lib/identSchema";
import { askSearchPick, useSearchPick } from "../../lib/oneSearch";

/**
 * A pill's Insert Before or Insert After (its menu, RoutePill) asking the
 * one search for the point there (or, before a route with none, the
 * departure) in its pick mode, as a pill's Change does, by the one card
 * rule's one search field (the owner, 2026-11-10). The pick goes in at
 * that place, before the point that was there (after the destination, the
 * new destination, the old one a stop, as Maps' Add Stop does),
 * through the box's own `change`, which keeps its ends and its limits.
 * `oneSearch` false where none is drawn (the developer's page): the box's
 * own field's caret there then, as before.
 */
export function useStopAsked({
  points,
  hasDep,
  hasDest,
  isEnd,
  change,
}: {
  points: string[];
  hasDep: boolean;
  hasDest: boolean;
  isEnd: (ident: string) => boolean;
  change: (list: string[], withDep: boolean, withDest: boolean) => unknown;
}) {
  const oneSearch = useSearchPick((s) => s.fields > 0);
  const askAt = (before: number) => {
    const departure = before === 0 && !hasDep;
    askSearchPick({
      label: departure ? "Departure" : "Stop",
      fixes: !departure,
      stop: !departure,
      taken: departure ? undefined : points,
      onPick: (ident) => {
        // The departure may be where the airplane is (the search's My Location).
        const fresh = (departure && departureOf(ident)) || stopOf(ident);
        if (fresh) change([...points.slice(0, before), fresh, ...points.slice(before)], hasDep || (departure && isEnd(fresh)), hasDest);
      },
    });
  };
  return { oneSearch, askAt };
}
