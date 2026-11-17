import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { Button } from "../../../components/ui/button";
import { Toggle } from "@base-ui/react/toggle";
import { Slider } from "../../../components/ui/slider";
import type { AltitudeChoice, Leg, NavLogAltitude, Totals } from "../../../lib/api/types";
import { useAirplaneChosen } from "../../../lib/preferences";
import { routeProfileQuery } from "../../../lib/queryClient";
import { TEXT } from "../../../lib/text";
import { altFt, flightLevel } from "../../../lib/format";
import type { RouteEnds } from "../../plan";
import AltitudeAdvisor from "./AltitudeAdvisor";
import { clearanceWords, strikeWords } from "./clearance";
import LegAltitude, { type ChangeMode, type ProfilePoint } from "./LegAltitude";
import ProfileNotes from "./ProfileNotes";
import { pointsAlong, waypointsAlong } from "./points";
import { useAltitudePreview } from "./useAltitudePreview";
import { coursePoints } from "../../../lib/course";
import { sideViewTop } from "../profile";

/** What the side view is drawn for: the altitude previewed (null while
 *  the one flown is in sight), the cruise flown, its height in feet, and
 *  where the slider goes on it. */
type SideView = { preview: number | null; cruise: number | null; top: number | null; wheelSlot: (el: HTMLElement | null) => void };

const LEVEL_INK: Record<string, string> = { red: "text-destructive-ink", yellow: "text-caution-ink" };

/**
 * The Profile card's body, ForeFlight's way (the owner, 2026-11-10): the
 * route from the side (`chart`) with the stock Base UI Slider upright down
 * its left, stepping through the engine's altitudes. Sliding it previews
 * the clearance -- the ground red within 500 ft of the altitude (14 CFR
 * 91.119(c)), yellow within 1,000 ft (the engine's profile_clearance) -- and changes nothing
 * till Set; in flight, Auto holds the preview at the GPS's altitude. A tap
 * on a waypoint's mark sets the leg from it, Start At or Cross At
 * (LegAltitude). Under the graph, the ground against the altitude, then
 * the Altitude Advisor, where the cruise is chosen, and the card's notes.
 */
export function AltitudeProfile({
  nav: navNow,
  legs: legsNow,
  winds,
  ends,
  chart,
  corner,
  wheelHidden = false,
  problem,
  tight = null,
  onGoRound,
  onAltitudeChoiceChange,
  onFlyAltitude,
  routePoints = [],
  waypoints,
  airplaneProfile = null,
  onLegAltitude,
}: {
  nav: NavLogAltitude | null;
  legs: Leg[];
  ends: RouteEnds | null;
  /** The side view, its line at `preview` while the slider is on another
   *  altitude than the one flown. */
  chart: (view: SideView) => ReactNode;
  corner?: ReactNode;
  wheelHidden?: boolean;
  problem?: ReactNode;
  tight?: string | null;
  onGoRound?: (via: string[], stopIndex: number) => void;
  onAltitudeChoiceChange: (choice: AltitudeChoice) => void;
  onFlyAltitude: (feet: number, legal: boolean) => void;
  /** The route's points in order, and which are waypoints flown through:
   *  their marks on the profile, each a per-leg altitude. */
  routePoints?: string[];
  waypoints?: Set<string>;
  /** The airplane picked, as the engine reads it (altitude_change). */
  airplaneProfile?: object | null;
  /** Sets a waypoint's own altitude, Start At or Cross At (useRouteEdits'
   *  setPointAltitude). */
  onLegAltitude?: (ident: string, feet: number, startAt: boolean) => void;
  /** Whose winds the plan flies (the totals'), for the notes to name. */
  winds?: Totals["winds"];
}) {
  const airplane = useAirplaneChosen();
  const route = ends
    ? coursePoints(ends)
        .map((p) => p.ident)
        .join(" ")
    : "";
  const { data: profile } = useQuery({
    ...routeProfileQuery(
      ends?.departure.ident ?? "",
      ends?.destination.ident ?? "",
      (ends?.stops ?? []).map((s) => s.ident),
    ),
    enabled: !!ends,
  });
  const points = profile ? pointsAlong(legsNow, profile.length_nm) : [];
  const graph = useRef<HTMLDivElement>(null);
  const vm = useAltitudePreview({
    graph,
    nav: navNow,
    legs: legsNow,
    route,
    problem: !!problem,
    profile,
    points,
    onAltitudeChoiceChange,
    onFlyAltitude,
  });
  const { nav, legs, flown, rows, rising, shownAt, clearance } = vm;
  const [sliding, setSliding] = useState<number | null>(null);
  // The slider's place in the side view's plot (MiniProfile's), and the
  // plot's height in feet: the slider is laid on the chart's own scale, so
  // its knob sits at the altitude its tag says. It sat a step a row down
  // the graph's whole height, and FL-145 was drawn at about 9,500 on a
  // ruler topping at 12,000 (the UI audit's A1, 2026-11-17).
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const preview = shownAt !== null && shownAt !== flown ? shownAt : null;
  const top = profile ? sideViewTop(profile, [flown ?? 0, preview ?? 0]) : null;
  // The engine's row nearest the feet the slider is at: its steps are
  // every 500 ft, as the rows are, and Auto's GPS altitude is between them.
  const rowNear = (ft: number) => rising.reduce((best, row) => (Math.abs(row - ft) < Math.abs(best - ft) ? row : best), rising[0] ?? ft);
  const marks = profile && waypoints && onLegAltitude ? waypointsAlong(legs, profile.length_nm, routePoints, waypoints) : [];
  // The waypoint's own altitude, its change begun there (Start At) or done
  // by it (Cross At): the planner's `altitudes` and `altitude_starts`.
  const setLeg = (point: ProfilePoint, feet: number, mode: ChangeMode) => onLegAltitude?.(point.ident, feet, mode === "start_at");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-3">
      <div ref={graph} className="relative h-56 max-h-full min-h-16 shrink-0">
        {chart({ preview, cruise: flown, top, wheelSlot: setSlot })}
        {/* The stock Slider, upright down the plot's left on its scale in
            feet, a step each of the engine's altitudes: to VoiceOver and
            the keyboard an adjustable control saying the altitude and what
            it clears. Its drags its own, not the sheet's
            (data-base-ui-swipe-ignore). */}
        {!wheelHidden &&
          slot &&
          top !== null &&
          shownAt !== null &&
          rising.length > 1 &&
          createPortal(
            <Slider
              orientation="vertical"
              min={0}
              max={top}
              step={500}
              largeStep={2000}
              thumbAlignment="center"
              value={sliding ?? shownAt}
              onValueChange={(ft) => {
                const row = rowNear(ft as number);
                setSliding(row);
                vm.live(row);
              }}
              onValueCommitted={(ft) => {
                setSliding(null);
                vm.rest(rowNear(ft as number));
              }}
              className="h-full w-11"
              data-testid="altitude-wheel"
              data-base-ui-swipe-ignore=""
              thumb={{ "aria-label": "Cruise altitude", getAriaValueText: (_w, ft) => vm.spoken(rowNear(ft)) }}
            />,
            slot,
          )}
        {!wheelHidden && marks.map((p) => <LegAltitude key={p.ident} point={p} profile={airplaneProfile} onSet={setLeg} />)}
        {corner}
      </div>
      {shownAt !== null && (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className={cn("font-bold tabular-nums", TEXT.heading)}>{flightLevel(shownAt)}</span>
            {shownAt !== flown && (
              <span className={cn("ml-2 text-muted-foreground", TEXT.detail)}>
                Preview{flown !== null ? `, flying ${flightLevel(flown)}` : ""}
              </span>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {/* In flight: the preview back to the airplane's own altitude. */}
            {vm.flying && (
              // Base UI's Toggle: pressed and aria-pressed its own.
              <Toggle
                pressed={vm.auto}
                onPressedChange={vm.setAuto}
                render={<Button type="button" size="sm" variant={vm.auto ? "default" : "secondary"} />}
              >
                Auto
              </Toggle>
            )}
            <Button type="button" size="sm" disabled={shownAt === flown} onClick={() => vm.fly(shownAt)} data-testid="altitude-set">
              Set
            </Button>
          </div>
        </div>
      )}
      {/* The ground against the altitude in sight, as ForeFlight's strip
          under its profile: the highest along the route, the room over it,
          and where the route first meets it; live as the slider goes. */}
      {clearance && clearance.least_ft !== null && (
        <div className={cn("grid grid-cols-3 gap-2 tabular-nums", TEXT.note)} data-testid="ground-strip" data-level={clearance.level ?? ""}>
          <div>
            <div className="text-muted-foreground">Highest ground</div>
            <div className="font-semibold" data-live="highest">
              {altFt(clearance.highest_ft)} ft
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Clearance</div>
            <div className={cn("font-semibold", LEVEL_INK[clearance.level ?? ""])} data-live="clearance">
              {clearanceWords(clearance.least_ft, altFt)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">First strike</div>
            <div className="font-semibold" data-live="strike">
              {strikeWords(clearance.strike_nm)}
            </div>
          </div>
          <p className="sr-only" aria-live="polite">
            {clearance.words}
          </p>
        </div>
      )}
      {problem}
      <AltitudeAdvisor rows={rows} airplane={airplane} previewed={shownAt} onPick={(ft) => vm.fly(ft)} />
      <ProfileNotes
        nav={nav}
        legs={legs}
        winds={winds}
        profile={profile}
        shownAt={shownAt}
        tight={tight}
        onGoRound={onGoRound}
      />
    </div>
  );
}
