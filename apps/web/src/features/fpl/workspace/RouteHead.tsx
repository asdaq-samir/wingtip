import { Suspense, useEffect, useRef } from "react";
import { cn } from "cn";
import SectionTitle from "../../../components/SectionTitle";
import { Button } from "../../../components/ui/button";
import { TEXT } from "../../../lib/text";
import { RouteEditor, RouteTimeline } from "../routePanelParts";
import type { PlanSlices } from "../vm/planSlices";
import { keepTimelineHeight, routeEditing, routeTyped } from "./routeEditing";
import { EmptyRoute } from "./RouteStart";
import { useRouteListProps } from "./useRouteListProps";

/**
 * The route under FPL's first row (PlanWorkspace's `route`), in its one
 * layout (decision 0047): its timeline (RouteTimeline), where it is read
 * and edited at once. With no point yet, the same card with the two ends
 * to pick and the route to type (EmptyRoute; the owner, 2026-11-18: "the
 * empty fpl page looks a bit different than filled one"), no head over
 * it. A whole route typed in (RouteEditor, in the page under it, from
 * the keyboard button at Add a Stop's end) has "Route" over it and Done, as an iOS list's
 * Done, folding the field away. The airplane's strip is not here but the
 * first row's bar over it (FplBar).
 */
export default function RouteHead({
  vm,
}: {
  vm: PlanSlices<"brief" | "cards" | "flight" | "leg" | "picks" | "plan" | "route" | "routeList" | "stops" | "view">;
}) {
  const { hasPoints, wholeRoute } = vm.route;
  const { foldRoute } = vm.routeList;
  const editing = routeEditing(vm);
  // The route's field opened by the box's toggle (TypeRouteButton), on an
  // empty, half or whole route: the same box turned into the field, the
  // timeline not drawn over it and no "Route" row or Done (the owner,
  // 2026-11-22).
  const typed = routeTyped(vm);
  // The kept height let go once the field is folded (routeEditing).
  const { routeOpen } = vm.routeList;
  useEffect(() => {
    if (!routeOpen) keepTimelineHeight(0);
  }, [routeOpen]);
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
      {editing && wholeRoute && !typed && (
        <div className="flex h-11 items-center justify-between gap-2 pl-1">
          {/* The shared section title, in the drawer title's 17-point
              semibold it has always had over the typed route. */}
          <SectionTitle className={cn("font-semibold", TEXT.title)} data-testid="route-head">
            Route
          </SectionTitle>
          <Button
            variant="plain"
            size="inline"
            onClick={done}
            data-testid="route-done"
            // Its area the row's 44 tall (11 over and under its 22-point
            // line) and 8 past its words each side, nothing grown that is
            // seen: -inset-2 left it 38 tall (the iOS audit's P1, "Done"
            // 46×22).
            className={cn("relative px-1 font-semibold text-tint hit-x-2 hit-y-[11px]", TEXT.row)}
          >
            Done
          </Button>
        </div>
      )}
      {editing && !hasPoints && !typed && <EmptyRoute vm={vm} />}
      {/* The box turned into the route's field, in the timeline's own place. */}
      {typed && (
        <Suspense fallback={<div className="h-24 rounded-(--radius-card) bg-card" />}>
          <RouteEditor vm={vm} inPlace />
        </Suspense>
      )}
      {hasPoints && !typed && (
        // Its room while its code comes: two lines' height.
        <Suspense fallback={<div className="h-24 rounded-(--radius-banner) bg-card" />}>
          <RouteTimeline vm={vm} props={props} />
        </Suspense>
      )}
    </div>
  );
}
