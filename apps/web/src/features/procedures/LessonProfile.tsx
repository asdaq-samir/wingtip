import type { CoachStep, Lesson } from "../../lib/approachLesson";
import { altFt } from "../../lib/format";
import { TEXT_POINTS } from "../../lib/text";
import { CHART } from "../../lib/tokens";

/**
 * The approach from the side, as the plate's profile view draws it, a
 * sketch from the coded data: each fix's crossing altitude, the path down
 * from the FAF at its coded angle dashed in the tint, and the airplane at
 * the step's fix. No minimums: they are the plate's.
 */
export function LessonProfile({
  profile,
  glidepathDeg,
  steps,
  at,
}: {
  profile: Lesson["profile"];
  /** The approach's coded glidepath angle, said with the path. */
  glidepathDeg: number | null | undefined;
  steps: CoachStep[];
  at: number;
}) {
  const { marks, path } = profile;
  const known = marks.filter((m) => m.ft != null);
  if (known.length < 1 || marks.length < 2) return null;
  const W = 288,
    H = 96,
    PAD = 14;
  const nms = marks.map((m) => m.alongNm);
  const lo = Math.min(...nms),
    hi = Math.max(...nms);
  const fts = [...known.map((m) => m.ft!), ...(path ? [path.to.ft] : [])];
  const top = Math.max(...fts),
    bottom = Math.min(...fts, top - 1000);
  const x = (nm: number) => PAD + ((nm - lo) / Math.max(1e-6, hi - lo)) * (W - 2 * PAD);
  const y = (ft: number) => PAD + ((top - ft) / Math.max(1, top - bottom)) * (H - 2 * PAD - TEXT_POINTS.caption);
  // The fix the step is at, and the altitude it is crossed at; past the
  // last fix (the decision, the missed approach), at the end of the path.
  const step = steps[at];
  const here =
    marks.find((m) => m.ident === step?.focus.fix && m.ft != null) ??
    (step?.key === "decision" && path ? { alongNm: path.to.nm, ft: path.to.ft } : null);
  const line = known.map((m) => `${x(m.alongNm)},${y(m.ft!)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-24 w-full rounded-xl bg-muted/60"
      role="img"
      data-testid="approach-profile"
      aria-label={`The approach from the side: ${known.map((m) => `${m.ident} ${altFt(m.ft)} ft`).join(", ")}${path ? `, then down at ${glidepathDeg?.toFixed(2)}°` : ""}`}
    >
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-procedure" />
      {path && (
        <line
          x1={x(path.from.nm)}
          y1={y(path.from.ft)}
          x2={x(path.to.nm)}
          y2={y(path.to.ft)}
          stroke="var(--tint)"
          strokeWidth={2}
          strokeDasharray="5 4"
        />
      )}
      {marks.map((m) => (
        <g key={m.ident}>
          {m.ft != null && <circle cx={x(m.alongNm)} cy={y(m.ft)} r={2.5} className="fill-procedure" />}
          <text x={x(m.alongNm)} y={H - 4} textAnchor="middle" fontSize={TEXT_POINTS.caption} className="fill-muted-foreground">
            {/^RW\d/.test(m.ident) ? "RWY" : m.ident}
          </text>
        </g>
      ))}
      {here && (
        <circle
          cx={x(here.alongNm)}
          cy={y(here.ft!)}
          r={5}
          fill="var(--tint)"
          stroke={CHART.casing}
          strokeWidth={2}
          data-testid="approach-profile-airplane"
        />
      )}
    </svg>
  );
}
