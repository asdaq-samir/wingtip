import { memo } from "react";
import { Area, ComposedChart, Line, ReferenceArea, ReferenceDot, XAxis, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "../../components/ui/chart";
import ChartTick from "../../components/chartTick";
import type { RouteProfile } from "../../lib/api/types";
import { altFt } from "../../lib/format";
import { AIRSPACE, airspaceArea, ceilings, type planProfile } from "./profile";

/** A line over the ground: the plan's altitudes (planProfile), a null
 *  height a break in it, which is not drawn across. */
type Line = Omit<ReturnType<typeof planProfile>, "points"> & { points: { along_nm: number; plan_ft: number | null }[] };
import { CHART } from "../../lib/tokens";

const config = {
  ground: { label: "Ground", color: CHART.terrain },
  plan: { label: "Plan", color: "var(--primary)" },
} satisfies ChartConfig;

/**
 * The route from the side: the ground under it, the Class B, C and D it
 * passes through as boxes from floor to ceiling, and the plan's
 * altitudes over them with its tops of climb and descent -- an EFB's
 * profile view. The plan's distances are its legs', checkpoint to
 * checkpoint, laid onto the straight route the ground is sampled along.
 * Recharts, as the console's charts are, and loaded with the section.
 */
// Drawn again only when its profile or its plan is new (memo): recharts
// measures a line's whole length at every draw.
export default memo(function ProfileChart({ profile, plan, className }: { profile: RouteProfile; plan: Line; className?: string }) {
  const scale = plan.length_nm > 0 ? profile.length_nm / plan.length_nm : 1;
  // The line in pieces, a null height ending one: each piece its own
  // series, joined over the ground's rows between its points, never
  // across a break. The plan is one piece, "plan".
  const pieces: string[] = ["plan"];
  const lineRows = plan.points.flatMap((p) => {
    if (p.plan_ft === null) {
      pieces.push(`plan${pieces.length}`);
      return [];
    }
    return [{ x: p.along_nm * scale, [pieces.at(-1)!]: p.plan_ft }];
  });
  const data = [...profile.terrain.map((t) => ({ x: t.along_nm, ground: t.ground_ft })), ...lineRows].sort((a, b) => a.x - b.x);
  // The airspace's ceilings over the plan's line, as the pill's side view
  // has them (MiniProfile), at the owner's ask.
  const highest = Math.max(
    0,
    ...profile.terrain.map((t) => t.ground_ft),
    ...plan.points.map((p) => p.plan_ft ?? 0),
    ...ceilings(profile.airspace),
  );
  const top = Math.ceil((highest + 1500) / 1000) * 1000;
  return (
    // Its labels on SVG's own leading; its axes' figures are ChartTick's,
    // in the text's colour (recharts' own #666 was 2.8:1 on dark glass).
    <ChartContainer
      config={config}
      data-testid="profile-chart"
      className={className ?? "aspect-auto h-48 w-full [&_text]:[line-height:normal]"}
    >
      <ComposedChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} accessibilityLayer>
        {/* Every tick drawn, plain and unmeasured, as the weight and balance
            envelope's (EnvelopeChart, ChartTick): recharts' own measured each
            in the page. */}
        <XAxis
          type="number"
          dataKey="x"
          domain={[0, profile.length_nm]}
          tickLine={false}
          axisLine={false}
          tickCount={6}
          interval={0}
          tick={(props) => <ChartTick {...props} format={(nm) => `${Math.round(nm)} nm`} />}
        />
        <YAxis
          type="number"
          domain={[0, top]}
          tickLine={false}
          axisLine={false}
          width={44}
          interval={0}
          tick={(props) => <ChartTick {...props} format={(ft) => (ft >= 1000 ? `${ft / 1000}k` : `${ft}`)} />}
        />
        {profile.airspace.map((a, i) => {
          const look = AIRSPACE[a.class] ?? AIRSPACE.D!;
          // Its airport's ident over its widest piece, as the pill's side
          // view has it (MiniProfile), at the owner's ask.
          const label = a.ident || `Class ${a.class}`;
          const widest = profile.airspace.every(
            (b) => (b.ident || `Class ${b.class}`) !== label || b === a || b.to_nm - b.from_nm < a.to_nm - a.from_nm,
          );
          return (
            <ReferenceArea
              key={i}
              {...airspaceArea(
                a,
                look,
                { x1: a.from_nm, x2: a.to_nm, y2: Math.min(a.ceiling_ft ?? top, top) },
                widest ? { text: label, position: "insideTop" } : undefined,
              )}
            />
          );
        })}
        <Area
          dataKey="ground"
          type="monotone"
          connectNulls
          isAnimationActive={false}
          stroke="var(--color-ground)"
          fill="var(--color-ground)"
          fillOpacity={0.45}
        />
        {pieces.map((key) => (
          <Line
            key={key}
            dataKey={key}
            type="linear"
            connectNulls
            dot={false}
            isAnimationActive={false}
            stroke="var(--color-plan)"
            strokeWidth={2.5}
          />
        ))}
        {plan.marks.map((m, i) => (
          <ReferenceDot
            key={i}
            x={m.along_nm * scale}
            y={m.plan_ft}
            r={3.5}
            fill="var(--color-plan)"
            stroke="white"
            label={{ value: `${m.kind} ${altFt(m.plan_ft)}`, position: "top", fontSize: 11, fill: "currentColor" }}
          />
        ))}
      </ComposedChart>
    </ChartContainer>
  );
});
