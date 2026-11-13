import { useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { Button } from "../../../../../components/ui/button";
import { Toggle } from "@base-ui/react/toggle";
import { Slider } from "../../../../../components/ui/slider";
import Segmented from "../../../../../components/Segmented";
import type { AltitudeChoice, Detour, Leg, NavLogAltitude, Totals } from "../../../../../lib/api/types";
import { useAirplaneChosen, type FlightRules } from "../../../../../lib/preferences";
import { routeProfileQuery } from "../../../../../lib/queryClient";
import { TEXT } from "../../../../../lib/text";
import { altFt, flightLevel } from "../../../../../lib/format";
import type { RouteEnds } from "../rows";
import AltitudeAdvisor from "./AltitudeAdvisor";
import { clearanceWords, strikeWords } from "./clearance";
import LegAltitude, { type ChangeMode, type ProfilePoint } from "./LegAltitude";
import ProfileNotes from "./ProfileNotes";
import { pointsAlong, waypointsAlong } from "./points";
import { useAltitudePreview } from "./useAltitudePreview";

const RULES = [
  { value: "vfr", label: "VFR" },
  { value: "ifr", label: "IFR" },
];
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
  classBAvoided = false,
  onAvoidClassB,
  onAllowClassB,
  onGoRound,
  onAltitudeChoiceChange,
  onFlyAltitude,
  rules = "vfr",
  onRulesChange,
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
  chart: (preview: number | null) => ReactNode;
  corner?: ReactNode;
  wheelHidden?: boolean;
  problem?: ReactNode;
  tight?: string | null;
  classBAvoided?: boolean;
  onAvoidClassB?: (detour: Detour | null) => void;
  onAllowClassB?: () => void;
  onGoRound?: (via: string[], stopIndex: number) => void;
  onAltitudeChoiceChange: (choice: AltitudeChoice) => void;
  onFlyAltitude: (feet: number, legal: boolean) => void;
  rules?: FlightRules;
  onRulesChange?: (rules: FlightRules) => void;
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
  const route = ends ? [ends.departure.ident, ...(ends.stops ?? []).map((s) => s.ident), ends.destination.ident].join(" ") : "";
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
  const stepOf = (altitude: number | null) => {
    if (altitude === null || !rising.length) return 0;
    // The nearest row: Auto's GPS altitude is between them.
    let best = 0;
    rising.forEach((ft, i) => {
      if (Math.abs(ft - altitude) < Math.abs(rising[best]! - altitude)) best = i;
    });
    return best;
  };
  const marks = profile && waypoints && onLegAltitude ? waypointsAlong(legs, profile.length_nm, routePoints, waypoints) : [];
  // The waypoint's own altitude, its change begun there (Start At) or done
  // by it (Cross At): the planner's `altitudes` and `altitude_starts`.
  const setLeg = (point: ProfilePoint, feet: number, mode: ChangeMode) => onLegAltitude?.(point.ident, feet, mode === "start_at");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-3" data-testid="altitude-profile">
      <div ref={graph} className="relative h-56 max-h-full min-h-16 shrink-0">
        {chart(shownAt !== null && shownAt !== flown ? shownAt : null)}
        {/* The stock Slider, upright down the graph's left, a step each of
            the engine's altitudes: to VoiceOver and the keyboard an
            adjustable control saying the altitude and what it clears. Its
            drags its own, not the sheet's (data-base-ui-swipe-ignore). */}
        {!wheelHidden && shownAt !== null && rising.length > 1 && (
          <Slider
            orientation="vertical"
            min={0}
            max={rising.length - 1}
            step={1}
            largeStep={4}
            value={sliding ?? stepOf(shownAt)}
            onValueChange={(step) => {
              setSliding(step as number);
              const ft = rising[step as number];
              if (ft !== undefined) vm.live(ft);
            }}
            onValueCommitted={(step) => {
              setSliding(null);
              const ft = rising[step as number];
              if (ft !== undefined) vm.rest(ft);
            }}
            className="absolute top-2 bottom-6 left-1 w-11"
            data-testid="altitude-wheel"
            data-base-ui-swipe-ignore=""
            thumb={{ "aria-label": "Cruise altitude", getAriaValueText: (_w, step) => vm.spoken(rising[step] ?? shownAt) }}
          />
        )}
        {!wheelHidden && marks.map((p) => <LegAltitude key={p.ident} point={p} profile={airplaneProfile} onSet={setLeg} />)}
        {corner}
      </div>
      {shownAt !== null && (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className={cn("font-bold tabular-nums", TEXT.heading)} data-testid="altitude-picked">
              {flightLevel(shownAt)}
            </span>
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
                render={<Button type="button" size="sm" variant={vm.auto ? "default" : "secondary"} data-testid="altitude-auto" />}
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
      {onRulesChange && (
        <div className="flex items-center justify-between gap-3">
          <span className={cn("font-semibold", TEXT.row)}>Flight rules</span>
          <Segmented
            label="Flight rules"
            value={rules}
            onChange={(v) => onRulesChange(v as FlightRules)}
            options={RULES}
            testId="flight-rules"
          />
        </div>
      )}
      <ProfileNotes
        nav={nav}
        legs={legs}
        winds={winds}
        profile={profile}
        shownAt={shownAt}
        tight={tight}
        classBAvoided={classBAvoided}
        onAvoidClassB={onAvoidClassB}
        onAllowClassB={onAllowClassB}
        onGoRound={onGoRound}
      />
    </div>
  );
}
