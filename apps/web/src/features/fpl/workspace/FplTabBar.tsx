import type { ComponentProps, ReactNode } from "react";
import { Toolbar } from "@base-ui/react/toolbar";
import { useVerdict } from "../../../lib/verdict";
import { findingRows } from "../vm/planWords";
import { FloatingBar, FloatingBarButton, TabCount } from "../../../components/FloatingBar";
import { ICON } from "../../../lib/icons";
import type { PlanSlices } from "../vm/planSlices";
import { MAKES_WAY } from "../../../components/sheet/pinAtFoot";
import { EDGE_ROOM } from "../../../components/sheet/insets";
import { FLOATING_BAR_SHEET_ROOM } from "../../../components/floatingBarLook";
import { cn } from "cn";
import { Search } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { askSearch } from "../../../lib/oneSearch";

/**
 * FPL's actions as a floating glass bar at the sheet's foot (the owner,
 * 2026-11-16: "make those action buttons as tab bar again and move the
 * calculations strip to where the action buttons are now"): Brief, Nav Log,
 * Profile, each its 24-point glyph over its word in one capsule, the one
 * floating bar the airport card's tabs are drawn in too (FloatingBar, the
 * same height and width; the owner, 2026-11-18), but buttons, not tabs:
 * each opens its card over FPL as the tiles did (the owner's pick, "Bar
 * look, open cards"), and last the route's one menu, ••• "More" (`more`,
 * ShareMenu's bar look; the owner, 2026-11-17: "move everything to the tab
 * bar with a ... instead of share"): the undo, the sharing, Save, File,
 * Plan again, the map's choices and Clear.
 * From half up; at the pill the figures alone, large (FlightFoot).
 * What the Brief found to act on is counted on its glyph's corner, red
 * where one is a stop, amber where all are cautions (CardTabBar's
 * FloatingBar's TabCount, the one badge, each colour one meaning): the findings themselves
 * are the Brief's, which opens with them (the owner, 2026-11-16: "isn't
 * there a better place for them? Like brief"), not a list on FPL. The
 * Profile's own altitude caution the same, a 1. Both said in their names.
 *
 * The capsule is Base UI's stock Toolbar (the owner, 2026-11-17: stock
 * parts where they avoid bugs): one tab stop, the arrows between its
 * buttons (the APG toolbar), as the playback bars are (PlaybackBar), and
 * each button a Toolbar.Button rendering a FloatingBarButton, the ••• the
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
    // Its room under it the floating bar's (FLOATING_BAR_SHEET_ROOM), in
    // place of the sheet's 8-point edge (EDGE_ROOM) under the foot: the
    // margin takes back the difference, 4 points with no home indicator.
    <div
      data-makes-way=""
      className={cn("pointer-events-none -mx-4 flex justify-center px-4 pt-2", MAKES_WAY)}
      style={{ marginBottom: `calc(${FLOATING_BAR_SHEET_ROOM} - ${EDGE_ROOM})` }}
      data-testid="fpl-actions"
    >
      {/* The one floating bar's capsule (FloatingBar), the airport
          card's too: glass only on what floats (rules.md). */}
      <Toolbar.Root aria-label="Route" render={<FloatingBar className="pointer-events-auto min-w-0 flex-1" />}>
        <BarAction
          icon={<ICON.brief />}
          badge={briefMark && found > 0 && <TabCount count={found} mark={briefMark} testId="route-brief-count" />}
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
          icon={<ICON.profile />}
          badge={altitudeMark && <TabCount count={1} mark="caution" testId="route-profile-count" />}
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
      {/* The search beside the bar, its own glass disc, as iOS 26's tab
          bars keep Search apart at their end (the owner, 2026-11-19: "a
          search button next to the bar below"), where it was the page
          toggle's magnifier at the top: the one search, its field up with
          the keyboard (askSearch). */}
      <Button
        variant="ghost"
        onClick={() => askSearch()}
        aria-label="Search"
        data-testid="fpl-search"
        className="liquid-glass pointer-events-auto ml-2 size-14 shrink-0 self-center rounded-full p-0 text-tint [--glass-blur:var(--glass-bar-blur)] [--glass-fill:var(--glass-bar-fill)]"
      >
        <Search className="size-8" strokeWidth={1.75} aria-hidden="true" />
      </Button>
    </div>
  );
}

/** One of the bar's buttons: a Toolbar.Button drawn as the bar's
 *  FloatingBarButton, which takes the button's ref, keys and roving tab
 *  stop. A greyed one is left out of the arrows' way, as a native disabled
 *  button is out of the Tab key's (focusableWhenDisabled off). */
function BarAction({ disabled, ...action }: ComponentProps<typeof FloatingBarButton>) {
  return <Toolbar.Button disabled={disabled} focusableWhenDisabled={false} render={<FloatingBarButton {...action} />} />;
}
