import { cn } from "cn";
import { GLASS } from "../../lib/mapChrome";
import { TEXT } from "../../lib/text";
import { CameraMenu, DataBlock, ReplayTimeline, STUDIO_SPEEDS, type ReplayTrack } from "../replay";
import { StudioProfile } from "./StudioProfile";

/**
 * What the Studio lays over its map, the shared replay parts: the data
 * block at the top left, and at the foot, over the sheet at rest, one
 * glass card with the altitude profile over the ground and the timeline
 * under it, the camera menu among its controls. Where the weather flow's bar
 * stands on the planner (FlowBar), the same insets from the sheet and
 * clear of the map's buttons either side.
 */
export function StudioOverlay({ track, ground }: { track: ReplayTrack; ground: { along_nm: number; ground_ft: number }[] }) {
  return (
    <>
      <div className="pointer-events-none absolute top-[calc(max(0.5rem,env(safe-area-inset-top))+var(--map-inset-top,0px))] left-[calc(max(0.5rem,env(safe-area-inset-left))+var(--map-inset-left,0px))] z-[1000]">
        <DataBlock track={track} />
      </div>
      <div className="pointer-events-none absolute right-[calc(max(0.5rem,env(safe-area-inset-right))+3.25rem)] bottom-[calc(max(env(safe-area-inset-bottom),var(--map-inset-bottom,0px))+0.75rem)] left-[calc(max(0.5rem,env(safe-area-inset-left))+var(--map-inset-left,0px)+3.25rem)] z-[1000] flex justify-center">
        <div
          className={cn(GLASS, "pointer-events-auto flex w-[min(100%,40rem)] flex-col gap-1.5 rounded-(--radius-card) px-3 pt-2 pb-2")}
          data-testid="studio-replay"
        >
          <div className="flex items-center justify-between gap-2">
            <span className={cn("truncate font-semibold", TEXT.note)}>{track.label}</span>
            {track.credit && <span className={cn("shrink-0 text-muted-foreground", TEXT.caption)}>{track.credit}</span>}
          </div>
          <StudioProfile track={track} ground={ground} className="h-20" />
          <ReplayTimeline label="Replay" speeds={STUDIO_SPEEDS} gaps={track.gaps} testId="studio-timeline">
            <CameraMenu testId="studio-camera" />
          </ReplayTimeline>
        </div>
      </div>
    </>
  );
}
