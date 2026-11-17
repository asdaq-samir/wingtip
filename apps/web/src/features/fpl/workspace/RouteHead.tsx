import { Suspense, useEffect, useRef } from "react";
import { cn } from "cn";
import { Button } from "../../../components/ui/button";
import { TEXT } from "../../../lib/text";
import { RouteTimeline } from "../routePanelParts";
import type { PlanSlices } from "../vm/planSlices";
import { routeEditing } from "./routeEditing";
import { useRouteListProps } from "./useRouteListProps";

/**
 * The route under FPL's first row (PlanWorkspace's `route`), in its one
 * layout (decision 0046): its timeline (RouteTimeline), where it is read
 * and edited at once, once it has a point. While its field is open
 * (RouteEditor, in the page under it: a new plan, half a route, or a
 * route typed in), "Route" over it, and Done once the route is whole, as
 * an iOS list's Done, folding the field away. The airplane's strip is not
 * here but the first row's bar over it (FplBar).
 */
export default function RouteHead({
  vm,
}: {
  vm: PlanSlices<"brief" | "cards" | "flight" | "leg" | "picks" | "plan" | "route" | "routeList" | "stops">;
}) {
  const { hasPoints, wholeRoute } = vm.route;
  const { foldRoute } = vm.routeList;
  const editing = routeEditing(vm);
  const props = useRouteListProps(vm);
  // Done keeps the focus on the timeline that is there after it and says
  // so to VoiceOver; a fold by anything else moves nothing.
  const toggled = useRef(false);
  const head = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!toggled.current || editing) return;
    toggled.current = false;
    // React Aria's announcer, off the first load: fetched as it is wanted.
    void import("@react-aria/live-announcer").then(({ announce }) => announce("Done editing the route", "polite"));
    head.current?.querySelector<HTMLElement>("[data-testid=timeline-ident]")?.focus();
  }, [editing]);
  const done = () => {
    toggled.current = true;
    foldRoute();
  };
  return (
    <div ref={head} className="flex min-w-0 flex-1 flex-col gap-2" data-testid={editing ? "route-editing" : "route-folded"}>
      {editing && (
        <div className="flex h-11 items-center justify-between gap-2 pl-1">
          <h2 className={cn("font-semibold", TEXT.title)} data-testid="route-head">
            Route
          </h2>
          {wholeRoute && (
            <Button
              variant="plain"
              size="inline"
              onClick={done}
              data-testid="route-done"
              className={cn("relative px-1 font-semibold text-tint after:absolute after:-inset-2 after:content-['']", TEXT.row)}
            >
              Done
            </Button>
          )}
        </div>
      )}
      {hasPoints && (
        // Its room while its code comes: two lines' height.
        <Suspense fallback={<div className="h-24 rounded-(--radius-banner) bg-card" />}>
          <RouteTimeline vm={vm} props={props} />
        </Suspense>
      )}
    </div>
  );
}
