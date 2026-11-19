import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts";
import { ListGroup, ListRow } from "../../../components/GroupedList";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "../../../components/ui/chart";
import { api } from "../../../lib/api/client";
import { mae } from "./devWords";

/** The scikit-learn models retrain() grid-searched for the one
 *  serving, each by its 5-fold CV error, sorted best-first. */
const modelComparisonChartConfig = { score: { label: "MAE", color: "var(--chart-1)" } } satisfies ChartConfig;

// Go's green, as the dot of the promoted model's own Promoted badge
// (StatusBadge's "up") -- the promoted one's bar reads as such at a
// glance, not just on hover.
const PROMOTED_BAR_COLOR = "var(--go)";

export function ModelComparison() {
  const { data, error } = useQuery({ queryKey: ["modelComparison"], queryFn: api.modelComparison });
  // A model with no score sorts last, not first.
  const rows = data ? [...data.models].sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity)) : null;

  // A group of its own, the chart its one row and what it shows in the
  // note under it, as the tab's other groups are.
  return (
    <ListGroup
      title="Model comparison"
      footer={`Error on the ${data?.n_labeled ?? "—"} ratings, lower is better; green is the model serving.`}
    >
      {/* Status, not reading text: grey, as a placeholder is, and said to a
          screen reader when it changes. */}
      {!error && !rows && (
        <ListRow
          title={
            <span role="status" className="text-muted-foreground">
              Reading each model's metrics…
            </span>
          }
        />
      )}
      {rows?.length === 0 && (
        <ListRow
          title={
            <span role="status" className="text-muted-foreground">
              No trained models are available.
            </span>
          }
        />
      )}
      {rows && rows.length > 0 && (
        <div className="px-1 py-3">
          <ChartContainer
            config={modelComparisonChartConfig}
            // The models' names read in the text's colour: recharts' own
            // #666 (the stock tick rule no longer reaches recharts 3's
            // ticks) was 3.1:1 on the panel in the dark.
            className="aspect-auto w-full [&_.recharts-cartesian-axis-tick-value]:fill-foreground"
            style={{ height: Math.max(rows.length * 36, 120) }}
          >
            {/* right margin: room for each bar's own MAE label past its
              end -- the number is the point of the chart, and a hover
              tooltip alone leaves a phone reader with unlabeled bars. */}
            <BarChart accessibilityLayer data={rows} layout="vertical" margin={{ left: 12, right: 48 }}>
              <XAxis type="number" dataKey="score" hide />
              <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tickMargin={8} width={110} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(value, _name, item) => (
                      <div className="flex w-full items-center gap-2">
                        <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
                        <span className="text-muted-foreground">MAE</span>
                        <div className="ml-auto flex items-baseline gap-1 font-mono font-medium text-foreground tabular-nums">
                          {mae(Number(value))}
                          <span className="font-sans font-normal text-muted-foreground">CV</span>
                        </div>
                      </div>
                    )}
                  />
                }
              />
              {/* No entry animation: the bars grew in for 400 ms after the
                data had arrived, and the numbers are the point. */}
              <Bar dataKey="score" radius={4} isAnimationActive={false}>
                {rows.map((m) => (
                  <Cell key={m.name} fill={m.promoted ? PROMOTED_BAR_COLOR : "var(--color-score)"} />
                ))}
                <LabelList
                  dataKey="score"
                  position="right"
                  offset={8}
                  fontSize={12}
                  className="fill-foreground"
                  formatter={(value) => (typeof value === "number" ? mae(value) : "")}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      )}
    </ListGroup>
  );
}
