import type { ReactNode } from "react";
import { CardAction as Action } from "../../../../components/CardAction";
import { ICON } from "../../../../lib/icons";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";

/**
 * FPL's actions as a floating glass bar at the sheet's foot (the owner,
 * 2026-11-16: "make those action buttons as tab bar again and move the
 * calculations strip to where the action buttons are now"): Brief, Nav Log,
 * Profile and Share, each its 24-point glyph over its word in one capsule,
 * as the airport card's tabs are drawn (CardTabBar), but buttons, not tabs:
 * each opens its card over FPL as the tiles did (the owner's pick, "Bar
 * look, open cards"). Share is the plan's one Share menu (ShareMenu's
 * "send"). From half up; at the pill the figures alone, large (FlightFoot).
 * What the Brief and the Profile have found is said under the route
 * (FplFindings), and in their spoken names here.
 */
export function FplTabBar({ vm, share }: { vm: PlanWorkspaceModel; share: ReactNode }) {
  const { course } = vm.plan;
  const { openBrief, openNavLogCard, openProfile, profileReady } = vm.fpl;
  const { altitudeMark, briefMark } = vm.brief;
  return (
    <div className="flex justify-center pt-2" data-testid="fpl-actions">
      {/* The glass capsule, the airport card's bar's (CardTabBar): glass
          only on what floats (rules.md). Each button 56 tall in its
          columns, side by side, so their areas are over 44 points. */}
      <div className="liquid-glass grid h-16 max-w-full auto-cols-fr grid-flow-col rounded-full p-1 [--glass-blur:var(--glass-bar-blur)] [--glass-fill:var(--glass-bar-fill)]">
        <Action
          bar
          icon={<ICON.brief />}
          label="Brief"
          spoken={briefMark ? `Brief, ${briefMark === "stop" ? "warning" : "caution"}` : undefined}
          onClick={openBrief}
          testId="route-brief"
          data-finding={briefMark ?? undefined}
        />
        <Action bar icon={<ICON.navLog />} label="Nav Log" onClick={openNavLogCard} disabled={!course} testId="route-navlog" />
        <Action
          bar
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
    </div>
  );
}
