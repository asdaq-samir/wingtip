import type { ComponentType } from "react";
import { EyeOff, Maximize2, Square, SquareDashed } from "lucide-react";
import { CardAction } from "../../components/CardAction";
import { ListGroup } from "../../components/GroupedList";
import SwitchRow from "../../components/SwitchRow";
import { Slider } from "../../components/ui/slider";
import type { PageMark } from "../../lib/diagram";
import { MapCard } from "../../lib/map/cards/MapCard";
import { LEAST_PLATE_OPACITY } from "./plateLook";
import { usePlateCard } from "./usePlateCard";

/** The app's viewer of one of the FAA's charts, full screen (the plan's
 *  FaaChart): handed in by the map that draws the plates, so this feature
 *  needs nothing of the plan's; `mark` own ship on its first page. */
export type ChartViewer = ComponentType<{ title: string; url: string; airport: string; mark?: PageMark | null; onClose: () => void }>;

/**
 * A plate's card, a tap on its page on the map opening it (ForeFlight's
 * plate card, the owner's screenshot, 2026-11-11): the plate's name, Hide
 * Plate and View Full Screen side by side, the tags on the approach's
 * fixes and the night's inverted colours as the stock switches, and how
 * solid the page is on the stock slider from clear to solid, an icon at
 * each end. Full screen, the pilot's position is on the plate's plan view. The card rule's one card over the search, ✕ at its right
 * (docs/design/rules.md), as the iPhone's and Android's.
 */
export function PlateCard({ airport, id, viewer: Viewer }: { airport: string; id: string; viewer: ChartViewer }) {
  const vm = usePlateCard(airport, id);
  return (
    <MapCard title={vm.title}>
      <div className="flex flex-col gap-3" data-testid="plate-card">
        <div className="grid grid-cols-2 gap-2">
          <CardAction icon={<EyeOff />} label="Hide Plate" onClick={vm.hide} testId="plate-hide" />
          <CardAction
            icon={<Maximize2 />}
            label="View Full Screen"
            onClick={vm.openFullScreen}
            disabled={!vm.chartUrl}
            testId="plate-full-screen"
          />
        </div>
        <ListGroup>
          <SwitchRow title="Show Annotations" on={vm.annotations} onChange={vm.setAnnotations} testId="plate-annotations" />
          <SwitchRow title="Invert Plate Colors" on={vm.inverted} onChange={vm.setInverted} testId="plate-invert" />
        </ListGroup>
        {/* Continuous, so a slider (the owner circled ForeFlight's): its
            ends a clear page and a solid one. */}
        <ListGroup title="Transparency">
          <div className="flex items-center gap-3 px-4 py-3">
            <SquareDashed className="size-5 shrink-0 text-muted-foreground" aria-label="Clear" />
            <Slider
              value={vm.opacity}
              min={LEAST_PLATE_OPACITY}
              max={1}
              step={0.05}
              onValueChange={(v) => vm.setOpacity(Array.isArray(v) ? v[0]! : v)}
              // Base UI's own value text from its format: "65%".
              format={{ style: "percent" }}
              thumb={{ "aria-label": "Plate transparency" }}
              data-testid="plate-opacity"
            />
            <Square className="size-5 shrink-0 fill-current text-muted-foreground" aria-label="Solid" />
          </div>
        </ListGroup>
      </div>
      {vm.fullScreen && vm.chartUrl && (
        <Viewer title={vm.title} url={vm.chartUrl} airport={airport} mark={vm.mark} onClose={vm.closeFullScreen} />
      )}
    </MapCard>
  );
}
