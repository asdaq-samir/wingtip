import { showError } from "../../lib/problems";
import { sameField, typedProcedures, type PickedProcedure, type TypedProcedure } from "../../lib/procedures";
import { proceduresQuery, queryClient } from "../../lib/queryClient";

/**
 * A SID or a STAR typed in the route box among its points ("KMSP BAEE1
 * BAE ... OSHH2 KATW", as a clearance or a filed route is written):
 * picked as its field's departure or arrival, by its transition where the
 * point beside it is one, in place of that field's pick of the kind; one
 * neither field publishes said in an alert, as a failed tap is
 * (useProcedurePicks' typeProcedures, which loads this at the typing).
 */
export async function pickTyped(
  typed: TypedProcedure[],
  route: { dep: string; dest: string },
  pickProcedures: (picks: (now: PickedProcedure[]) => PickedProcedure[], picked: PickedProcedure | null) => void,
): Promise<void> {
  const list = (ident: string) => queryClient.fetchQuery(proceduresQuery(ident));
  const { picks: hits, missed, unchecked, lists } = await typedProcedures(typed, route, list);
  // Onto the picks as the address has them once the lists are in, each
  // in place of its field's pick of the kind.
  const last = hits.at(-1) ?? null;
  const kindOf = (ident: string, id: string) => lists.find((l) => sameField(l.airport, ident))?.procedures.find((p) => p.id === id)?.kind;
  const withHits = (now: PickedProcedure[]) =>
    hits.reduce(
      (next, { kind, ...hit }) => [...next.filter((p) => !(sameField(p.ident, hit.ident) && kindOf(p.ident, p.id) === kind)), hit],
      now,
    );
  if (last) pickProcedures(withHits, { ident: last.ident, id: last.id, transition: last.transition });
  if (missed.length) {
    showError(
      `${missed.join(" and ")} ${missed.length > 1 ? "are" : "is"} not a departure from ${route.dep || "the departure"} or an arrival into ${route.dest || "the destination"}`,
      "A SID is typed after the departure and a STAR before the destination, as in a filed route.",
    );
  } else if (unchecked.length) {
    // A field's list did not come: not looked at, so not said unpublished.
    showError(
      `${unchecked.join(" and ")} could not be checked: the procedures of ${route.dep || "the departure"} or ${route.dest || "the destination"} did not load`,
      "Try again shortly, or pick it in Procedures.",
    );
  }
}
