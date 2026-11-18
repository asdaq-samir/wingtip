import type { ComponentProps, ReactNode } from "react";
import { Toolbar } from "@base-ui/react/toolbar";
import { useVerdict } from "../../../lib/verdict";
import { findingRows } from "../vm/planWords";
import { CardAction as Action } from "../../../components/CardAction";
import { GlassBar, TabCount } from "../../../components/CardTabBar";
import { ICON } from "../../../lib/icons";
import type { PlanSlices } from "../vm/planSlices";
import { MAKES_WAY } from "../../../components/sheet/pinAtFoot";
import { cn } from "cn";

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
 *
 * The capsule is Base UI's stock Toolbar (the owner, 2026-11-17: stock
 * parts where they avoid bugs): one tab stop, the arrows between its
 * buttons (the APG toolbar), as the playback bars are (PlaybackBar), and
 * each button a Toolbar.Button rendering its CardAction, the ••• the
 * route's menu's trigger rendering one (ShareMenu's `look="bar"`).
 */
export function FplTabBar({ vm, more }: { vm: PlanSlices<"brief" | "fpl" | "plan">; more: ReactNode }) {
  const { course } = vm.plan;
  const { openBrief, openNavLogCard, openProfile, profileReady } = vm.fpl;
  const { altitudeMark, briefMark } = vm.brief;
  const found = findingRows(useVerdict((v) => v.items)).length;
  return (
    // See-through, as the airport card's bar is (CardTabBar): the route
    // runs on under the glass, whose own denser bar fill and blur keep its
    // words readable (the owner, 2026-11-18: "tabs bar is not see through?
    // Is it different then airport card?"), where a fade to the sheet's
    // solid colour behind it (the UI audit's B1) hid the route as a white
    // band. Across the sheet's whole width, out over the foot's 16-point
    // sides (SheetParts' px-4); only the capsule takes taps. Never an edge
    // the route's figures stop at: they pass under it as anything does,
    // and it moves down out of their way as the sheet goes down toward the
    // pill, where they are held on the foot's edge (data-makes-way,
    // sheet/pinAtFoot's MAKES_WAY; the owner, 2026-11-18: "the main issue
    // is tab bar is not allowing the figures to go past it").
    <div data-makes-way="" className={cn("pointer-events-none -mx-4 flex justify-center px-4 pt-2", MAKES_WAY)} data-testid="fpl-actions">
      {/* The glass capsule, the airport card's bar's (CardTabBar): glass
          only on what floats (rules.md). Each button 56 tall in its
          columns, side by side, so their areas are over 44 points. */}
      <Toolbar.Root
        aria-label="Route"
        render={<GlassBar className="pointer-events-auto grid h-16 max-w-full auto-cols-fr grid-flow-col" />}
      >
        <BarAction
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
        <BarAction icon={<ICON.navLog />} label="Nav Log" onClick={openNavLogCard} disabled={!course} testId="route-navlog" />
        <BarAction
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
      </Toolbar.Root>
    </div>
  );
}

/** One of the bar's buttons: a Toolbar.Button drawn as a CardAction in
 *  its bar look, which takes the button's ref, keys and roving tab stop. A
 *  greyed one is left out of the arrows' way, as a native disabled button
 *  is out of the Tab key's (focusableWhenDisabled off). */
function BarAction({ disabled, ...action }: Omit<ComponentProps<typeof Action>, "bar">) {
  return <Toolbar.Button disabled={disabled} focusableWhenDisabled={false} render={<Action bar {...action} />} />;
}
