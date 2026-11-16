import type { ReactNode } from "react";
import { CardAction as Action } from "../../../../components/CardAction";
import { ICON } from "../../../../lib/icons";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";
import RouteHead from "./RouteHead";
import { FplFindings } from "./FplFindings";

/**
 * FPL's actions under its route, one row of four tiles as the airport
 * card's are (CardAction; the owner's pick A of the FPL buttons canvas,
 * 2026-11-15, Hr6eKFhyFBLjAAAmEaq8HB): the Brief, the Nav Log, the Profile
 * and Share (`share`, ShareMenu's "send"), one menu for every
 * way the plan leaves the app. The airplane's strip over the route keeps
 * the N-number, the altitude and the route's ••• (RouteControls). Only
 * once there is a route. What the Brief and the Profile have found is said
 * in words under the row (FplFindings), not as dots on their glyphs, which
 * said there was something but not what (the routes canvas, 2026-11-16);
 * VoiceOver still hears it in their names.
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
        icon={<ICON.brief />}
        label="Brief"
        spoken={briefMark ? `Brief, ${briefMark === "stop" ? "warning" : "caution"}` : undefined}
        onClick={openBrief}
        testId="route-brief"
        data-finding={briefMark ?? undefined}
      />
      <Action icon={<ICON.navLog />} label="Nav Log" onClick={openNavLogCard} disabled={!course} testId="route-navlog" />
      <Action
        icon={<ICON.profile />}
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
      <FplFindings vm={vm} />
    </div>
  );
}
