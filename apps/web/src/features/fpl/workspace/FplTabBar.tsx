import type { ReactNode } from "react";
import { useVerdict } from "../../../lib/verdict";
import { findingRows } from "../vm/planWords";
import { CardAction as Action } from "../../../components/CardAction";
import { GlassBar, TabCount } from "../../../components/CardTabBar";
import { ICON } from "../../../lib/icons";
import type { PlanSlices } from "../vm/planSlices";

/**
 * FPL's actions as a floating glass bar at the sheet's foot (the owner,
 * 2026-11-16: "make those action buttons as tab bar again and move the
 * calculations strip to where the action buttons are now"): Brief, Nav Log,
 * Profile, each its 24-point glyph over its word in one capsule,
 * as the airport card's tabs are drawn (CardTabBar), but buttons, not tabs:
 * each opens its card over FPL as the tiles did (the owner's pick, "Bar
 * look, open cards"), and last the route's one menu, ••• "More" (`more`,
 * ShareMenu's bar look; the owner, 2026-11-17: "move everything to the tab
 * bar with a ... instead of share"): the undo, the sharing, Save, File,
 * Plan again, the map's choices and Clear.
 * From half up; at the pill the figures alone, large (FlightFoot).
 * What the Brief found to act on is counted on its glyph's corner, red
 * where one is a stop, amber where all are cautions (CardTabBar's
 * TabCount, the one badge, each colour one meaning): the findings themselves
 * are the Brief's, which opens with them (the owner, 2026-11-16: "isn't
 * there a better place for them? Like brief"), not a list on FPL. The
 * Profile's own altitude caution the same, a 1. Both said in their names.
 */
export function FplTabBar({ vm, more }: { vm: PlanSlices<"brief" | "fpl" | "plan">; more: ReactNode }) {
  const { course } = vm.plan;
  const { openBrief, openNavLogCard, openProfile, profileReady } = vm.fpl;
  const { altitudeMark, briefMark } = vm.brief;
  const found = findingRows(useVerdict((v) => v.items)).length;
  return (
    // Over a fade to the sheet's own colour from a little above it, as
    // iOS 26 fades what scrolls under a floating bar (its scroll edge
    // effect): at half the route's rows ran on under the glass and showed
    // through it, half read ("Pick an airplane" under Share; the UI
    // audit's B1, 2026-11-17). The fade's room taken back from above, so
    // the bar stays where it was; only the capsule takes taps. Across the
    // sheet's whole width, out over the foot's 16-point sides (SheetParts'
    // px-4): narrower, the airport cards' fill (drawn out past the column,
    // FIELD_CARD) showed its edges either side of a lighter box round the
    // bar, a box in a box.
    <div
      className="pointer-events-none -mx-4 -mt-6 flex justify-center bg-linear-to-b from-transparent to-(--sheet) to-50% px-4 pt-8"
      data-testid="fpl-actions"
    >
      {/* The glass capsule, the airport card's bar's (CardTabBar): glass
          only on what floats (rules.md). Each button 56 tall in its
          columns, side by side, so their areas are over 44 points. */}
      <GlassBar className="pointer-events-auto grid h-16 max-w-full auto-cols-fr grid-flow-col">
        <Action
          bar
          icon={
            <span className="relative flex">
              <ICON.brief />
              {briefMark && found > 0 && <TabCount count={found} mark={briefMark} testId="route-brief-count" />}
            </span>
          }
          label="Brief"
          spoken={briefMark && found > 0 ? `Brief, ${found} ${found === 1 ? "finding" : "findings"} to look at` : undefined}
          onClick={openBrief}
          // Nothing to brief while a point of the route is not known, as
          // the Nav Log and the Profile have nothing (the UI audit's B8).
          disabled={!!vm.plan.s.unknownPlace}
          testId="route-brief"
          data-finding={briefMark ?? undefined}
        />
        <Action bar icon={<ICON.navLog />} label="Nav Log" onClick={openNavLogCard} disabled={!course} testId="route-navlog" />
        <Action
          bar
          icon={
            <span className="relative flex">
              <ICON.profile />
              {altitudeMark && <TabCount count={1} mark="caution" testId="route-profile-count" />}
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
        {more}
      </GlassBar>
    </div>
  );
}
