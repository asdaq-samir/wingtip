import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import { cn } from "cn";
import { BADGE } from "../lib/rowBadges";

/**
 * A row's glyph on a rounded square of its own colour, as iOS's Settings
 * and Maps lead a row with one: a card's rows -- a field's frequencies,
 * its weather and runways, its charts, the airspace over a point -- each
 * said by its kind at a glance, as Nearest's rows lead with the field's
 * mark (the pilot liked those, and asked for every card to read so).
 * White on the colour in light and dark alike; the glyph's meaning is
 * also in the row's words.
 */
export function RowBadge({
  colour,
  round = false,
  children,
}: {
  colour: string;
  /** A disc, as Apple Maps' account card leads its rows (You). */
  round?: boolean;
  children: ReactNode;
}) {
  return (
    // The glyph in rem as the square is (18 in 28 at a 16 px root), so the
    // two grow together with the pilot's text size; at 18 px it stayed put
    // while the square grew round it. Both
    // are tokens: size.row-badge and size.glyph-badge.
    <span
      aria-hidden="true"
      className={cn(
        "grid size-(--size-row-badge) shrink-0 place-items-center text-white [&_svg]:size-(--size-glyph-badge)",
        round ? "rounded-full" : "rounded-(--radius-badge)",
      )}
      style={{ backgroundColor: colour }}
    >
      {children}
    </span>
  );
}

/** A chart's badge: the FAA's charts and the Chart Supplement, on every
 *  card that lists them. */
export function ChartBadge() {
  return (
    <RowBadge colour={BADGE.chart}>
      <FileText />
    </RowBadge>
  );
}
