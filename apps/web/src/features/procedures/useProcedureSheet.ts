import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import type { ProcedureKind } from "../plan";
import type { ProcedureList, ProcedureSummary } from "../../lib/api/types";
import { proceduresQuery } from "../../lib/queryClient";
import { approachRunway, sameField, type PickedProcedure } from "../../lib/procedures";
import { cycleDate } from "./procedureWords";
import type { ProceduresAt, RouteListFlat } from "./routeProps";
import type { useFieldWinds } from "./useFieldWinds";

type Kind = ProcedureKind;

/** The FAA's chart codes in a field's d-TPP for each kind (its card's
 *  terminal charts, wingtip.publications, as the d-TPP metafile's chart_code
 *  has them): an instrument approach procedure, a STAR ("STR"), a
 *  departure procedure (a SID or a graphic obstacle departure) or a
 *  textual one. */
const CHART_CODES: Record<Kind, string[]> = { approach: ["IAP"], arrival: ["STR"], departure: ["DP", "ODP"] };

/**
 * The procedures' sheet and the picks made in it (useProceduresRoute's
 * part): the field and kind it is open on, the procedure on its own page,
 * each field's procedures asked for as its sheet or menu opens, and a
 * procedure picked, one of a kind at a field. `cards`, the fields' cards
 * (useRunwayWinds'), whose d-TPP charts say a kind is there before the
 * CIFP's list is fetched.
 */
export function useProcedureSheet(
  {
    airports,
    at,
    onAt,
    procedures,
    onProcedures,
    onPick,
  }: Pick<RouteListFlat, "airports" | "at" | "onAt" | "procedures" | "onProcedures" | "onPick">,
  cards: ReturnType<typeof useFieldWinds>["cards"],
) {
  // The procedure on its own page in the sheet, over its kind's list.
  const [page, setPage] = useState<{ at: ProceduresAt; procedure: ProcedureSummary } | null>(null);
  // What the sheet shows, kept as it eases away: its title went back to
  // "Procedures" and its page to nothing as it was put away.
  const [kept, setKept] = useState<ProceduresAt>(at);
  if (at && at !== kept) setKept(at);
  const on = at ?? kept;
  const procedure = page && page.at === on ? page.procedure : null;
  // Each field's procedures, asked for as its kind's sheet opens -- not
  // with the route: the FAA's file is 53 MB, fetched on its first ask --
  // and said in the list from then on.
  // Asked for as a field's menu opens too (ProcedureMenu).
  const [asked, setAsked] = useState<ReadonlySet<string>>(() => new Set());
  const ask = (ident: string) => {
    if (!asked.has(ident)) setAsked(new Set([...asked, ident]));
  };
  const lists = useQueries({
    queries: airports.map((a) => ({
      ...proceduresQuery(a.ident),
      enabled: (at != null && sameField(at.ident, a.ident)) || asked.has(a.ident),
    })),
  });
  const listOf = (ident: string): ProcedureList | undefined => lists[airports.findIndex((a) => sameField(a.ident, ident))]?.data;
  // Whether a field has procedures of a kind: by its procedures once they
  // are in (its kind's sheet opened), else by the FAA's charts its card
  // lists (d-TPP), which come with the route -- the CIFP's 53 MB is not
  // fetched for that. Not yet known, not offered: no room taken for a
  // kind a field does not have (the owner's cleanup).
  const hasKind = (ident: string, kind: Kind): boolean => {
    const i = airports.findIndex((a) => sameField(a.ident, ident));
    // Either says so: the list coming in as a menu opens takes no menu
    // away from under the finger where the CIFP has none the FAA charts.
    return (
      !!lists[i]?.data?.procedures.some((p) => p.kind === kind) ||
      (cards[i]?.data?.procedures.some((c) => CHART_CODES[kind].includes(c.kind)) ?? false)
    );
  };
  const kindOf = (p: PickedProcedure) => listOf(p.ident)?.procedures.find((q) => q.id === p.id)?.kind;
  const pickOf = (ident: string, kind: Kind) => procedures.find((p) => sameField(p.ident, ident) && kindOf(p) === kind) ?? null;
  // One of a kind at a field: a new pick there takes the old one's place.
  const pick = (ident: string, kind: Kind, next: { id: string; transition: string | null; direct?: string | null } | null) => {
    const kept = procedures.filter((p) => !(sameField(p.ident, ident) && kindOf(p) === kind));
    // An approach picked is loaded, not flown, until the pilot activates
    // it on the timeline (the owner, 2026-11-22: Garmin's load, then
    // activate); a new transition of one activated keeps it so, and a
    // Direct To one of its fixes activates it, as a GPS navigator's does.
    const was = pickOf(ident, kind);
    const loaded = kind === "approach" && !next?.direct && (!was || was.id !== next?.id || !!was.loaded);
    const made = next ? { ident, ...next, ...(loaded ? { loaded } : { missed: !!was?.missed }) } : null;
    onProcedures(made ? [...kept, made] : kept, made);
    // An approach picked lands on its own runway: the field's runway chip
    // goes to it, kept in step with the approach (at the owner's ask);
    // another only by circling (PatternChips). The map stays on the
    // approach just picked, not the runway's pattern: a loaded approach
    // leaves the field's pattern drawn, and its fit, at zoom 13, put the
    // approach's transition and hold off the screen (procedures-approach.spec).
    const name = next && kind === "approach" ? listOf(ident)?.procedures.find((q) => q.id === next.id)?.name : undefined;
    const runway = name ? approachRunway(name) : null;
    if (runway) onPick(ident, runway, false);
  };
  const close = () => onAt(null);
  const field = on ? airports.find((a) => sameField(a.ident, on.ident)) : undefined;
  const list = on ? listOf(on.ident) : undefined;
  const chosen = on ? pickOf(on.ident, on.kind) : null;
  // The procedure asked for by voice, its page once the field's list is
  // in: the first of that kind whose name starts as the approach does, on
  // the runway said where one was. Set as the sheet renders, as `kept`
  // is above; once set, the page is this address's and it is not again.
  const wanted =
    on?.pick && list && !(page && page.at === on)
      ? (list.procedures
          .filter((p) => p.kind === on.kind && p.name.toUpperCase().startsWith(on.pick!.approach))
          .find((p) => !on.pick!.runway || p.runway === on.pick!.runway) ?? null)
      : null;
  if (wanted && on) setPage({ at: on, procedure: wanted });
  const stale = list?.stale ? `Out of date: the ${cycleDate(list.cycle)} cycle, as the current one could not be fetched` : null;
  return { page, setPage, on, procedure, lists, ask, hasKind, pickOf, pick, close, field, list, chosen, stale };
}
