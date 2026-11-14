import { cn } from "cn";
import { TEXT } from "../lib/text";

/**
 * An axis's figure as a plain SVG text, for recharts' `tick`: its own
 * Text measured every figure's words in the page to wrap them -- a forced
 * layout apiece of a page holding every tab of the planning panel, which
 * was most of a second of a phone's main thread on opening Performance
 * (measured at a quarter of a laptop's speed). In the text's colour, at
 * a note's size (TEXT.note), set off the axis as recharts sets its own.
 */
export default function ChartTick({
  x,
  y,
  payload,
  textAnchor,
  orientation,
  format = String,
}: {
  x?: number | string;
  y?: number | string;
  payload?: { value: number };
  textAnchor?: string;
  orientation?: string;
  format?: (value: number) => string;
}) {
  if (payload === undefined) return null;
  // Under an X axis a line down, beside a Y axis half a line: recharts' own.
  // 12 as an axis's figures are (text-xs, outside the type scale on
  // purpose): a chart's labels, not text to read, and drawn at its size.
  const dy = orientation === "bottom" ? "0.71em" : orientation === "top" ? "-0.2em" : "0.355em";
  return (
    <text
      x={x}
      y={y}
      dy={dy}
      textAnchor={textAnchor as "start" | "middle" | "end" | undefined}
      className={cn("fill-foreground text-foreground", TEXT.note)}
    >
      {format(payload.value)}
    </text>
  );
}
