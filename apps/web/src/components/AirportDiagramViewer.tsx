import { useMemo, type ReactNode } from "react";
import { Button } from "./ui/button";
import type { PageMark } from "../lib/diagram";
import { TEXT } from "../lib/text";
import { cn } from "cn";
import FullScreenViewer from "./FullScreenViewer";
import { WORDING } from "../lib/wording/generated/wording";
import { Pages } from "./ChartPages";
import { laidOut, useFaaChartPages, type Page, type PageRing } from "./chartLayout";

export type { Page };

/**
 * One of the FAA's charts full screen, to pinch in on as the chart is: its
 * pages on a MapLibre map of their own (Pages), one under
 * another, so a pinch, a drag and a double tap do what they do on the
 * chart and the pages stay on the screen. In the app, at the pilot's ask,
 * where a chart was a link out to the FAA's site and its PDF. A modal
 * dialog, the map behind it waiting; the close in the corner every panel
 * has it in.
 */
export default function ChartViewer({
  title,
  pages,
  loading = false,
  failed = false,
  onRetry,
  mark = null,
  rings,
  banner,
  onClose,
}: {
  title: string;
  pages: Page[];
  /** Its pages still being asked for (FaaChartViewer). */
  loading?: boolean;
  failed?: boolean;
  /** Asks again after a failure, beside the failure. */
  onRetry?: () => void;
  /** Own ship on the first page (an approach plate's plan view, an
   *  airport diagram). */
  mark?: PageMark | null;
  /** Rings on the first page: an airport diagram's hot spots. */
  rings?: PageRing[];
  /** A line over the pages, under the title: the runway advisor's. */
  banner?: ReactNode;
  onClose: () => void;
}) {
  const layout = useMemo(() => (pages.length ? laidOut(pages) : null), [pages]);
  return (
    <FullScreenViewer title={title} testId="airport-diagram-viewer" closeTestId="airport-diagram-close" onClose={onClose}>
      {banner}
      {layout ? (
        <Pages {...layout} mark={mark} rings={rings} />
      ) : (
        <div className="flex flex-col items-start gap-2 px-4 pt-4" data-testid="chart-viewer-status">
          <p className={cn("text-muted-foreground", TEXT.prose)}>
            {failed
              ? "The FAA's chart could not be fetched. Try again in a moment."
              : loading
                ? "Drawing the chart…"
                : // A booklet lists a field only where it has an entry (takeoff
                  // minimums, alternates, hot spots).
                  "The FAA lists nothing for this field in this chart."}
          </p>
          {failed && onRetry && (
            <Button type="button" variant="ghost" className="relative -ml-2 rounded-full text-tint hit-1" onClick={onRetry}>
              {WORDING.tryAgain}
            </Button>
          )}
        </div>
      )}
    </FullScreenViewer>
  );
}

/** One of the FAA's charts by its address (a card's approaches, the
 *  Chart Supplement): its pages asked of the planner (/api/faa-chart),
 *  which draws them and, of a region's booklet, picks the field's. */
export function FaaChartViewer({
  title,
  url,
  airport,
  mark = null,
  onClose,
}: {
  title: string;
  url: string;
  airport: string;
  mark?: PageMark | null;
  onClose: () => void;
}) {
  const { pages, isFetching, isError, data, refetch } = useFaaChartPages(url, airport);
  return (
    <ChartViewer
      title={title}
      pages={pages}
      loading={isFetching && !data}
      failed={isError && !isFetching}
      onRetry={() => {
        void refetch();
      }}
      mark={mark}
      onClose={onClose}
    />
  );
}
