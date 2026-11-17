import { useRef, type ReactNode } from "react";
import { cn } from "cn";
import { PIN_AT_FOOT, usePinAtFoot } from "../../../../components/sheet/pinAtFoot";
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

/** FPL's route row, the flight's figures under it, which are its pill too
 *  (the owner, 2026-11-16: the calculations strip where the action tiles were):
 *  the page's `route` (PlanWorkspace),
 *  a column the row's width, as the sheet lays the route in a row
 *  (MapPage's routeRowOf), where a grid alone had no width. */
export function FplRoute({ vm }: { vm: PlanWorkspaceModel }) {
  const { panelOpen } = vm.view;
  const { dryRunning, flying } = vm.flight;
  // The figures are FPL's pill too, one copy at every size: held on the
  // foot's edge at the pill, and as the sheet goes down they stop there
  // while the route slides on under them (usePinAtFoot), drawn there as
  // the pill (PINNED). On the ground: in flight and in a dry run the foot
  // holds their own figures.
  const ground = !flying && !dryRunning;
  const figures = useRef<HTMLDivElement>(null);
  usePinAtFoot(figures, SHEET_FOOT, { on: ground, held: ground && !panelOpen });
  return (
    <div className="flex w-full min-w-0 flex-1 flex-col">
      <RouteHead vm={vm} />
      <div className="pt-2 pb-1">
        <div ref={figures} className={cn(PIN_AT_FOOT, PINNED)}>
          <FlightFigures vm={vm} grow={false} />
        </div>
      </div>
    </div>
  );
}

/** FPL's foot, held at the sheet's visible edge, the pill's figures on it. */
const SHEET_FOOT = '[data-testid="panel-foot"]';

/** The figures held at the foot (data-pinned) drawn as the pill: in sight
 *  where the rest of the head is not (sheet/insets' RISEN_FACE at the
 *  pill), a Direct to's strip over them kept out of sight there in its
 *  room, so nothing moves; the foot's 16-point sides where the head's 12
 *  laid them 8 points wider (the owner, 2026-11-16: "is it changing size
 *  at the end? And do you see a small gap below/above the strip?"); over
 *  everything in the head (the airplane's bar's glass capsules stack above
 *  the figures' row); and on the sheet's solid colour from just under the
 *  grabber to the screen's foot, where the figures' own box let the
 *  route's white box show a line above and below them. */
const PINNED =
  "relative data-pinned:visible data-pinned:[&_[data-pill-hides]]:invisible data-pinned:z-30 data-pinned:-mx-3 data-pinned:px-4 data-pinned:bg-(--sheet) data-pinned:after:absolute data-pinned:after:inset-x-0 data-pinned:after:-top-1.5 data-pinned:after:-bottom-10 data-pinned:after:-z-10 data-pinned:after:bg-(--sheet)";
