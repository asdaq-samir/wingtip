import type { SketchRunway } from "./runwayDrawing";
import { TEXT } from "../../lib/text";
import { cn } from "cn";
import FullScreenViewer from "../../components/FullScreenViewer";
import { RunwaySketch } from "./RunwaySketch";

/**
 * A field's runways full screen, the card's own sketch of them
 * (RunwaySketch), for a field the FAA draws no airport diagram for: its
 * Diagrams tab's Airport diagram row opens it, at the pilot's ask, as it
 * opens the FAA's where there is one -- the same full screen as the FAA's
 * charts (ChartViewer), its title and close where they are. Marked as
 * ours, the app's mark and name faint in its corner as a watermark, and
 * one short line under it that it is not the FAA's (the owner,
 * 2026-11-20: "I want to minimize the note at the bottom and also
 * somewhere mention our watermark"), where three lines told how it was
 * drawn.
 */
export default function SketchViewer({
  ident,
  runways,
  lat,
  lon,
  onClose,
}: {
  ident: string;
  runways: SketchRunway[];
  lat: number;
  lon: number;
  onClose: () => void;
}) {
  return (
    <FullScreenViewer title={`${ident} runways`} testId="airport-sketch-viewer" closeTestId="airport-sketch-close" onClose={onClose}>
      <div className="relative min-h-0 flex-1 text-foreground">
        <RunwaySketch runways={runways} lat={lat} lon={lon} numbers="row" />
        <span
          aria-hidden="true"
          className={cn("pointer-events-none absolute right-4 bottom-2 flex items-center gap-1.5 opacity-50", TEXT.note)}
          data-testid="airport-sketch-watermark"
        >
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-5" />
          Wingtip Maps
        </span>
      </div>
      <p className={cn("shrink-0 truncate px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] text-muted-foreground", TEXT.note)}>
        Wingtip Maps sketch, north up, to scale. Not an FAA diagram.
      </p>
    </FullScreenViewer>
  );
}
