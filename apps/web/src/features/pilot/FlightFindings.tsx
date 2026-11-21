import { Check, X } from "lucide-react";
import { cn } from "cn";
import { ListGroup, ListRow } from "../../components/GroupedList";
import type { Debrief } from "./debrief";
import { TEXT } from "../../lib/text";
import { AltitudeLegend } from "../../components/AltitudeLegend";
import { altFt, bearing, dayMonthTime, feet, grouped, hm, nm, wholeNm } from "../../lib/format";
import { FINDING_TONE } from "../../lib/findings";

/** A difference as said, its sign after rounding: "+3 min", "±0 min". */
function signed(n: number, unit = ""): string {
  const whole = Math.round(n);
  return `${whole > 0 ? "+" : whole < 0 ? "−" : "±"}${grouped(Math.abs(whole))}${unit}`;
}

/** A tolerance met or not, as the drills mark one. */
function Mark({ ok }: { ok: boolean }) {
  return ok ? (
    <Check className={cn("size-4", FINDING_TONE.ok)} aria-label="Within" />
  ) : (
    <X className={cn("size-4", FINDING_TONE.stop)} aria-label="Outside" />
  );
}

/**
 * The flown altitude along the course over the plan's, a step a leg:
 * drawn, not read -- the figures are in the rows under it.
 */
function Profile({ d }: { d: Debrief }) {
  const end = Math.max(...d.planned.map((p) => p.toNm), ...d.profile.map((p) => p.alongNm));
  const alts = [...d.profile.map((p) => p.altFt), ...d.planned.flatMap((p) => (p.altFt == null ? [] : [p.altFt]))];
  if (end <= 0 || alts.length === 0) return null;
  const low = Math.floor(Math.min(...alts) / 500) * 500,
    high = Math.ceil(Math.max(...alts) / 500) * 500 || low + 500;
  const x = (nm: number) => (nm / end) * 300;
  const y = (ft: number) => 100 - ((ft - low) / (high - low)) * 100;
  const flown = d.profile.map((p, i) => `${i ? "L" : "M"}${x(p.alongNm).toFixed(1)} ${y(p.altFt).toFixed(1)}`).join(" ");
  return (
    <figure className="space-y-1 px-3 py-3" data-testid="debrief-profile">
      <AltitudeLegend
        high={high}
        keys={[
          { colour: "bg-tint", label: "Planned" },
          { colour: "bg-foreground", label: "Flown" },
        ]}
      />
      <svg
        viewBox="0 0 300 100"
        preserveAspectRatio="none"
        className="h-28 w-full"
        role="img"
        aria-label="Flown altitude along the course, over the planned"
      >
        {d.planned.map(
          (p, i) =>
            p.altFt != null && (
              <line
                key={i}
                x1={x(p.fromNm)}
                x2={x(p.toNm)}
                y1={y(p.altFt)}
                y2={y(p.altFt)}
                className="stroke-tint"
                strokeWidth={2}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
            ),
        )}
        <path d={flown} fill="none" className="stroke-foreground" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className={cn("flex justify-between text-muted-foreground tabular-nums", TEXT.note)}>
        <span>{feet(low)} · 0 nm</span>
        <span>{wholeNm(end)}</span>
      </div>
    </figure>
  );
}

/** The debrief's findings: the flight in a line, then leg by leg, the
 *  checkpoints and the patterns, each against its ACS tolerance. */
export function Findings({ d }: { d: Debrief }) {
  const t = d.tolerances;
  return (
    <div className="space-y-4">
      {d.notes.length > 0 && (
        <ul className={cn("list-disc space-y-0.5 pl-5 text-caution-ink", TEXT.prose)}>
          {d.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      <ListGroup title="The Flight">
        <ListRow title="Took Off" value={dayMonthTime(new Date(d.takeoff))} />
        <ListRow title="In the Air" description={d.plannedMin != null ? `${hm(d.plannedMin)} planned` : undefined} value={hm(d.flownMin)} />
        {d.hasAltitude && <Profile d={d} />}
      </ListGroup>

      {/* PA.VI.A's tolerances in the title, where they were a footnote:
          within its distance of the route, and its altitude and course in
          the cruise, the climb and the descent left out. GPS altitude is not
          the altimeter's, and a ground track is not a heading. */}
      <ListGroup title={`Leg by leg · within ${t.offRouteNm} nm, ${t.altitudeFt} ft, ${t.courseDeg}°`}>
        {d.legs.map((leg, i) => {
          return (
            <ListRow
              key={i}
              media={<Mark ok={leg.ok} />}
              title={`${leg.from} → ${leg.to}`}
              description={
                <>
                  <span className="block">
                    {leg.altitudeWithin == null
                      ? d.hasAltitude
                        ? "Altitude: no cruise on this leg"
                        : "Altitude: the file has none"
                      : `Altitude: ${Math.round(leg.altitudeWithin * 100)}% within ${t.altitudeFt} ft of ${feet(leg.plannedAltFt)}${leg.worstAltFt != null ? `, at most ${signed(leg.worstAltFt, " ft")}` : ""}`}
                  </span>
                  {leg.courseWithin != null && leg.courseDeg != null && (
                    <span className="block">
                      Course: {Math.round(leg.courseWithin * 100)}% within {t.courseDeg}° of {bearing(leg.courseDeg)}
                      {leg.worstOffNm != null &&
                        `, at most ${nm(Math.abs(leg.worstOffNm))} ${leg.worstOffNm >= 0 ? "right" : "left"} of the line`}
                    </span>
                  )}
                </>
              }
              data-testid="debrief-leg"
            />
          );
        })}
      </ListGroup>

      {/* PA.VI.A: each within its minutes of its estimate, from the takeoff. */}
      <ListGroup title={`Checkpoints · within ${t.etaMin} min`}>
        {d.passes.map((p, i) => {
          const { landed, lateMin: late } = p;
          return (
            <ListRow
              key={i}
              media={p.ok != null ? <Mark ok={p.ok} /> : undefined}
              title={p.name}
              description={[
                p.dueMin != null && `Due ${hm(p.dueMin)}`,
                p.passedMin != null
                  ? `${landed ? "landed" : "passed"} ${hm(p.passedMin)}${late != null ? ` (${signed(late, " min")})` : ""}`
                  : "not reached",
                !landed && p.closestNm != null && `${nm(p.closestNm)} from it at closest`,
              ]
                .filter(Boolean)
                .join(" · ")}
              data-testid="debrief-checkpoint"
            />
          );
        })}
      </ListGroup>

      {d.patterns.length > 0 && (
        // PA.III.B: pattern altitude within its feet, read its distance from
        // the field, about where the downwind starts (the engine's tolerances).
        <ListGroup title={`Into the pattern · within ${t.patternFt} ft`}>
          {d.patterns.map((p) => (
            <ListRow
              key={p.ident}
              media={<Mark ok={p.ok} />}
              title={p.ident}
              description={`Pattern altitude ${feet(p.patternFt)}`}
              value={`${altFt(p.altFt)} ft (${signed(p.offFt)})`}
              data-testid="debrief-pattern"
            />
          ))}
        </ListGroup>
      )}
    </div>
  );
}
