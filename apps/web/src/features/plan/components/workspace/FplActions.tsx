import type { ReactNode } from "react";
import { cn } from "cn";
import { CardAction as Action } from "../../../../components/CardAction";
import { ICON } from "../../../../lib/icons";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";
import RouteHead from "./RouteHead";

/** A finding's dot on a tile's glyph: the Brief's worst page, the
 *  Profile's altitude. */
function Marked({ children, mark, testId }: { children: ReactNode; mark: "stop" | "caution" | null; testId: string }) {
  return (
    <span className="relative">
      {children}
      {mark && (
        <span
          aria-hidden="true"
          data-testid={testId}
          className={cn("absolute -top-0.5 -right-1 size-2 rounded-full", mark === "stop" ? "bg-destructive" : "bg-caution")}
        />
      )}
    </span>
  );
}

/**
 * FPL's actions under its route, one row of four tiles as the airport
 * card's are (CardAction; the owner's pick A of the FPL buttons canvas,
 * 2026-11-15, Hr6eKFhyFBLjAAAmEaq8HB): the Brief, marked as its worst page
 * is; the Nav Log; the Profile, marked where the altitude is tight or has
 * a caution; and Share (`share`, ShareMenu's "send"), one menu for every
 * way the plan leaves the app. The airplane's strip over the route keeps
 * the N-number, the altitude and the route's ••• (RouteControls). Only
 * once there is a route.
 */
export function FplActions({ vm, share, inFlight = false }: { vm: PlanWorkspaceModel; share: ReactNode; inFlight?: boolean }) {
  const { routed } = vm.route;
  const { flying } = vm.flight;
  const { course } = vm.plan;
  const { openBrief, openNavLogCard, openProfile, profileReady } = vm.fpl;
  const { altitudeMark, briefMark } = vm.brief;
  // One row at a time: under the route on the ground, at the top of the
  // flight's view while flying, where the route's row is not drawn (SheetParts).
  if (!routed || flying !== inFlight) return null;
  return (
    // 56 tall as the airport card's (PlaceActions), eight apart so their
    // 44-point areas meet.
    <div className="grid grid-cols-4 gap-2 pt-2 pb-1 *:min-h-14" data-testid="fpl-actions">
      <Action
        icon={
          <Marked mark={briefMark ?? null} testId="route-brief-mark">
            <ICON.brief />
          </Marked>
        }
        label="Brief"
        spoken={briefMark ? `Brief, ${briefMark === "stop" ? "warning" : "caution"}` : undefined}
        onClick={openBrief}
        testId="route-brief"
        data-finding={briefMark ?? undefined}
      />
      <Action icon={<ICON.navLog />} label="Nav Log" onClick={openNavLogCard} disabled={!course} testId="route-navlog" />
      <Action
        icon={
          <Marked mark={altitudeMark ? "caution" : null} testId={altitudeMark === "tight" ? "tight-altitude-flag" : "own-altitude-flag"}>
            <ICON.profile />
          </Marked>
        }
        label="Profile"
        spoken={
          altitudeMark === "caution"
            ? "Profile, your altitude has a caution"
            : altitudeMark === "tight"
              ? "Profile, your altitude is tight"
              : undefined
        }
        onClick={openProfile}
        disabled={!profileReady}
        testId="route-profile"
      />
      {share}
    </div>
  );
}

/** FPL's route row and its tiles under it, the page's `route`
 *  (PlanWorkspace): a column the row's width, as the sheet lays the route
 *  in a row (MapPage's routeRowOf), where a grid alone had no width. */
export function FplRoute({ vm, share }: { vm: PlanWorkspaceModel; share: ReactNode }) {
  return (
    <div className="flex w-full min-w-0 flex-1 flex-col">
      <RouteHead vm={vm} />
      <FplActions vm={vm} share={share} />
    </div>
  );
}
