import { Suspense, type ReactNode } from "react";
import { ICON } from "../../../../lib/icons";
import { cn } from "cn";
import RoundButton from "../../../../components/RoundButton";
import { TEXT } from "../../../../lib/text";
import { useClaudeOn } from "../../../../lib/subscription";
import { LocalDuration } from "../../routePanelParts";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";
import { LOCAL_MINUTES } from "../../hooks/planAddress";

/** The route's chips: the airplane, the altitude and the time
 *  (`flightInputs`), a local flight's time aloft, and the route's buttons --
 *  the Profile, the AI brief and Share (`share`). */

/** On a desktop's side panel the route box's small buttons carry their
 *  word beside the glyph, where there is the room (docs/design/icons.md,
 *  "Small buttons have words"; the UI audit, 2026-11-09); on a phone the
 *  glyph alone, its word its name to VoiceOver, the row as decision 0029
 *  keeps it. */
const WORDED = "lg:pointer-fine:w-auto lg:pointer-fine:gap-1 lg:pointer-fine:px-2";
const WORD = cn("hidden font-medium lg:pointer-fine:inline", TEXT.detail);

export default function RouteControls({ vm, flightInputs, share }: { vm: PlanWorkspaceModel; flightInputs: ReactNode; share: ReactNode }) {
  const { altitudeMark, briefMark, changeLocalMin, localMin, openBrief, openProfile, profileReady, routed, s } = vm;
  // "AI brief" only where Claude writes some of it (lib/subscription): off,
  // the Brief is the engine's alone and is called just that.
  const brief = useClaudeOn() ? "AI brief" : "Brief";
  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-x-1 gap-y-4">
      {/* On the narrowest panels (iPhone SE, the iPad slide-over) the row
          wraps, the buttons on a line of their own under the airplane and
          the altitude: sixteen between the lines (gap-y-4), as the Profile
          button's 44-point area reaches 11 under its 22 and the first
          button's 6 over its 32, and the button sits 3 up in its group
          (the iOS audit's P1, 24 Oct: twelve left them 2 points over each
          other). */}
      {/* The chips' room while their code comes (routePanel). */}
      <Suspense fallback={<span className="h-9 w-48" aria-hidden="true" />}>{flightInputs}</Suspense>
      {s.local && (
        <Suspense fallback={<span className="h-8 w-20 shrink-0" aria-hidden="true" />}>
          <LocalDuration minutes={localMin} options={LOCAL_MINUTES} onChange={changeLocalMin} />
        </Suspense>
      )}
      {/* At the row's end, as Maps puts a card's actions, the two the
          pilot kept there: the route's Approaches -- each field's
          traffic pattern and instrument procedures to draw, and the
          destination's approach charts (PlaceCard) -- and Share, which
          holds the rest. Round buttons at a fixed 36 with a 20-point
          glyph, as iOS's bar buttons stay their size at any text size,
          eight apart, so their 44-point hit areas (index.css) meet. */}
      {/* Inside the route's box, a size down from the panel's 36: 32, at
          the owner's ask ("make these buttons a bit smaller inside route
          box"), twelve apart so their 44-point areas meet (index.css). */}
      {/* Eight more before them than the row's four: the Profile button's
          44 points, at the altitude's end, and the Brief's meet, not overlap
          (the iOS audit's P1, 93c88a64); the airplane and the altitude two
          narrower in their padding for it, so the row keeps its one line. */}
      {/* Round buttons of their own again, the capsule round them taken
          off at the owner's ask ("let's go back to round buttons, I don't
          like the capsule", 2026-10-24), twelve apart so their 44-point
          areas meet (index.css): Routes, the Brief, the route's menu. The
          fourteen before them (pl-3.5) keep the Profile button's 44 points
          and the first one's from overlapping where the row is one line
          with no slack: the distance between the two is then the row's
          4-point gap and this padding alone, and 22 and 32 wide they need
          17. Where the row wraps, the lines' gap keeps them apart (above).
          Back on this line at the owner's ask (2026-10-25), the sheet edge
          to edge for the room (MapPanel's HALF_INSET). */}
      {/* In points, not rem: iOS's bar buttons keep their size at any text
          size, and at the owner's 19.65 px these grew to 39 with 15 between,
          29 more than at 16, and wrapped onto a line of their own (the FPL
          audit's A3). */}
      <div className="ml-auto flex shrink-0 items-center gap-3 pl-3.5" data-testid="route-actions">
        {/* The Profile -- the route from the side, its altitude's wheel and
            its dry run -- where the nav log's button was, the nav log in
            the route's ••• menu, at the owner's ask (2026-11-04: "Replace
            the navlog button with profile button ... Navlog can be moved
            to the more button"). */}
        {profileReady && (
          <RoundButton
            label={
              altitudeMark === "caution"
                ? "Profile, your altitude has a caution"
                : altitudeMark === "tight"
                  ? "Profile, your altitude is tight"
                  : "Profile"
            }
            onClick={openProfile}
            className={cn("size-[32px]", WORDED)}
            data-testid="route-profile"
          >
            <span className="relative">
              <ICON.profile className="size-[18px]" strokeWidth={2} />
              {altitudeMark && (
                <span
                  aria-hidden="true"
                  data-testid={altitudeMark === "caution" ? "own-altitude-flag" : "tight-altitude-flag"}
                  className="absolute -top-0.5 -right-1 size-2 rounded-full bg-caution"
                />
              )}
            </span>
            <span className={WORD}>Profile</span>
          </RoundButton>
        )}
        {/* The AI's brief, a card over FPL (BriefCard) -- its verdict, its
            words with their sources and Ask at its foot -- marked as the
            worst of its pages is: one sparkle where the Brief's clipboard
            and the menu's "Ask about this flight" were, at the owner's ask
            ("Replace ... the brief button with AI button because they are
            both the same thing", 2026-11-04). */}
        {routed && (
          <RoundButton
            label={briefMark ? `${brief}, ${briefMark === "stop" ? "warning" : "caution"}` : brief}
            onClick={openBrief}
            className={cn("size-[32px]", WORDED)}
            data-testid="route-brief"
            data-finding={briefMark ?? undefined}
          >
            <span className="relative">
              <ICON.brief className="size-[18px]" strokeWidth={2} />
              {briefMark && (
                <span
                  aria-hidden="true"
                  data-testid="route-brief-mark"
                  className={cn("absolute -top-0.5 -right-1 size-2 rounded-full", briefMark === "stop" ? "bg-destructive" : "bg-caution")}
                />
              )}
            </span>
            <span className={WORD}>Brief</span>
          </RoundButton>
        )}
        {/* Not before there is a route, at the owner's ask ("the share
            button should not appear before a route is entered"): the box
            clears itself (its own clear). */}
        {routed && share}
      </div>
    </div>
  );
}
