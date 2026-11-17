import { Suspense, useEffect, useRef } from "react";
import { cn } from "cn";
import { Button } from "../../../components/ui/button";
import { TEXT } from "../../../lib/text";
import { placeName } from "../../plan";
import { RouteSummary } from "../routePanelParts";
import type { PlanSlices } from "../vm/planSlices";
import { routeEditing } from "./routeEditing";

/**
 * The route under FPL's first row (PlanWorkspace's `route`), in its one
 * layout (the owner, 2026-11-17, decision 0046): folded, its one line to
 * read (RouteSummary), a tap opening it; open, the head over its airport
 * cards (RouteEditor, in the page under it): "Route" and Done, as an iOS
 * list's Edit and Done, Done or a tap on "Route" folding it again. Before
 * the route is whole it is open, "Route" alone. The airplane's strip is
 * not here but the first row's bar over it (FplBar).
 */
export default function RouteHead({ vm }: { vm: PlanSlices<"flight" | "plan" | "route" | "routeList"> }) {
  const { planned, wholeRoute } = vm.route;
  const { course, s } = vm.plan;
  const { foldRoute, openRoute } = vm.routeList;
  const editing = routeEditing(vm);
  // A tap that opens or folds it keeps the focus on the toggle that is
  // there after it ("Route" open, the line folded) and says so to
  // VoiceOver; a fold or an open by anything else moves nothing.
  const toggled = useRef(false);
  const head = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!toggled.current) return;
    toggled.current = false;
    // React Aria's announcer, off the first load: fetched as it is wanted.
    const said = editing ? "Editing the route" : "Done editing the route";
    void import("@react-aria/live-announcer").then(({ announce }) => announce(said, "polite"));
    const sheet = head.current?.closest("[data-sheet-scroll]") ?? document;
    sheet.querySelector<HTMLElement>("[data-route-toggle]")?.focus();
  }, [editing]);
  const toggle = (open: boolean) => () => {
    toggled.current = true;
    if (open) openRoute();
    else foldRoute();
  };
  // Done only where it can fold: a route whole and known.
  const canFold = wholeRoute && !s.unknownPlace;
  return (
    <div ref={head} className="flex min-w-0 flex-1 flex-col" data-testid={editing ? "route-editing" : "route-folded"}>
      {editing ? (
        <div className="flex h-11 items-center justify-between gap-2 pl-1">
          {canFold ? (
            <Button
              variant="plain"
              size="inline"
              onClick={toggle(false)}
              aria-expanded
              data-route-toggle=""
              data-testid="route-head"
              className={cn("relative font-semibold after:absolute after:-inset-2 after:content-['']", TEXT.title)}
            >
              Route
            </Button>
          ) : (
            <h2 className={cn("font-semibold", TEXT.title)} data-testid="route-head">
              Route
            </h2>
          )}
          {canFold && (
            <Button
              variant="plain"
              size="inline"
              onClick={toggle(false)}
              data-testid="route-done"
              className={cn("relative px-1 font-semibold text-tint after:absolute after:-inset-2 after:content-['']", TEXT.row)}
            >
              Done
            </Button>
          )}
        </div>
      ) : (
        // Its room while its code comes: the line's own height.
        <Suspense fallback={<div className="h-[3.25rem] rounded-full bg-card" />}>
          <RouteSummary
            dep={planned.dep}
            dest={planned.dest}
            stops={planned.stops}
            depName={course ? placeName(course.departure.name, course.departure.ident) : null}
            destName={course ? placeName(course.destination.name, course.destination.ident) : null}
            onOpen={toggle(true)}
          />
        </Suspense>
      )}
    </div>
  );
}
