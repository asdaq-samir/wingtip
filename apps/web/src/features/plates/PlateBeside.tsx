import { useMemo } from "react";
import { cn } from "cn";
import { laidOut, Pages, useFaaChartPages } from "../../components/ChartPages";
import type { PageMark } from "../../lib/diagram";
import { TEXT } from "../../lib/text";
import { PLATE_SHAPE } from "./plateLook";


/**
 * The plate in its card beside the map (PlateCard at a tablet's width):
 * its pages on a map of their own, to pinch in on, own ship (`mark`) on
 * its plan view where its georeference puts it, as full screen. Its room
 * the page's own shape, so nothing moves as it comes; the words where it
 * cannot be had are the full-screen viewer's.
 */
export default function PlateBeside({ title, url, airport, mark }: { title: string; url: string; airport: string; mark: PageMark | null }) {
  const { pages, data, isFetching, isError } = useFaaChartPages(url, airport);
  const layout = useMemo(() => (pages.length ? laidOut(pages) : null), [pages]);
  const first = pages[0];
  return (
    <figure
      aria-label={title}
      data-testid="plate-beside"
      data-own-ship={mark ? "shown" : "none"}
      className="flex flex-col overflow-hidden rounded-xl bg-white dark:bg-black"
      style={{ aspectRatio: first ? `${first.width} / ${first.height}` : PLATE_SHAPE }}
    >
      {layout ? (
        <Pages {...layout} mark={mark} />
      ) : (
        <p className={cn("px-4 pt-4 text-muted-foreground", TEXT.prose)}>
          {isError && !isFetching ? "The FAA's plate could not be had. Try again in a moment." : data ? "The FAA lists no page for this plate." : "Drawing the plate…"}
        </p>
      )}
    </figure>
  );
}
