import { lazy, Suspense } from "react";
import { cn } from "cn";
import type { Page } from "../../components/chartLayout";
import { TEXT } from "../../lib/text";
import { useDiagramAdvisor } from "./useDiagramAdvisor";

const ChartViewer = lazy(() => import("../../components/AirportDiagramViewer"));

/** The planning aid's words with the FAA's credit, as the phones' diagram says them. */
const AID = "FAA · Planning aid, not for navigation";

/**
 * The FAA's airport diagram full screen with the airplane on it (the
 * card's Airport diagram; the phones' DiagramOwnShipView): own ship a
 * circle where it has no track (AC 120-76D 11.17.2.2), the hot spots
 * ringed, and the runway advisor's line over the page. For the pilot's
 * awareness on the ground, not for taxiing by: the signs, the markings and
 * ATC's instructions are what count (AC 120-74B; AC 120-76D 11.17.1).
 */
export default function AdvisedDiagram({
  ident,
  title,
  url,
  page,
  onClose,
}: {
  ident: string;
  title: string;
  url?: string | null;
  page: Page;
  onClose: () => void;
}) {
  const vm = useDiagramAdvisor(ident, url);
  const advice = vm.advice?.shown ? vm.advice : null;
  const banner = (
    <div className="flex flex-col gap-0.5 px-4 pb-2" data-testid="runway-advisor" data-state={vm.advice?.state ?? "none"}>
      {advice && (
        <p role="status" className={cn("font-semibold", advice.closed ? "text-destructive" : "text-foreground", TEXT.heading)}>
          {advice.shown}
        </p>
      )}
      {vm.advice?.detail && <p className={cn("text-muted-foreground", TEXT.detail)}>{vm.advice.detail}</p>}
      <p className={cn("text-muted-foreground", TEXT.note)} data-testid="runway-advisor-note">
        {vm.note ? `${vm.note} ${AID}` : AID}
      </p>
    </div>
  );
  return (
    <Suspense fallback={null}>
      <ChartViewer title={title} pages={[page]} mark={vm.mark} rings={vm.rings} banner={banner} onClose={onClose} />
    </Suspense>
  );
}
