import type { ReactNode } from "react";
import { cn } from "cn";
import { TEXT } from "../../../../lib/text";
import { useVerdict } from "../../../../lib/verdict";
import { findingRows } from "../../hooks/planWords";
import { CardAction as Action } from "../../../../components/CardAction";
import { FloatingBar } from "../../../../components/CardTabBar";
import { ICON } from "../../../../lib/icons";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";

/** A count over a glyph's corner, in its finding's colour. */
function Count({ count, mark, testId }: { count: number; mark: "stop" | "caution"; testId: string }) {
  return (
    <span
      aria-hidden
      data-testid={testId}
      data-finding={mark}
      className={cn(
        "pointer-events-none absolute -top-2 left-full -ml-2 min-w-4 rounded-full px-1 text-center leading-4 font-semibold tabular-nums",
        mark === "stop" ? "bg-destructive text-white" : "bg-caution text-black",
        TEXT.caption,
      )}
    >
      {count}
    </span>
  );
}

/**
 * FPL's actions as a floating glass bar at the sheet's foot (the owner,
 * 2026-11-16: "make those action buttons as tab bar again and move the
 * calculations strip to where the action buttons are now"): Brief, Nav Log,
 * Profile and Share, each its 24-point glyph over its word in one capsule,
 * as the airport card's tabs are drawn (CardTabBar), but buttons, not tabs:
 * each opens its card over FPL as the tiles did (the owner's pick, "Bar
 * look, open cards"). Share is the plan's one Share menu (ShareMenu's
 * "send"). In FPL's page as a card's tabs are in the card (FloatingBar),
 * out of sight at the pill with the page, whose top is then the figures.
 * What the Brief found to act on is counted on its glyph's corner, red
 * where one is a stop, amber where all are cautions, as the airport card's
 * tabs carry their counts (CardTabBar's TabCount): the findings themselves
 * are the Brief's, which opens with them (the owner, 2026-11-16: "isn't
 * there a better place for them? Like brief"), not a list on FPL. The
 * Profile's own altitude caution the same, a 1. Both said in their names.
 */
export function FplTabBar({ vm, share }: { vm: PlanWorkspaceModel; share: ReactNode }) {
  const { course } = vm.plan;
  const { openBrief, openNavLogCard, openProfile, profileReady } = vm.fpl;
  const { altitudeMark, briefMark } = vm.brief;
  const found = findingRows(useVerdict((v) => v.items)).length;
  return (
    <FloatingBar testId="fpl-actions">
      {/* The glass capsule, the airport card's bar's (CardTabBar): glass
          only on what floats (rules.md). Each button 56 tall in its
          columns, side by side, so their areas are over 44 points. */}
      <div className="liquid-glass pointer-events-auto mx-auto grid h-16 w-fit max-w-full auto-cols-fr grid-flow-col rounded-full p-1 [--glass-blur:var(--glass-bar-blur)] [--glass-fill:var(--glass-bar-fill)]">
        <Action
          bar
          icon={
            <span className="relative flex">
              <ICON.brief />
              {briefMark && found > 0 && <Count count={found} mark={briefMark} testId="route-brief-count" />}
            </span>
          }
          label="Brief"
          spoken={briefMark && found > 0 ? `Brief, ${found} ${found === 1 ? "finding" : "findings"} to look at` : undefined}
          onClick={openBrief}
          testId="route-brief"
          data-finding={briefMark ?? undefined}
        />
        <Action bar icon={<ICON.navLog />} label="Nav Log" onClick={openNavLogCard} disabled={!course} testId="route-navlog" />
        <Action
          bar
          icon={
            <span className="relative flex">
              <ICON.profile />
              {altitudeMark && <Count count={1} mark="caution" testId="route-profile-count" />}
            </span>
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
    </FloatingBar>
  );
}
