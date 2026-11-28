import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { create } from "zustand";
import { cn } from "cn";
import CloseButton from "../../components/CloseButton";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { ListPicks, type ListPick } from "../../components/ListPicks";
import { ResponsivePopover, ResponsivePopoverContent, ResponsivePopoverTrigger } from "../../components/ResponsivePopover";
import { Switch } from "../../components/ui/switch";
import type { ProcedureList, ProcedureSummary } from "../../lib/api/types";
import { usePreferences } from "../../lib/preferences";
import { transitionWords, type PickedProcedure } from "../../lib/procedures";
import { TEXT } from "../../lib/text";
import { procedureTrigger, TITLE, type TriggerLook } from "./ProcedureTrigger";
import { ALL, approachGroups, NONE, shortName } from "./procedureWords";
import { faaWords } from "../../lib/advisories";
import QueryState from "../../components/QueryState";
import type { UseQueryResult } from "@tanstack/react-query";
import { WORDING } from "../../lib/wording/generated/wording";

type Kind = ProcedureSummary["kind"];

/** The one failure both the pull-down and the procedures sheet say. */
export const PROCEDURES_FAILED = "The FAA's procedures could not be fetched.";

/**
 * One kind of a field's procedures picked from a pull-down, at the
 * owner's pick ("B", 2026-10-19): the trigger says the one in the route,
 * and its panel lists the field's -- an approach's by runway, the runway
 * landed on (the runway chips', preselected into the wind) first and the
 * others each a page of the menu -- each with its transitions a page of
 * its own. No approach, or none of the kind, at the foot, and the field's
 * whole list (the Procedures sheet, with each one's fixes and plate)
 * after it. The list is asked for as the menu opens.
 */
export default function ProcedureMenu({
  ident,
  kind,
  list,
  query,
  picked,
  label,
  runway,
  windward,
  fixes = [],
  look = "chip",
  face,
  onOpen,
  onPick,
  onAll,
  onLearn,
  onDeactivate,
}: {
  ident: string;
  kind: Kind;
  /** The field's procedures, once asked for (onOpen). */
  list: ProcedureList | undefined;
  /** Its ask: while it comes the list's shape, and where it could not be
   *  had, that it could not with Try again -- never "None published", which
   *  told a pilot a field whose list failed has no approach. */
  query: UseQueryResult<ProcedureList> | undefined;
  /** The one of the kind in the route, and its name as the route's box
   *  says it. */
  picked: PickedProcedure | null;
  label: string | null;
  /** The runway landed on and the one into the wind, in a chip's form
   *  ("9L"): an approach's group first. */
  runway: string | null;
  windward: string | null;
  /** The picked one's fixes ATC can send the airplane direct to, in its
   *  order (its drawing's): with any, a page of them. */
  fixes?: string[];
  /** Its trigger (ProcedureTrigger's looks), and a row's words. */
  look?: TriggerLook;
  face?: ReactNode;
  onOpen: () => void;
  onPick: (next: { id: string; transition: string | null; direct?: string | null } | null) => void;
  onAll: () => void;
  /** The approach picked taught (ApproachLesson): its brief, flown with
   *  coaching, and a quiz. An approach's menu alone. */
  onLearn?: () => void;
  /** An approach activated, put back to loaded: off the route's line, not
   *  flown (its Activate on FPL's list beside it). */
  onDeactivate?: () => void;
}) {
  const all = (list?.procedures ?? []).filter((p) => p.kind === kind);
  const plates = usePreferences((s) => s.plates);
  // A runway's approaches and a procedure's transitions are pages pushed
  // in the panel's place, Back at the head's left to the one before.
  // Open, and its pages, kept by the field and the kind (useOpenMenu), not
  // in the component: the field's line draws its pull-downs anew as its
  // runways come in, open, and as the runway picked into the wind folds it,
  // a second or more later on a slow connection, and a menu opened before
  // that closed under the pilot's finger (procedures.spec and the iOS
  // audit, CI 2026-10-28).
  const menuKey = `${ident}:${kind}:${look}`;
  const me = useId();
  const open = useOpenMenu((s) => s.key === menuKey && s.owner === me);
  const pages = useOpenMenu((s) => (s.key === menuKey && s.owner === me ? s.pages : NO_PAGES));
  const setPages = (next: Page[]) => useOpenMenu.setState((s) => (s.owner === me ? { pages: next } : s));
  useKeptOpen(menuKey, me);
  const toggle = (next: boolean) => {
    if (next) {
      useOpenMenu.setState({ key: menuKey, owner: me, pages: [] });
      onOpen();
    } else if (useOpenMenu.getState().owner === me) {
      useOpenMenu.setState(CLOSED);
    }
  };
  // The whole list opens a sheet of its own: focus not handed back to the
  // trigger as this closes, which the sheet took for a tap outside it
  // and closed (the desktop's popover).
  const toSheet = useRef(false);
  const page = pages.at(-1) ?? null;
  const push = (next: Page) => setPages([...pages, next]);
  const pick = (next: { id: string; transition: string | null; direct?: string | null } | null) => {
    onPick(next);
    toggle(false);
  };
  const runwayName = (r: string) => (r === "Circling" ? "Circling" : `Runway ${r}${r === windward ? " · into the wind" : ""}`);
  // Each list's one choice React Aria's ListBox (ListPicks), as a reader
  // hears it ("selected, 2 of 5"): the arrow keys move between the choices
  // without picking one, since a pick here plans the route again and
  // closes the menu. A tap, Space or Enter picks.
  const item = (p: ProcedureSummary, name: string): ListPick => ({
    // Its transitions a page where it has any; else picked at a tap.
    id: p.id,
    title: name,
    chevron: p.transitions.length > 0,
    testId: "procedure-menu-item",
    act: () => (p.transitions.length > 0 ? push({ procedure: p, name }) : pick({ id: p.id, transition: null })),
  });
  const NO_CHOICE = "-";
  const { byRunway, first, others } = approachGroups(all, kind, runway, windward);
  // Another runway's row says the approach picked there, where it had a
  // tick drawn by hand: it opens that runway's page, and is no choice.
  const pickedOn = (r: string) => {
    const there = byRunway.get(r)?.find((p) => p.id === picked?.id);
    return there ? shortName(there) : undefined;
  };
  const title =
    page && "procedure" in page
      ? faaWords(page.procedure.name)
      : page && "direct" in page
        ? WORDING.directTo
        : page
          ? runwayName(page.runway)
          : `${ident} ${TITLE[kind].toLowerCase()}`;
  return (
    // Expanded as everything in the app is, at the owner's ask ("whenever
    // anything is expanded it should open with the title on top with a
    // back button on the left and close button on the right"): its title
    // on top, Back on the left once a page is pushed, the close on the
    // right; a fixed height, its list scrolling in it. On a phone a sheet
    // (ResponsivePopover), beside the trigger from md up.
    <ResponsivePopover open={open} onOpenChange={toggle}>
      {/* Opened by a tap -- its lift, as a button's click is -- not a touch. */}
      <ResponsivePopoverTrigger asChild>{procedureTrigger({ look, ident, kind, label, face })}</ResponsivePopoverTrigger>
      <ResponsivePopoverContent
        title={title}
        align="start"
        side="bottom"
        className="flex h-[26rem] w-80 flex-col gap-3 overflow-y-auto p-3"
        // No Back: the close goes back a page where one is pushed, at the owner's ask
        // ("remove the back buttons, because close button should behave as the back button", 2026-10-22).
        action={
          <CloseButton
            label={page ? "Back" : "Close"}
            onClick={() => (page ? setPages(pages.slice(0, -1)) : toggle(false))}
            data-testid="procedure-menu-close"
          />
        }
        data-testid="procedure-menu"
        finalFocus={() => {
          const keep = toSheet.current;
          toSheet.current = false;
          return !keep;
        }}
      >
        {page && "procedure" in page ? (
          <ListPicks
            label={`${faaWords(page.procedure.name)} transition`}
            selected={picked?.id === page.procedure.id ? (picked.transition ?? NO_CHOICE) : null}
            picks={[null, ...page.procedure.transitions].map((t) => ({
              id: t ?? NO_CHOICE,
              title: transitionWords(kind, t),
              testId: "procedure-menu-transition",
              act: () => pick({ id: page.procedure.id, transition: t }),
            }))}
          />
        ) : page && "direct" in page && picked ? (
          // A fix ATC sent the airplane to, at the owner's ask ("the ability
          // to go direct to a fix as told by ATC"): the procedure flown from
          // there, straight to it (wingtip.procedure_paths), or as charted.
          <ListPicks
            label="Direct to"
            selected={picked.direct ?? NO_CHOICE}
            picks={[null, ...fixes].map((f) => ({
              id: f ?? NO_CHOICE,
              title: f ?? "As Charted",
              testId: "procedure-menu-direct-fix",
              act: () => pick({ id: picked.id, transition: picked.transition, direct: f }),
            }))}
          />
        ) : page && "runway" in page ? (
          <ListPicks
            label={runwayName(page.runway)}
            selected={picked?.id ?? null}
            picks={(byRunway.get(page.runway) ?? []).map((p) => item(p, shortName(p)))}
          />
        ) : (
          <>
            {!list && query && (
              <QueryState query={query} fetching={`Fetching the ${TITLE[kind].toLowerCase()}s…`} failed={PROCEDURES_FAILED} />
            )}
            {list && all.length === 0 && (
              <p role="status" className={cn("px-1 text-muted-foreground", TEXT.detail)}>
                None published
              </p>
            )}
            {kind === "approach" && first !== null && (
              <>
                <ListPicks
                  label={runwayName(first)}
                  title={runwayName(first)}
                  selected={picked?.id ?? null}
                  picks={byRunway.get(first)!.map((p) => item(p, shortName(p)))}
                />
                {others.length > 0 && (
                  <ListGroup title="Other Runways">
                    {others.map((r) => (
                      <ListRow key={r} title={runwayName(r)} chevron value={pickedOn(r)} onClick={() => push({ runway: r })} />
                    ))}
                  </ListGroup>
                )}
              </>
            )}
            {kind !== "approach" && all.length > 0 && (
              <ListPicks label={TITLE[kind]} selected={picked?.id ?? null} picks={all.map((p) => item(p, shortName(p)))} />
            )}
            {picked && fixes.length > 0 && (
              <ListGroup>
                <ListRow
                  title={WORDING.directTo}
                  value={picked.direct ?? "As Charted"}
                  chevron
                  onClick={() => push({ direct: true })}
                  data-testid="procedure-menu-direct"
                />
              </ListGroup>
            )}
            <ListGroup>
              {/* The plate on the chart or not, at the owner's ask. */}
              {kind === "approach" && picked && (
                <ListRow title="Plate on the Map">
                  <Switch
                    checked={plates}
                    onCheckedChange={(on) => usePreferences.getState().setPlates(on)}
                    aria-label="Plate on the map"
                    data-testid="procedure-menu-plate"
                  />
                </ListRow>
              )}
              {/* The approach picked taught, at the owner's ask ("do it all",
                  2026-10-30): a card of its own, as the whole list's is. */}
              {kind === "approach" && picked && onLearn && (
                <ListRow
                  title="Learn This Approach"
                  chevron
                  onClick={() => {
                    toSheet.current = true;
                    toggle(false);
                    onLearn();
                  }}
                  data-testid="procedure-menu-learn"
                />
              )}
              {onDeactivate && (
                <ListRow
                  title="Deactivate"
                  onClick={() => {
                    toggle(false);
                    onDeactivate();
                  }}
                  data-testid="procedure-menu-deactivate"
                />
              )}
              {picked && <ListRow title={NONE[kind]} onClick={() => pick(null)} data-testid="procedure-menu-none" />}
              <ListRow
                title={ALL[kind]}
                chevron
                onClick={() => {
                  toSheet.current = true;
                  toggle(false);
                  onAll();
                }}
                data-testid="procedure-menu-all"
              />
            </ListGroup>
          </>
        )}
      </ResponsivePopoverContent>
    </ResponsivePopover>
  );
}

/** A page of the panel pushed in its place: a runway's approaches, or a
 *  procedure's transitions. */
type Page = { runway: string } | { procedure: ProcedureSummary; name: string } | { direct: true };
const NO_PAGES: Page[] = [];
const CLOSED = { key: null, owner: null, pages: NO_PAGES };

/** The one pull-down open -- a tap outside closes it -- by its field, kind
 *  and look ("KDLH:approach:add"), the one drawn that opened it (`owner`),
 *  and the pages pushed in it. */
const useOpenMenu = create<{ key: string | null; owner: string | null; pages: Page[] }>(() => CLOSED);

/** The pull-downs drawn now, by their useId. */
const drawn = new Set<string>();

/** An open pull-down drawn anew keeps open: the one drawn in its place, in
 *  the same commit, takes it over before it is painted. Put away for good
 *  -- the field out of the route -- it is closed a moment after, so it
 *  does not open by itself when that field's pull-down is next drawn. */
function useKeptOpen(key: string, me: string) {
  useLayoutEffect(() => {
    drawn.add(me);
    const s = useOpenMenu.getState();
    if (s.key === key && s.owner !== null && !drawn.has(s.owner)) useOpenMenu.setState({ owner: me });
    // Its field changed under it while open: another pull-down now.
    else if (s.owner === me && s.key !== key) useOpenMenu.setState(CLOSED);
    return () => {
      drawn.delete(me);
      window.setTimeout(() => {
        const now = useOpenMenu.getState();
        if (now.owner !== null && !drawn.has(now.owner)) useOpenMenu.setState(CLOSED);
      }, 0);
    };
  }, [key, me]);
}
