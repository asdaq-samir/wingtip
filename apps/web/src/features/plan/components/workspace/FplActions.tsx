import type { ReactNode } from "react";
import { CardAction as Action } from "../../../../components/CardAction";
import { ICON } from "../../../../lib/icons";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";
import RouteHead from "./RouteHead";

/**
 * FPL's actions in flight, one row of four tiles at the top of the flying
 * drawer, as the airport card's are (CardAction; the owner's pick A of the
 * FPL buttons canvas, 2026-11-15, Hr6eKFhyFBLjAAAmEaq8HB): the Brief, the
 * Nav Log, the Profile and Share (`share`, ShareMenu's "send"), one menu
 * for every way the plan leaves the app. In flight the foot is the
 * figures, large, and Done flying; on the ground the four are the foot's
 * floating bar (FplTabBar). Only once there is a route; VoiceOver hears
 * the Brief's and the Profile's findings in their names.
 */
export function FplActions({ vm, share }: { vm: PlanWorkspaceModel; share: ReactNode }) {
  const { routed } = vm.route;
  const { flying } = vm.flight;
  const { course } = vm.plan;
  const { openBrief, openNavLogCard, openProfile, profileReady } = vm.fpl;
  const { altitudeMark, briefMark } = vm.brief;
  // In flight only, at the top of the flight's view, where the route's row
  // is not drawn (SheetParts); on the ground they are the foot's floating
  // bar (FplTabBar).
  if (!routed || !flying) return null;
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

/** FPL's route row, the page's `route` (PlanWorkspace): a column the
 *  row's width, as the sheet lays the route in a row (MapPage's
 *  routeRowOf), where a grid alone had no width. The flight's figures are
 *  the page's top, over its bar (pages' figures; the owner, 2026-11-16). */
export function FplRoute({ vm }: { vm: PlanWorkspaceModel }) {
  return (
    <div className="flex w-full min-w-0 flex-1 flex-col">
      <RouteHead vm={vm} />
    </div>
  );
}
