import { memo, useId, useMemo, type CSSProperties } from "react";
import { AIRSPACE, ceilingOverFloor, nameFits, namedPieces, sideViewTop } from "./profile";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import type { Candidate, Leg } from "../../lib/api/types";
import { Skeleton } from "../../components/ui/skeleton";
import { routeProfileQuery } from "../../lib/queryClient";
import { TEXT } from "../../lib/text";
import { altFt, flightLevel, grouped, wholeNm } from "../../lib/format";
import { navLogRows, type RouteEnds } from "../plan";
import { planProfile } from "./profile";
import { CHART } from "../../lib/tokens";
import { clearanceAt } from "./altitude/clearance";
const W = 340,
  H = 64;
const miles = (nm: number) => grouped(nm);
/** The ruler's heights for a chart `top` feet tall, up to three times it
 *  for the drag's zoom out: every 1,000 ft to 6,000, 2,000 to 12,000, then
 *  every 4,000 -- five or six in sight. */
const rulerMarks = (top: number) => {
  const step = top <= 6000 ? 1000 : top <= 12_000 ? 2000 : 4000;
  return Array.from({ length: Math.floor((top * 3) / step) }, (_, i) => (i + 1) * step);
};

/** The climb, the cruise and the descent as a band a few points thick,
 *  and hills under them: the side view's own shapes, cut from stock
 *  Skeletons (clip-path), so the card says what is coming. */
const CLIMB = "polygon(0 100%, 18% 14%, 82% 14%, 100% 100%, 96.5% 100%, 80.5% 19%, 19.5% 19%, 3.5% 100%)";
const HILLS = "polygon(0 72%, 10% 52%, 22% 64%, 36% 34%, 50% 58%, 63% 42%, 77% 66%, 90% 46%, 100% 60%, 100% 100%, 0 100%)";

/**
 * The side view while its ground is fetched, the card's height as the
 * chart will be: shadcn's Skeleton in the ground's and the climb's shapes,
 * and the miles' row under them, where it was an empty white box with the
 * Dry run over it (the design review, 2026-10-28, the owner's "I want
 * all"). Said once to a screen reader; the shapes are not.
 */
function ProfileSkeleton({ look }: { look: string }) {
  return (
    <div role="status" data-testid="mini-profile-skeleton" className={look}>
      <span className="sr-only">Fetching the side view…</span>
      <span aria-hidden="true" className="relative block min-h-0">
        <Skeleton className="absolute inset-x-0 bottom-0 h-3/5 rounded-none" style={{ clipPath: HILLS }} />
        <Skeleton className="absolute inset-0 rounded-none" style={{ clipPath: CLIMB }} />
      </span>
      <span aria-hidden="true" className="flex justify-between pt-1">
        <Skeleton className="h-2.5 w-4" />
        <Skeleton className="h-2.5 w-6" />
        <Skeleton className="h-2.5 w-10" />
      </span>
    </div>
  );
}

/**
 * FPL's pill's side view of the flight, at the owner's pick of the
 * redesign ("FPL 3, profile", the profile above the figures): the ground,
 * the Class B, C and D crossed and the plan's altitudes over them, as the
 * printed nav log's Profile draws them full (ProfileChart) -- here plain SVG, so
 * the page's first load keeps recharts out, its axes' figures words beside
 * and under it (an SVG stretched to the width would stretch them), at the
 * owner's ask ("profile can show the axis and numbers etc. since we have
 * some empty space"). The same question as
 * the full one (its query key), asked once there is a route. A tap opens
 * the nav log full on it (`onOpen`); with nothing to open, all the way up,
 * it is a picture, not a button.
 */
export default memo(function MiniProfile({
  ends,
  selected,
  legs,
  preview = null,
  cruise: cruiseFt = null,
  top: topFt = null,
  wheelSlot,
  ruler = false,
}: {
  ends: RouteEnds;
  selected: Candidate[];
  legs: Leg[];
  /** An altitude on the Profile card's wheel not yet flown (AltitudeProfile):
   *  a dashed line across at it, named, until the plan comes to it. */
  preview?: number | null;
  /** A ruler of heights down its left side, the altitude on it boxed, where
   *  the graph is dragged (the Profile card), at the owner's ask ("can't see
   *  the ruler"); none in FPL's own, at the owner's earlier ask ("y axis is
   *  not needed"). */
  ruler?: boolean;
  /** The cruise the plan flies (the Profile card's): with no airplane
   *  picked the legs have no top of climb, the line runs field to field,
   *  and its highest point is the destination's elevation, not the cruise
   *  -- the tag read "FL-022" on a plan at FL-145 and the ground went red
   *  against it (the UI audit's A1, 2026-11-17). */
  cruise?: number | null;
  /** Its height in feet, the Profile card's slider's scale (sideViewTop). */
  top?: number | null;
  /** Where the Profile card puts its slider: down the plot's left, its
   *  height the plot's, so a step is the feet the ruler says. */
  wheelSlot?: (el: HTMLElement | null) => void;
}) {
  // An id a url(#…) takes as it is: React's has colons in it.
  const tintId = `tint${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const dep = ends.departure.ident,
    dest = ends.destination.ident;
  const stops = (ends.stops ?? []).map((s) => s.ident);
  const { data: profile } = useQuery(routeProfileQuery(dep, dest, stops));
  const plan = useMemo(() => planProfile(navLogRows(ends, selected, legs)), [ends, selected, legs]);
  const drawnTop = Math.max(0, ...plan.points.map((p) => p.plan_ft));
  const cruise = cruiseFt ?? drawnTop;
  // A line that never reaches the cruise has no climb worked out (no
  // airplane): the cruise drawn level and dashed instead, as a preview is,
  // not a ramp from field to field under the ground.
  const level = drawnTop + 50 < cruise ? cruise : null;
  // The miles flown by patterns and procedures past the chart's line,
  // which the strip's distance (the totals' `procedure_nm`) and the nav
  // log's rows count and the ground under the line cannot: put into the
  // axis's end, so it reads the strip's own figure (the FPL audit's A5,
  // 2026-11-08) in the strip's own words, "1,334 nm", where it read
  // "1317 nm + 17.2 pattern" (the owner's list, 2026-11-17: one distance
  // format everywhere). The patterns are flown at the ends, so the line's
  // end is still the landing.
  const procedureNm = legs.reduce((nm, l) => nm + (l.procedure?.more_nm ?? 0), 0);
  const look = cn(
    "grid h-24 w-full shrink-0 grid-rows-[1fr_auto] overflow-hidden rounded-xl bg-background/70 px-2 pt-1.5 pb-1",
    "text-muted-foreground tabular-nums",
    TEXT.caption,
  );
  if (!profile) return <ProfileSkeleton look={look} />;
  const scale = plan.length_nm > 0 ? profile.length_nm / plan.length_nm : 1;
  // Over the ground, the airspace's ceilings (the owner's "Profile view
  // should show the airspace ceilings above the altitude trace") and the
  // altitudes flown and previewed: the Profile card's own scale where it
  // gives one, which its slider is laid on.
  const top = topFt ?? sideViewTop(profile, [Math.max(cruise, drawnTop), preview ?? 0]);
  // The ground tinted against the altitude shown, as ForeFlight's profile
  // does: red under 500 ft of it or above (14 CFR 91.119(c)), yellow within
  // 1,000 ft (91.119(b)), else the ground's own -- the engine's
  // (profile_clearance). Offsets in the chart's own
  // height, moved by the Profile card's slider as it goes (data-tint), not
  // drawn again.
  const tintAt = preview ?? cruise;
  const tint = tintAt ? clearanceAt(profile, tintAt) : null;
  const tintOffset = (ft: number | undefined) => (ft === undefined ? 0 : Math.max(0, Math.min(1, 1 - ft / top)));
  const x = (nm: number) => (profile.length_nm > 0 ? (nm / profile.length_nm) * W : 0);
  const y = (ft: number) => H - (Math.max(0, Math.min(ft, top)) / top) * H;
  const ground = `M0 ${H} ${profile.terrain.map((t) => `L${x(t.along_nm).toFixed(1)} ${y(t.ground_ft).toFixed(1)}`).join(" ")} L${W} ${H}Z`;
  // Each airspace's label once, over its widest piece: its airport's
  // ident, else its class.
  const named = [...namedPieces(profile.airspace)]
    .map(([label, a]) => ({ ...a, label, key: `${label}${a.from_nm}` }))
    // Wide enough on the chart for its words.
    .filter((a) => nameFits(a, profile.length_nm));
  const line = plan.points.map((p, i) => `${i ? "L" : "M"}${x(p.along_nm * scale).toFixed(1)} ${y(p.plan_ft).toFixed(1)}`).join(" ");
  const label = `Profile: ${cruise ? `cruise ${altFt(cruise)} ft` : "the route from the side"}`;
  const chart = (
    <>
      <span
        className={cn("relative block min-h-0", ruler && "overflow-hidden")}
        data-plot=""
        // The chart's top, read by the rolling tick and the ruler's marks
        // below and by the altitude preview (useAltitudePreview).
        style={{ "--base-top": top } as CSSProperties}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id={tintId} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={H}>
              {/* The theme's red, not the chart's: the chart's #d70015 at
                  55% on the night's navy card was a murky maroon the ground
                  read through (the UI audit's B11); the theme's is a step
                  lighter at night (tokens.json theme.dark.destructive). */}
              <stop offset={tintOffset(tint?.red_from_ft)} style={{ stopColor: "var(--destructive)" }} data-tint="red" />
              <stop offset={tintOffset(tint?.red_from_ft)} stopColor={CHART.caution} data-tint="red-end" />
              <stop offset={tintOffset(tint?.yellow_from_ft)} stopColor={CHART.caution} data-tint="amber" />
              <stop offset={tintOffset(tint?.yellow_from_ft)} stopColor={CHART.terrain} data-tint="amber-end" />
            </linearGradient>
          </defs>
          <g>
            {profile.airspace.map((a, i) => {
              const look = AIRSPACE[a.class];
              if (!look) return null;
              const top_ = y(Math.min(a.ceiling_ft ?? top, top)),
                bottom = y(a.floor_ft);
              return (
                <rect
                  key={i}
                  x={x(a.from_nm)}
                  width={Math.max(1, x(a.to_nm) - x(a.from_nm))}
                  y={top_}
                  height={Math.max(1, bottom - top_)}
                  fill={look.stroke}
                  fillOpacity={0.08}
                  stroke={look.stroke}
                  strokeOpacity={0.7}
                  strokeDasharray={look.dashed ? "4 3" : undefined}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            <path d={ground} fill={`url(#${tintId})`} fillOpacity={0.55} />
            <path
              d={level === null ? line : ""}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={2.5}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {(preview ?? level) !== null && (
              <line
                x1={0}
                x2={W}
                y1={y(preview ?? level!)}
                y2={y(preview ?? level!)}
                stroke="var(--primary)"
                strokeWidth={2}
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        </svg>
        {/* The Profile ruler's tick as it rolls, a dashed line moved by the
          ruler itself (AltitudeProfile's --roll-ft and --roll-on, its words
          its data-label), not the chart drawn again at each tick, at the
          owner's ask ("do we need to redraw the whole thing or just move it
          up or down?"). Held at the chart's top above it, till the ruler
          rests and the chart is drawn for it. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-primary opacity-[var(--roll-on,0)]"
          style={{ top: "calc((1 - min(var(--roll-ft, 0), var(--base-top)) / var(--base-top)) * 100%)" }}
        >
          <span
            data-roll-label=""
            className={cn(
              "absolute rounded bg-background px-1 font-semibold text-foreground after:content-[attr(data-label)]",
              ruler ? "left-11 -translate-y-1/2 ring-[1.5px] ring-primary" : "top-[3px] left-1/2 -translate-x-1/2 bg-background/80",
            )}
          />
        </span>
        {/* The ruler: its heights where the chart's scale puts them, those
          over the top cut off by the plot; a step to keep them four or more
          apart. */}
        {ruler &&
          rulerMarks(top).map((ft) => (
            <span
              key={ft}
              aria-hidden="true"
              className="pointer-events-none absolute left-11 -translate-y-1/2 pl-0.5 text-muted-foreground opacity-[calc(1-var(--roll-on,0)*0.4)]"
              style={{ top: `calc((1 - ${ft} / var(--base-top)) * 100%)` }}
            >
              {altFt(ft)}
            </span>
          ))}
        {/* Each airspace named for its airport, at the owner's ask ("can the
          profile view airspaces have airport ids on them"): over its
          widest piece, in its own colour, under its top edge -- words,
          not drawn in the stretched SVG. */}
        {named.map((a) => (
          <span
            key={a.key}
            // Out of sight while the drag's own line is (--roll-on): set at
            // the chart's own scale, which the drag's zoom moves.
            className="pointer-events-none absolute -translate-x-1/2 rounded bg-background/80 px-1 font-semibold opacity-[calc(1-var(--roll-on,0))]"
            style={{
              left: `${(x((a.from_nm + a.to_nm) / 2) / W) * 100}%`,
              top: `calc(${(y(Math.min(a.ceiling_ft ?? top, top)) / H) * 100}% + 2px)`,
              color: AIRSPACE[a.class]!.text,
            }}
            aria-hidden="true"
            data-testid="mini-profile-airspace"
          >
            {a.label} {ceilingOverFloor(a)}
          </span>
        ))}
        {/* No axis of heights: the cruise altitude named on its line, in the
          middle, is enough, at the owner's asks ("label the cruise altitude
          within the graph"; "y axis is not needed, just the cruise label is
          enough"); words, not drawn in the stretched SVG. */}
        {(preview ?? cruise) > 0 && (
          <span
            // Under the line, over the ground: with the chart's top just
            // over the cruise there is no room above it.
            // Out of sight while the ruler's own line is (--roll-on).
            className={cn(
              "pointer-events-none absolute rounded px-1 font-semibold text-foreground opacity-[calc(1-var(--roll-on,0))]",
              // Boxed on the ruler where there is one, as the drag's is,
              // beside the slider's knob, not under its track.
              ruler ? "left-11 -translate-y-1/2 bg-background ring-[1.5px] ring-primary" : "left-1/2 -translate-x-1/2 bg-background/80",
            )}
            style={{ top: ruler ? `${(y(preview ?? cruise) / H) * 100}%` : `calc(${(y(preview ?? cruise) / H) * 100}% + 3px)` }}
            aria-hidden="true"
            data-testid="mini-profile-cruise"
          >
            {/* The owner's FL-055, as the altitude field and the wheel write it
              (lib/format flightLevel; the FPL audit's A7); a reader hears the
              feet in the chart's own label. */}
            {flightLevel(preview ?? cruise)}
          </span>
        )}
        {wheelSlot && <span ref={wheelSlot} className="absolute inset-y-0 left-0 w-11" />}
      </span>
      {/* The distance along, in nautical miles, under the chart's start,
          middle and end. */}
      <span className="flex justify-between" aria-hidden="true">
        <span>0</span>
        <span>{miles(profile.length_nm / 2)}</span>
        <span>{wholeNm(profile.length_nm + procedureNm)}</span>
      </span>
    </>
  );
  // A picture, named; but a group where the Profile card's altitude slider
  // is laid on it (`wheelSlot`): an image holds no control, and the slider
  // in one was axe's nested-interactive (WCAG 4.1.2; the iOS audit's
  // "altitude on the profile").
  return (
    <div role={wheelSlot ? "group" : "img"} data-testid="mini-profile" aria-label={label} className={look}>
      {chart}
    </div>
  );
});
