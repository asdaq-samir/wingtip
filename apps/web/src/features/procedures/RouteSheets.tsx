import { lazy, Suspense, type ReactElement } from "react";
import CloseButton from "../../components/CloseButton";
import { ResponsivePopover, ResponsivePopoverAnchor, ResponsivePopoverContent } from "../../components/ResponsivePopover";
import { sameField } from "../../lib/procedures";
import { loadPointAltitudeDialog } from "../route";
import { plateTitle } from "../plates";
import { ProcedurePage, ProcedurePicker } from "./ProcedureSheet";
import { listTitle } from "./procedureWords";
import type { ProceduresRouteModel } from "./useProceduresRoute";

// Opened only from a point's menu, so fetched as one first is: in the
// first load they took it over its 1.10 MB budget (CI, 2026-10-20).
const FixFromDialog = lazy(() => import("./FixFromDialog"));
const PointAltitudeDialog = lazy(() => loadPointAltitudeDialog());
const HoldSheet = lazy(() => import("./HoldSheet"));
const ApproachLesson = lazy(() => import("./ApproachLesson"));

/**
 * The sheets the route opens over it, the same for FPL's timeline
 * (TimelineRoute, on the ground) and the list read in flight
 * (ProceduresRoute): a hold, an approach taught, a point's altitude, a fix
 * made off a point, and the procedures' own sheet -- a field's kind's list,
 * then one procedure's page, its fixes and plate and Add to Route, the map
 * above it drawing it as it is chosen (`onPreview`), as ForeFlight's
 * Procedure Advisor keeps it. `children`, what the procedures' sheet is
 * anchored to beside it on a desktop: the route itself.
 */
export function RouteSheets({ vm, children }: { vm: ProceduresRouteModel; children: ReactElement }) {
  const {
    airports,
    onCharts,
    chartsDisabled,
    onPreview,
    at,
    onPointAltitude,
    onCreateFix,
    onHoldSet,
    fit,
    on,
    procedure,
    setPage,
    editing,
    setEditing,
    fixFrom,
    setFixFrom,
    holdAt,
    setHoldAt,
    editingUsed,
    fixFromUsed,
    holdUsed,
    lesson,
    setLesson,
    lessonUsed,
    lists,
    pick,
    close,
    destination,
    field,
    list,
    chosen,
    stale,
    windOf,
  } = vm;
  return (
    <>
      {/* Its own popover beside the procedures' sheet's, not inside its root:
        there, on a desktop, it closed as it opened. */}
      {holdUsed && (
        <Suspense fallback={null}>
          <HoldSheet
            at={holdAt}
            onClose={() => setHoldAt(null)}
            onSet={(fix, hold) => {
              onHoldSet(fix, hold);
              setHoldAt(null);
            }}
          />
        </Suspense>
      )}
      {lessonUsed && (
        <Suspense fallback={null}>
          <ApproachLesson at={lesson} aircraft={fit?.aircraft ?? null} onClose={() => setLesson(null)} />
        </Suspense>
      )}
      {/* On a phone its card opens at half whatever it covers, the
            procedure on the map over it in sight. */}
      <ResponsivePopover
        open={!!at}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <ResponsivePopoverAnchor asChild>{children}</ResponsivePopoverAnchor>
        {editingUsed && (
          <Suspense fallback={null}>
            <PointAltitudeDialog
              point={editing}
              onClose={() => setEditing(null)}
              onSet={(ident, feet) => {
                onPointAltitude(editing?.key ?? ident, feet);
                setEditing(null);
              }}
            />
          </Suspense>
        )}
        {fixFromUsed && (
          <Suspense fallback={null}>
            <FixFromDialog
              from={fixFrom}
              onClose={() => setFixFrom(null)}
              onCreate={(ident) => {
                if (fixFrom) onCreateFix(fixFrom, ident);
                setFixFrom(null);
              }}
            />
          </Suspense>
        )}
        {/* On a phone a card in the map's panel (ResponsivePopover), half
          way up, the map above it in sight and clear as a procedure is
          picked, as ForeFlight's Procedure Advisor keeps it, at the
          owner's pick. */}
        <ResponsivePopoverContent
          // The FAA's name as the plate's card writes it, "KDLH ILS or LOC
          // rwy 09", one way everywhere (the audit's WEB-11).
          title={on ? (procedure ? plateTitle(on.ident, procedure.name) : listTitle(on.ident, on.kind)) : "Procedures"}
          className="max-h-[70vh] w-80 overflow-y-auto p-3"
          align="start"
          side="right"
          // No Back: the close goes back to the list from a procedure's page,
          // at the owner's ask ("close button should behave as the back
          // button", 2026-10-22).
          action={
            <CloseButton
              label={procedure ? "Back" : "Close"}
              onClick={() => (procedure ? setPage(null) : close())}
              data-testid="procedures-close"
            />
          }
        >
          {on &&
            (procedure ? (
              <ProcedurePage
                key={`${on.ident}:${procedure.id}`}
                kind={on.kind}
                ident={on.ident}
                procedure={procedure}
                chosen={chosen?.id === procedure.id ? chosen : null}
                stale={stale}
                onAdd={(transition) => {
                  pick(on.ident, on.kind, { id: procedure.id, transition });
                  close();
                }}
                onRemove={() => pick(on.ident, on.kind, null)}
                onPreview={onPreview}
                onChart={
                  field === destination && !chartsDisabled
                    ? () => {
                        close();
                        onCharts();
                      }
                    : null
                }
              />
            ) : (
              <ProcedurePicker
                key={`${on.ident}:${on.kind}`}
                kind={on.kind}
                list={list}
                chosen={chosen}
                stale={stale}
                query={lists[airports.findIndex((a) => sameField(a.ident, on.ident))]}
                wind={windOf(on.ident)}
                onOpen={(p) => setPage({ at: on, procedure: p })}
              />
            ))}
        </ResponsivePopoverContent>
      </ResponsivePopover>
    </>
  );
}
