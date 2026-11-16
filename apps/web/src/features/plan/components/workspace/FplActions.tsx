import { useRef, type ReactNode } from "react";
import { usePinAtFoot } from "../../../../components/sheet/pinAtFoot";
import { CardAction as Action } from "../../../../components/CardAction";
import { ICON } from "../../../../lib/icons";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";
import RouteHead from "./RouteHead";
import { FlightFigures } from "./FlightFoot";

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

/** FPL's route row, the flight's figures under it at their own size (the
 *  owner, 2026-11-16: the calculations strip where the action tiles were):
 *  the page's `route` (PlanWorkspace),
 *  a column the row's width, as the sheet lays the route in a row
 *  (MapPage's routeRowOf), where a grid alone had no width. */
export function FplRoute({ vm }: { vm: PlanWorkspaceModel }) {
  // The figures stop at the screen's foot as the sheet goes down, where
  // the pill's own are, and stay there while the route slides on under
  // them (usePinAtFoot), drawn as the pill's own while held (PINNED).
  const figures = useRef<HTMLDivElement>(null);
  usePinAtFoot(figures, SHEET_FOOT);
  return (
    <div className="flex w-full min-w-0 flex-1 flex-col">
      <RouteHead vm={vm} />
      {/* At the pill out of sight with the rest of the route's row, rising
          with the sheet as the foot's figures fade out (PillHandover), a
          quiet copy till then, the pill's own being the one in sight. */}
      <div className="pt-2 pb-1">
        <div ref={figures} className={PINNED}>
          <FlightFigures vm={vm} grow={false} quiet={!vm.view.panelOpen} />
        </div>
      </div>
    </div>
  );
}

/** FPL's foot, whose edge the pill's own figures sit on (FlightFoot's PillHandover). */
const SHEET_FOOT = '[data-testid="panel-foot"]';

/** The figures held at the foot (data-pinned) drawn as the pill's own,
 *  so the handover at the pill moves nothing (the owner, 2026-11-16: "is
 *  it changing size at the end? And do you see a small gap below/above
 *  the strip?"): the sheet's width with the foot's 16-point sides, where
 *  the head's 12 laid them 8 points wider; over everything in the head
 *  (the airplane's bar's glass capsules stack above the figures' row);
 *  and on the sheet's solid colour from just under the grabber to the
 *  screen's foot, where the figures' own box let the route's white box
 *  show a line above and below them. */
const PINNED =
  "relative data-pinned:z-30 data-pinned:-mx-3 data-pinned:px-4 data-pinned:bg-(--sheet) data-pinned:after:absolute data-pinned:after:inset-x-0 data-pinned:after:-top-1.5 data-pinned:after:-bottom-10 data-pinned:after:-z-10 data-pinned:after:bg-(--sheet)";
