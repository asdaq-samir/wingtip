import { useMemo } from "react";
import { cn } from "cn";
import type { ApproachDebrief as Debriefed } from "./approachDebriefModel";
import { feet, wholeNm } from "../lib/format";
import { rad } from "../lib/geo";
import { TEXT } from "../lib/text";
import { AltitudeLegend } from "./AltitudeLegend";

/** Latitude and longitude onto a box, north up, the scale the same both
 *  ways (a plate's plan view): the procedure's way in and the track. */
function useFrame(d: Debriefed, width: number, height: number, pad: number) {
  return useMemo(() => {
    const all = [...d.plan.inbound.map(([lat, lon]) => ({ lat, lon })), ...d.plan.track];
    const lat0 = all.reduce((s, p) => s + p.lat, 0) / all.length;
    const kx = Math.cos(rad(lat0));
    const xs = all.map((p) => p.lon * kx),
      ys = all.map((p) => p.lat);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const scale = Math.min((width - 2 * pad) / Math.max(1e-6, x1 - x0), (height - 2 * pad) / Math.max(1e-6, y1 - y0));
    const ox = (width - (x1 - x0) * scale) / 2,
      oy = (height - (y1 - y0) * scale) / 2;
    return (lat: number, lon: number) => [ox + (lon * kx - x0) * scale, height - (oy + (lat - y0) * scale)] as const;
  }, [d, width, height, pad]);
}

const W = 320,
  H = 220;

/** The plan view, as a plate's: the procedure in the approaches' colour
 *  (the map's, ProceduresGl), its missed approach dashed, each fix a
 *  diamond and its name; the track over it in the flown track's ink, red
 *  where it was past full scale or under a minimum. Drawn, not read: the
 *  figures are in the findings under it. */
export function PlanView({ d }: { d: Debriefed }) {
  const at = useFrame(d, W, H, 24);
  const line = (pts: readonly (readonly [number, number])[]) =>
    pts
      .map(
        ([lat, lon], i) =>
          `${i ? "L" : "M"}${at(lat, lon)
            .map((n) => n.toFixed(1))
            .join(" ")}`,
      )
      .join(" ");
  const runs = trackRuns(d.plan.track);
  return (
    <figure className="px-3 py-3" data-testid="approach-plan">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full overflow-hidden rounded-md bg-background"
        role="img"
        aria-label={`${d.name} as flown, over the procedure`}
      >
        {d.plan.missed.map((m, i) => (
          <path key={i} d={line(m)} fill="none" className="stroke-procedure" strokeWidth={1.5} strokeDasharray="5 4" />
        ))}
        <path d={line(d.plan.inbound)} fill="none" className="stroke-procedure" strokeWidth={2.5} strokeLinejoin="round" />
        {runs.map((r, i) => (
          <path
            key={i}
            d={line(r.points)}
            fill="none"
            className={r.off ? "stroke-destructive" : "stroke-foreground"}
            strokeWidth={r.off ? 2.5 : 1.75}
            strokeLinejoin="round"
          />
        ))}
        {d.plan.fixes.map((f) => {
          const [x, y] = at(f.lat, f.lon);
          if (x < -10 || x > W + 10 || y < -10 || y > H + 10) return null;
          return (
            <g key={f.ident} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
              <path
                d="M0 -4.5 L4.5 0 L0 4.5 L-4.5 0 Z"
                className={f.roles.includes("MAP") || f.roles.includes("FAF") ? "fill-procedure" : "fill-background stroke-procedure"}
                strokeWidth={1.5}
              />
              <text x={7} y={4} className="fill-foreground" fontSize={11} fontWeight={600}>
                {f.ident}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className={cn("flex gap-3 pt-1 text-muted-foreground", TEXT.note)}>
        <span>
          <span className="mr-1 inline-block h-0.5 w-4 bg-procedure align-middle" />
          Procedure
        </span>
        <span>
          <span className="mr-1 inline-block h-0.5 w-4 bg-foreground align-middle" />
          Flown
        </span>
        <span>
          <span className="mr-1 inline-block h-0.5 w-4 bg-destructive align-middle" />
          Outside
        </span>
      </figcaption>
    </figure>
  );
}

function trackRuns(track: { lat: number; lon: number; off: boolean }[]) {
  const out: { off: boolean; points: [number, number][] }[] = [];
  track.forEach((p, i) => {
    const last = out[out.length - 1];
    if (last && last.off === p.off) last.points.push([p.lat, p.lon]);
    else
      out.push({
        off: p.off,
        points:
          i > 0
            ? [
                [track[i - 1]!.lat, track[i - 1]!.lon],
                [p.lat, p.lon],
              ]
            : [[p.lat, p.lon]],
      });
  });
  return out;
}

/** The profile, as a plate's: each fix's minimum altitude a step until the
 *  next, the glidepath dashed to the runway, the track's altitude over
 *  them by its distance to the missed approach point. */
export function ProfileView({ d }: { d: Debriefed }) {
  const { track, fixes, glidepath } = d.profile;
  if (track.length < 2) return null;
  const far = Math.max(...track.map((p) => p.toGoNm), ...fixes.filter((f) => f.toGoNm <= track[0]!.toGoNm + 1).map((f) => f.toGoNm));
  const near = Math.min(0, ...track.map((p) => p.toGoNm));
  const alts = [...track.map((p) => p.altFt), ...fixes.flatMap((f) => (f.minFt != null && f.toGoNm <= far ? [f.minFt] : []))];
  const low = Math.floor(Math.min(...alts) / 500) * 500,
    high = Math.ceil(Math.max(...alts) / 500) * 500 || low + 500;
  const x = (nm: number) => ((far - nm) / Math.max(0.1, far - near)) * 300;
  const y = (ft: number) => 100 - ((ft - low) / Math.max(1, high - low)) * 100;
  const shown = fixes.filter((f) => f.toGoNm <= far && f.toGoNm >= near);
  const steps = shown.flatMap((f, i) => {
    if (f.minFt == null) return [];
    // A fix's altitude holds from the fix before it to it (AIM 5-4-5).
    const from = i > 0 ? shown[i - 1]!.toGoNm : far;
    return [{ from, to: f.toGoNm, ft: f.minFt }];
  });
  const flown = track.map((p, i) => `${i ? "L" : "M"}${x(p.toGoNm).toFixed(1)} ${y(p.altFt).toFixed(1)}`).join(" ");
  return (
    <figure className="space-y-1 px-3 py-3" data-testid="approach-profile">
      <AltitudeLegend
        high={high}
        keys={[
          { colour: "bg-procedure", label: `Minimums${glidepath ? " · path" : ""}` },
          { colour: "bg-foreground", label: "Flown" },
        ]}
      />
      <svg
        viewBox="0 0 300 100"
        preserveAspectRatio="none"
        className="h-28 w-full"
        role="img"
        aria-label="The track's altitude over the approach's minimums, to the missed approach point"
      >
        {steps.map((s, i) => (
          <line
            key={i}
            x1={x(s.from)}
            x2={x(s.to)}
            y1={y(s.ft)}
            y2={y(s.ft)}
            className="stroke-procedure"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {glidepath && (
          <line
            x1={x(glidepath.fromNm)}
            x2={x(glidepath.toNm)}
            y1={y(glidepath.fromFt)}
            y2={y(glidepath.toFt)}
            className="stroke-procedure"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {shown.map((f) => (
          <line
            key={f.ident}
            x1={x(f.toGoNm)}
            x2={x(f.toGoNm)}
            y1={0}
            y2={100}
            className="stroke-border"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={flown} fill="none" className="stroke-foreground" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {track.map(
          (p, i) =>
            p.off && (
              <line
                key={i}
                x1={x(p.toGoNm)}
                x2={x(p.toGoNm)}
                y1={y(p.altFt) - 0.01}
                y2={y(p.altFt)}
                className="stroke-destructive"
                strokeWidth={4}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ),
        )}
      </svg>
      <div className={cn("relative h-4 text-muted-foreground tabular-nums", TEXT.note)} aria-hidden>
        {shown.map((f) => (
          <span key={f.ident} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(x(f.toGoNm) / 300) * 100}%` }}>
            {f.ident}
          </span>
        ))}
      </div>
      <p className={cn("text-muted-foreground tabular-nums", TEXT.note)}>
        {feet(low)} · {wholeNm(far)} to the MAP
      </p>
    </figure>
  );
}
